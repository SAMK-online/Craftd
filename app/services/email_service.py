"""
Email finding via Prospeo (enrich-person API).

Given a name + company (ideally the company domain we learn during web research),
find a verified work email.

Prospeo Enrich Person API:
  POST https://api.prospeo.io/enrich-person
  Headers: X-KEY: <api_key>, Content-Type: application/json
  Body:    {"data": {"first_name","last_name","company_website" | "company_name"},
            "only_verified_email": true}
  Response: person.email.{email,status,revealed}  (1 credit charged only when found)

We request verified-only emails and additionally reject any masked / undeliverable
result, so we never surface an address we can't trust.

Returns None when Prospeo is unconfigured, rate-limited, or no usable email is
found, so enrichment degrades cleanly.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

PROSPEO_URL = "https://api.prospeo.io/enrich-person"

# Deliverability statuses we accept.
BAD_STATUSES = {"INVALID", "UNDELIVERABLE", "FAILED", "DO_NOT_EMAIL"}


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in full_name.strip().split() if p]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    if parts:
        return parts[0], ""
    return "", ""


def domain_from_website(website: str | None) -> str | None:
    """Extract a bare domain (example.com) from a website URL, if present."""
    if not website:
        return None
    raw = website.strip()
    if "://" not in raw:
        raw = "https://" + raw
    host = urlparse(raw).netloc or ""
    host = host.split("@")[-1].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host or None


def _find_person(data: dict) -> dict | None:
    """Locate the person object across possible response wrappers."""
    if not isinstance(data, dict):
        return None
    for candidate in (
        data.get("response", {}).get("person") if isinstance(data.get("response"), dict) else None,
        data.get("person"),
        data.get("response"),
    ):
        if isinstance(candidate, dict) and "email" in candidate:
            return candidate
    return None


async def find_email(
    name: str,
    company: str,
    domain: str | None = None,
) -> tuple[str, str] | None:
    """Find a verified email. Returns (email, status) or None."""
    settings = get_settings()
    if not settings.prospeo_configured:
        return None

    first, last = _split_name(name)
    if not first or not last:
        return None  # enrich-person needs a full name + company

    # Identity datapoints go under `data`; options sit alongside it.
    data_fields: dict = {"first_name": first, "last_name": last}
    if domain:
        data_fields["company_website"] = domain
    else:
        data_fields["company_name"] = company
    payload: dict = {"data": data_fields, "only_verified_email": True}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                PROSPEO_URL,
                json=payload,
                headers={"X-KEY": settings.prospeo_api_key, "Content-Type": "application/json"},
                timeout=20.0,
            )
        if resp.status_code == 429:
            logger.warning("Prospeo rate limit hit for %s @ %s", name, domain or company)
            return None
        if resp.status_code != 200:
            # NO_MATCH is a normal "no verified email found" outcome (not charged).
            code = ""
            try:
                code = str(resp.json().get("error_code", ""))
            except ValueError:
                pass
            if code == "NO_MATCH":
                logger.info("Prospeo: no verified email for %s @ %s", name, domain or company)
            else:
                logger.warning("Prospeo HTTP %s: %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
    except httpx.HTTPError as e:
        logger.error("Prospeo request failed: %s", e)
        return None
    except ValueError:
        logger.error("Prospeo returned non-JSON response")
        return None

    person = _find_person(data)
    email_obj = person.get("email") if person else None
    if not isinstance(email_obj, dict):
        logger.info("Prospeo: no email for %s @ %s", name, domain or company)
        return None

    email = email_obj.get("email")
    status = str(email_obj.get("status") or "UNKNOWN").upper()
    revealed = email_obj.get("revealed", True)

    # Reject masked, missing, or undeliverable emails.
    if not email or "*" in email or not revealed or status in BAD_STATUSES:
        logger.info(
            "Prospeo email not usable for %s (revealed=%s status=%s)", name, revealed, status
        )
        return None

    logger.info("Prospeo found email for %s @ %s (status=%s)", name, domain or company, status)
    return email, status

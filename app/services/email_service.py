"""
Email finding via Prospeo.

Given a name + company (or, better, the company domain we already learn during
web research), find a verified work email with a deliverability status.

Prospeo Email Finder API:
  POST https://api.prospeo.io/email-finder
  Headers: X-KEY: <api_key>, Content-Type: application/json
  Body:    {"first_name": "...", "last_name": "...", "company": "<domain or name>"}
  Response: {"error": false, "response": {...email + status...}}  (error=true on failure)

The exact response field names vary, so the parser is tolerant and logs the raw
payload once so the mapping can be tightened against real data.

Returns None when Prospeo is unconfigured or no email is found, so enrichment
degrades cleanly.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

PROSPEO_URL = "https://api.prospeo.io/email-finder"

# Prospeo deliverability statuses we consider safe to show / send to.
ACCEPTABLE_STATUSES = {"VERIFIED", "VALID", "ACCEPT_ALL", "CATCH_ALL", "DELIVERABLE"}


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


def _extract_email(resp_obj: dict) -> tuple[str, str] | None:
    """Pull (email, status) out of Prospeo's response object, tolerantly."""
    email = (
        resp_obj.get("email")
        or resp_obj.get("verified_email")
        or resp_obj.get("work_email")
    )
    if not email:
        return None
    status = (
        resp_obj.get("email_status")
        or resp_obj.get("verification_status")
        or resp_obj.get("status")
        or resp_obj.get("deliverability")
        or "UNKNOWN"
    )
    return str(email), str(status).upper()


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
    if not first:
        return None

    # Prospeo accepts a domain or a company name in `company`; prefer the domain.
    company_field = domain or company
    payload = {"first_name": first, "last_name": last, "company": company_field}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                PROSPEO_URL,
                json=payload,
                headers={"X-KEY": settings.prospeo_api_key, "Content-Type": "application/json"},
                timeout=15.0,
            )
        if resp.status_code != 200:
            logger.warning("Prospeo returned HTTP %s for %s @ %s", resp.status_code, name, company_field)
            return None
        data = resp.json()
    except httpx.HTTPError as e:
        logger.error("Prospeo request failed: %s", e)
        return None
    except ValueError:
        logger.error("Prospeo returned non-JSON response")
        return None

    if data.get("error"):
        logger.info("Prospeo: no email found for %s @ %s", name, company_field)
        return None

    resp_obj = data.get("response") or {}
    if not isinstance(resp_obj, dict):
        return None

    result = _extract_email(resp_obj)
    if not result:
        logger.info("Prospeo response had no email field: keys=%s", list(resp_obj.keys()))
        return None

    email, status = result
    logger.info("Prospeo found email for %s @ %s (status=%s)", name, company_field, status)
    return email, status

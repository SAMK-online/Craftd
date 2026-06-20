"""
Clay Enrichment Service — push-and-store ("async enrichment") mode.

Why this design:
    Clay has no developer-facing API to read table rows back, and its outbound
    HTTP API column (which would POST enriched rows to us) is gated behind the
    Growth plan. So we cannot pull Clay enrichment into the live ~20s brief on
    lower plans.

    Instead, Clay runs as the asynchronous enrichment / CRM layer:
      1. We POST each contact to the Clay table webhook (fire-and-forget).
      2. Clay creates the row and enriches it in the table (People/Company
         enrichment columns), where it can be viewed and exported later.
      3. The live brief proceeds immediately on public data + job-board signals,
         using a minimal EnrichmentResult built from what we already know.

    If you later upgrade to Clay Growth and add an outbound HTTP API column,
    the live read-back path can be reintroduced via a callback endpoint
    (correlation-id rendezvous) — see git history for the previous polling code.

Clay setup required:
    - A Clay table with columns: name, company, title, email, linkedin_url
    - Person / Company enrichment columns configured on that table
    - A "import from webhook" source connected to the table
"""
from __future__ import annotations

import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.models.pipeline import (
    CompanyEnrichment,
    EnrichmentResult,
    PersonEnrichment,
)

logger = logging.getLogger(__name__)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
)
async def _post_contact_to_clay(
    client: httpx.AsyncClient,
    webhook_url: str,
    payload: dict,
) -> None:
    """Fire-and-forget POST of a contact to the Clay table webhook.

    Clay's import-from-webhook source ingests the row asynchronously and may
    return an empty / non-JSON body; any 2xx means the contact was accepted.
    Non-2xx raises (and is retried) so transient failures don't silently drop
    contacts from the Clay table.
    """
    resp = await client.post(webhook_url, json=payload, timeout=10.0)
    resp.raise_for_status()
    logger.info("Contact accepted by Clay webhook (status %s)", resp.status_code)


async def enrich_contact(
    name: str,
    company: str,
    title: str | None = None,
    email: str | None = None,
    linkedin_url: str | None = None,
) -> EnrichmentResult | None:
    """
    Push a contact into Clay for asynchronous enrichment, then return a minimal
    EnrichmentResult so the live brief can proceed immediately.

    Returns None only when Clay is not configured, so the pipeline can fall back
    cleanly. A failed push still yields minimal enrichment (the contact data we
    already hold) rather than blocking the brief.
    """
    settings = get_settings()

    if not settings.clay_configured:
        logger.warning(
            "Clay not configured - skipping enrichment (set CLAY_API_KEY + CLAY_TABLE_WEBHOOK_URL)"
        )
        return None

    payload = {
        "name": name,
        "company": company,
        "title": title or "",
        "email": email or "",
        "linkedin_url": linkedin_url or "",
    }

    async with httpx.AsyncClient() as client:
        try:
            logger.info("Sending %s @ %s to Clay for async enrichment", name, company)
            await _post_contact_to_clay(client, settings.clay_table_webhook_url, payload)
        except httpx.HTTPError as e:
            # Don't fail the brief if the push fails - we still have the basics.
            logger.error("Clay webhook push failed: %s", e)
        except Exception as e:
            logger.error("Clay enrichment push errored: %s", e, exc_info=True)

    return _build_minimal_enrichment(name, company, title, email, linkedin_url)


def _build_minimal_enrichment(
    name: str,
    company: str,
    title: str | None,
    email: str | None,
    linkedin_url: str | None,
) -> EnrichmentResult:
    """Enrichment from what we already know.

    Confidence is held at 0.1 to mark this as 'pushed to Clay, deep enrichment
    pending in the table' rather than a fully enriched record. report_service
    treats confidence <= 0.1 as 'enrichment not used' in the live brief.
    """
    return EnrichmentResult(
        person=PersonEnrichment(
            full_name=name,
            title=title,
            company=company,
            verified_email=email,
            linkedin_url=linkedin_url,
        ),
        company=CompanyEnrichment(name=company),
        enrichment_confidence=0.1,
    )

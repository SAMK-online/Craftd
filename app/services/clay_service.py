"""
Clay Enrichment Service.

Flow:
1. POST contact data to your Clay table webhook (triggers enrichment row)
2. Poll Clay's table API until the row is enriched (or timeout)
3. Map the enriched row back to our typed EnrichmentResult model

Clay setup required:
- A Clay table with columns: name, company, title
- Enrichments configured: People Data Labs (person) + Clearbit/Apollo (company)
- A webhook source connected to that table
- The table's API ID noted for polling
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.models.pipeline import (
    CompanyEnrichment,
    EnrichmentResult,
    FundingStage,
    PersonEnrichment,
)

logger = logging.getLogger(__name__)


# ─── Clay API helpers ─────────────────────────────────────────────────────────

def _parse_funding_stage(raw: str | None) -> FundingStage:
    if not raw:
        return FundingStage.UNKNOWN
    raw = raw.lower().replace("-", "_").replace(" ", "_")
    for stage in FundingStage:
        if stage.value in raw:
            return stage
    if "series" in raw:
        return FundingStage.SERIES_C_PLUS
    return FundingStage.UNKNOWN


def _safe_int(val: Any) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _map_clay_row_to_enrichment(row: dict) -> EnrichmentResult:
    """
    Map a Clay table row to our typed models.
    Adjust field names to match your actual Clay column IDs.
    """
    # Person fields (adjust these keys to match your Clay column IDs)
    person = PersonEnrichment(
        full_name=row.get("full_name") or row.get("name") or "",
        title=row.get("job_title") or row.get("title"),
        company=row.get("company_name") or row.get("company"),
        linkedin_url=row.get("linkedin_url") or row.get("person_linkedin_url"),
        verified_email=row.get("work_email") or row.get("email"),
        location=row.get("location") or row.get("city"),
        summary=row.get("linkedin_summary") or row.get("bio"),
        skills=_parse_list_field(row.get("skills")),
        years_at_company=_safe_float(row.get("years_at_current_company")),
        previous_companies=_parse_list_field(row.get("previous_companies")),
    )

    # Company fields
    company = CompanyEnrichment(
        name=row.get("company_name") or row.get("company") or "",
        description=row.get("company_description") or row.get("company_overview"),
        industry=row.get("company_industry") or row.get("industry"),
        employee_count=row.get("company_employee_count") or row.get("headcount"),
        funding_stage=_parse_funding_stage(row.get("company_funding_stage")),
        total_funding_usd=_safe_int(row.get("company_total_funding")),
        tech_stack=_parse_list_field(row.get("company_tech_stack") or row.get("technologies")),
        recent_news_headlines=_parse_list_field(row.get("company_recent_news")),
        website=row.get("company_website") or row.get("website"),
        linkedin_company_url=row.get("company_linkedin_url"),
        hiring_signal=bool(row.get("company_is_hiring") or row.get("hiring_signal")),
    )

    # Confidence: proportion of key fields populated
    key_fields = [
        person.full_name, person.title, person.linkedin_url,
        person.verified_email, company.description, company.industry,
    ]
    confidence = sum(1 for f in key_fields if f) / len(key_fields)

    return EnrichmentResult(
        person=person,
        company=company,
        enrichment_confidence=confidence,
        raw_clay_response=row,
    )


def _parse_list_field(val: Any) -> list[str]:
    if not val:
        return []
    if isinstance(val, list):
        return [str(v) for v in val if v]
    if isinstance(val, str):
        # Clay sometimes returns comma-separated strings
        return [s.strip() for s in val.split(",") if s.strip()]
    return []


def _safe_float(val: Any) -> float | None:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ─── Main enrichment call ─────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
)
async def _post_to_clay_webhook(
    client: httpx.AsyncClient,
    webhook_url: str,
    payload: dict,
) -> str:
    """POST contact to Clay table webhook. Returns the row_id Clay assigns."""
    resp = await client.post(webhook_url, json=payload, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    # Clay webhooks return {"row_id": "..."} or similar - adjust to your table
    row_id = data.get("row_id") or data.get("id") or data.get("rowId")
    if not row_id:
        logger.warning("Clay webhook response missing row_id: %s", data)
    return str(row_id) if row_id else ""


async def _poll_clay_row(
    client: httpx.AsyncClient,
    api_key: str,
    table_id: str,
    row_id: str,
    timeout_seconds: int,
) -> dict:
    """
    Poll Clay table API until the enrichment row is complete.
    Clay enrichment is async - rows need a few seconds to populate.
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    url = f"https://api.clay.com/v3/tables/{table_id}/rows/{row_id}"
    deadline = time.monotonic() + timeout_seconds
    poll_interval = 1.5  # seconds between polls

    while time.monotonic() < deadline:
        resp = await client.get(url, headers=headers, timeout=10.0)
        if resp.status_code == 200:
            row = resp.json()
            # Check if enrichment is complete: Clay marks rows with a status field
            status = row.get("status") or row.get("enrichment_status", "complete")
            if status not in ("pending", "running", "processing"):
                logger.info("Clay row %s enriched with status: %s", row_id, status)
                return row
            logger.debug("Clay row %s still processing, polling again in %.1fs", row_id, poll_interval)
        else:
            logger.warning("Clay poll returned %s for row %s", resp.status_code, row_id)

        await asyncio.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.3, 4.0)  # gentle backoff

    raise TimeoutError(f"Clay enrichment timed out after {timeout_seconds}s for row {row_id}")


async def enrich_contact(
    name: str,
    company: str,
    title: str | None = None,
    email: str | None = None,
    linkedin_url: str | None = None,
) -> EnrichmentResult | None:
    """
    Main entry point: enrich a contact via Clay.
    Returns None if Clay is not configured or enrichment fails,
    so the pipeline can gracefully fall back.
    """
    settings = get_settings()

    if not settings.clay_configured:
        logger.warning("Clay not configured - skipping enrichment (set CLAY_API_KEY + CLAY_TABLE_WEBHOOK_URL)")
        return None

    # Your Clay table ID - extract from your Clay table URL:
    # https://app.clay.com/workspaces/.../tables/TABLE_ID
    # You can also set this as an env var
    table_id = getattr(settings, "clay_table_id", "")
    if not table_id:
        logger.warning("CLAY_TABLE_ID not set - cannot poll for results, sending webhook only")

    payload = {
        "name": name,
        "company": company,
        "title": title or "",
        "email": email or "",
        "linkedin_url": linkedin_url or "",
    }

    async with httpx.AsyncClient() as client:
        try:
            logger.info("Triggering Clay enrichment for %s @ %s", name, company)
            row_id = await _post_to_clay_webhook(
                client, settings.clay_table_webhook_url, payload
            )

            if not row_id or not table_id:
                # Webhook-only mode: no polling, return minimal enrichment
                logger.info("Clay webhook triggered but cannot poll (no table_id or row_id)")
                return _build_minimal_enrichment(name, company, title, email, linkedin_url)

            row = await _poll_clay_row(
                client,
                settings.clay_api_key,
                table_id,
                row_id,
                settings.clay_timeout_seconds,
            )
            return _map_clay_row_to_enrichment(row)

        except TimeoutError as e:
            logger.warning("Clay timeout: %s - falling back to minimal enrichment", e)
            return _build_minimal_enrichment(name, company, title, email, linkedin_url)
        except httpx.HTTPError as e:
            logger.error("Clay HTTP error: %s", e)
            return None
        except Exception as e:
            logger.error("Clay enrichment failed: %s", e, exc_info=True)
            return None


def _build_minimal_enrichment(
    name: str,
    company: str,
    title: str | None,
    email: str | None,
    linkedin_url: str | None,
) -> EnrichmentResult:
    """Fallback when Clay is unavailable: populate from what we already know."""
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

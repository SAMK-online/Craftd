"""
Pipeline Orchestrator.

Coordinates all stages:
1. OCR (if card image provided)         [sequential - needed before enrichment]
2. Web-research enrichment + Job scan   [parallel with asyncio.gather]
3. Report generation                    [sequential - needs both above]

Returns a fully populated PipelineState.
"""
from __future__ import annotations

import asyncio
import logging
import time

from app.models.pipeline import ContactInput, PipelineState
from app.services.research_service import enrich_contact
from app.services.jobs_service import find_jobs_at_company
from app.services.ocr_service import parse_business_card, resolve_contact_info
from app.services.report_service import generate_report

logger = logging.getLogger(__name__)


async def run_pipeline(input_data: ContactInput) -> PipelineState:
    """
    Full pipeline: input -> OCR? -> enrich+jobs (parallel) -> report.
    All errors are caught per-stage so the pipeline never fully fails.
    """
    state = PipelineState(input=input_data)

    # ── Stage 1: OCR (only if card image provided) ──────────────────────────
    if input_data.card_image_base64:
        t0 = time.monotonic()
        try:
            state.parsed_card = await parse_business_card(input_data.card_image_base64)
        except Exception as e:
            logger.error("OCR stage failed: %s", e)
            state.errors.append(f"OCR failed: {e}")
        state.stage_timings["ocr"] = round(time.monotonic() - t0, 2)

    # Resolve the canonical (name, company, title) from all available sources
    resolved = resolve_contact_info(input_data, state.parsed_card)
    state.resolved_name = resolved["name"]
    state.resolved_company = resolved["company"]
    state.resolved_title = resolved["title"]

    if state.resolved_name == "UNKNOWN" or state.resolved_company == "UNKNOWN":
        state.errors.append(
            "Could not resolve contact name or company. "
            "Check card image quality or provide name/company directly."
        )

    # ── Stage 2: Enrichment + Job scan (parallel) ────────────────────────────
    t0 = time.monotonic()

    # Build both coroutines
    enrich_coro = enrich_contact(
        name=state.resolved_name,
        company=state.resolved_company,
        title=state.resolved_title,
        email=state.parsed_card.email if state.parsed_card else None,
        linkedin_url=state.parsed_card.linkedin_url if state.parsed_card else None,
    )
    jobs_coro = find_jobs_at_company(company_name=state.resolved_company)

    # Run both concurrently
    enrich_result, jobs_result = await asyncio.gather(
        enrich_coro, jobs_coro, return_exceptions=True
    )

    if isinstance(enrich_result, Exception):
        logger.error("Enrichment failed: %s", enrich_result)
        state.errors.append(f"Enrichment error: {enrich_result}")
        state.enrichment = None
    else:
        state.enrichment = enrich_result

    if isinstance(jobs_result, Exception):
        logger.error("Job search failed: %s", jobs_result)
        state.errors.append(f"Job search error: {jobs_result}")
        state.jobs = None
    else:
        state.jobs = jobs_result

    state.stage_timings["enrich_and_jobs"] = round(time.monotonic() - t0, 2)

    # ── Stage 3: Report generation ───────────────────────────────────────────
    t0 = time.monotonic()
    try:
        state.report = await generate_report(
            name=state.resolved_name,
            company=state.resolved_company,
            title=state.resolved_title,
            enrichment=state.enrichment,
            jobs=state.jobs,
            event_name=input_data.event_name,
        )
    except Exception as e:
        logger.error("Report generation failed: %s", e, exc_info=True)
        state.errors.append(f"Report generation failed: {e}")
    state.stage_timings["report_generation"] = round(time.monotonic() - t0, 2)

    total = sum(state.stage_timings.values())
    logger.info(
        "Pipeline complete for %s @ %s | total=%.2fs | stages=%s",
        state.resolved_name,
        state.resolved_company,
        total,
        state.stage_timings,
    )

    return state

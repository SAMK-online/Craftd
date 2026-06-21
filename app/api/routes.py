"""
FastAPI API Layer.

Endpoints:
  POST /api/generate          - Full pipeline, returns complete report JSON
  POST /api/generate/stream   - Same pipeline but streams stage updates via SSE
  POST /api/ocr               - OCR only (useful for testing card parsing)
  POST /api/jobs              - Job search only (useful for testing)
  GET  /api/health            - Health check
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import AsyncGenerator

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.models.pipeline import (
    ContactInput,
    IntelReport,
    JobBoardResult,
    ParsedCard,
    UserPersona,
)
from app.services.research_service import enrich_contact
from app.services.discovery_service import find_people
from app.services.jobs_service import find_jobs_at_company
from app.services.ocr_service import parse_business_card
from app.services.persona_service import parse_resume
from app.services.pipeline import run_pipeline
from app.services.report_service import generate_report
from app.services import persona_store, queue_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ─── Request/Response helpers ─────────────────────────────────────────────────

def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _parse_persona(persona_json: str | None) -> UserPersona | None:
    """Parse the persona JSON form field into a UserPersona (None if absent/invalid)."""
    if not persona_json:
        return None
    try:
        return UserPersona.model_validate_json(persona_json)
    except Exception as e:  # noqa: BLE001 - persona is optional, never fatal
        logger.warning("Could not parse persona: %s", e)
        return None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "service": "event-intel"}


@router.post("/generate", response_model=None)
async def generate(
    name: str | None = Form(None),
    company: str | None = Form(None),
    title: str | None = Form(None),
    event_name: str | None = Form(None),
    persona: str | None = Form(None),
    card_image: UploadFile | None = File(None),
):
    """
    Full pipeline in one call. Returns complete IntelReport JSON.
    Upload either (name + company) or a card_image file, or both.
    `persona` is the user's profile as a JSON string (drives voice + job match).
    """
    card_b64 = None
    if card_image:
        raw = await card_image.read()
        card_b64 = base64.b64encode(raw).decode()

    try:
        contact = ContactInput(
            name=name,
            company=company,
            title=title,
            card_image_base64=card_b64,
            event_name=event_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    state = await run_pipeline(contact, persona=_parse_persona(persona))

    if not state.report:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Report generation failed",
                "errors": state.errors,
                "timings": state.stage_timings,
            },
        )

    return {
        "report": state.report.model_dump(),
        "enrichment_confidence": (
            state.enrichment.enrichment_confidence if state.enrichment else 0.0
        ),
        "jobs_found": len(state.report.top_job_matches),
        "timings": state.stage_timings,
        "errors": state.errors,
    }


@router.post("/generate/stream")
async def generate_stream(
    name: str | None = Form(None),
    company: str | None = Form(None),
    title: str | None = Form(None),
    event_name: str | None = Form(None),
    persona: str | None = Form(None),
    card_image: UploadFile | None = File(None),
):
    """
    Streaming version: sends SSE events as each stage completes.
    Events: stage_start, stage_complete, done, error.

    Use this for the mobile UI so users see progress in real time.
    """
    user_persona = _parse_persona(persona)
    card_b64 = None
    if card_image:
        raw = await card_image.read()
        card_b64 = base64.b64encode(raw).decode()

    try:
        contact = ContactInput(
            name=name,
            company=company,
            title=title,
            card_image_base64=card_b64,
            event_name=event_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    async def event_stream() -> AsyncGenerator[str, None]:
        yield _sse_event("pipeline_start", {"message": "Pipeline started"})

        # ── OCR ──
        resolved_name = name
        resolved_company = company
        parsed_card = None

        if card_b64:
            yield _sse_event("stage_start", {"stage": "ocr", "message": "Reading business card..."})
            t0 = time.monotonic()
            try:
                parsed_card = await parse_business_card(card_b64)
                resolved_name = name or parsed_card.name
                resolved_company = company or parsed_card.company
                yield _sse_event("stage_complete", {
                    "stage": "ocr",
                    "duration": round(time.monotonic() - t0, 2),
                    "data": {
                        "name": parsed_card.name,
                        "company": parsed_card.company,
                        "title": parsed_card.title,
                        "email": parsed_card.email,
                    },
                })
            except Exception as e:
                yield _sse_event("stage_error", {"stage": "ocr", "error": str(e)})

        if not resolved_name or not resolved_company:
            yield _sse_event("error", {"message": "Could not determine name or company"})
            return

        # ── Enrichment + Jobs (parallel) ──
        yield _sse_event("stage_start", {
            "stage": "enrich_and_jobs",
            "message": f"Enriching {resolved_name} and scanning {resolved_company} jobs...",
        })
        t0 = time.monotonic()

        enrich_coro = enrich_contact(
            name=resolved_name,
            company=resolved_company,
            title=title or (parsed_card.title if parsed_card else None),
            email=parsed_card.email if parsed_card else None,
            linkedin_url=parsed_card.linkedin_url if parsed_card else None,
        )
        jobs_coro = find_jobs_at_company(
            company_name=resolved_company,
            target_roles=user_persona.target_roles if user_persona else None,
        )

        enrichment, jobs_result = await asyncio.gather(
            enrich_coro, jobs_coro, return_exceptions=True
        )

        if isinstance(enrichment, Exception):
            enrichment = None
            yield _sse_event("stage_warning", {"stage": "enrichment", "message": "Enrichment unavailable, continuing with public data"})

        if isinstance(jobs_result, Exception):
            jobs_result = None

        jobs_count = len(jobs_result.jobs_found) if isinstance(jobs_result, JobBoardResult) else 0
        enrich_conf = enrichment.enrichment_confidence if enrichment else 0.0

        yield _sse_event("stage_complete", {
            "stage": "enrich_and_jobs",
            "duration": round(time.monotonic() - t0, 2),
            "data": {
                "enrichment_confidence": round(enrich_conf, 2),
                "jobs_found": jobs_count,
                "job_titles": [j.title for j in jobs_result.jobs_found] if isinstance(jobs_result, JobBoardResult) else [],
            },
        })

        # ── Report generation ──
        yield _sse_event("stage_start", {
            "stage": "report",
            "message": "Generating your intel brief and outreach drafts...",
        })
        t0 = time.monotonic()

        try:
            report = await generate_report(
                name=resolved_name,
                company=resolved_company,
                title=title or (parsed_card.title if parsed_card else None),
                enrichment=enrichment if not isinstance(enrichment, Exception) else None,
                jobs=jobs_result if isinstance(jobs_result, JobBoardResult) else None,
                event_name=event_name,
                persona=user_persona,
            )
            yield _sse_event("stage_complete", {
                "stage": "report",
                "duration": round(time.monotonic() - t0, 2),
            })
            yield _sse_event("done", {"report": report.model_dump()})
        except Exception as e:
            logger.error("Report generation failed in stream: %s", e, exc_info=True)
            yield _sse_event("error", {"stage": "report", "message": str(e)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ocr", response_model=None)
async def ocr_only(card_image: UploadFile = File(...)):
    """Parse a business card image and return extracted fields. Good for testing."""
    raw = await card_image.read()
    card_b64 = base64.b64encode(raw).decode()
    try:
        parsed = await parse_business_card(card_b64)
        return parsed.model_dump()
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/jobs", response_model=None)
async def jobs_only(company: str = Form(...)):
    """Search for target roles at a company. Good for testing."""
    result = await find_jobs_at_company(company)
    return result.model_dump()


@router.post("/find", response_model=None)
async def find_contacts(query: str = Form(...), count: int = Form(5)):
    """Discover people matching a free-text query via Exa Search.

    Returns a list of contacts the user can then run through /generate.
    """
    contacts = await find_people(query=query, count=count)
    return {"query": query, "count": len(contacts), "contacts": [c.model_dump() for c in contacts]}


# ─── Async run queue (event-mode dashboard) ───────────────────────────────────

@router.post("/runs", response_model=None)
async def enqueue_run(
    device_id: str = Form(...),
    name: str | None = Form(None),
    company: str | None = Form(None),
    title: str | None = Form(None),
    event_name: str | None = Form(None),
    context: str | None = Form(None),
    persona: str | None = Form(None),
    card_image: UploadFile | None = File(None),
):
    """Queue a contact for background processing; returns immediately so the user
    can capture the next person. The brief populates the dashboard when ready."""
    card_b64 = None
    if card_image:
        raw = await card_image.read()
        card_b64 = base64.b64encode(raw).decode()
    try:
        summary = await queue_service.enqueue(
            device_id=device_id,
            name=name,
            company=company,
            title=title,
            event_name=event_name,
            context=context,
            card_image_base64=card_b64,
            persona=_parse_persona(persona),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return summary


@router.get("/runs", response_model=None)
async def list_runs(device_id: str):
    """Dashboard list: this device's runs with status, newest first."""
    return {"runs": await queue_service.list_runs(device_id)}


@router.get("/runs/{run_id}", response_model=None)
async def get_run(run_id: str, device_id: str = ""):
    """Full run including the report (when ready)."""
    run = await queue_service.get_run(device_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/runs/{run_id}", response_model=None)
async def delete_run(run_id: str, device_id: str = ""):
    await queue_service.delete_run(device_id, run_id)
    return {"ok": True}


# ─── Persona persistence ──────────────────────────────────────────────────────

@router.get("/persona", response_model=None)
async def get_persona_endpoint(device_id: str):
    """Load this device's saved persona (None if not onboarded / no DB)."""
    persona = await persona_store.get_persona(device_id)
    return {"persona": persona}


@router.post("/persona", response_model=None)
async def save_persona_endpoint(device_id: str = Form(...), persona: str = Form(...)):
    """Persist this device's persona."""
    p = _parse_persona(persona)
    if not p:
        raise HTTPException(status_code=422, detail="Invalid persona")
    saved = await persona_store.save_persona(device_id, p.model_dump())
    return {"saved": saved}


@router.post("/persona/resume", response_model=None)
async def parse_resume_endpoint(resume: UploadFile = File(...), goal: str = Form("full_time")):
    """Parse a resume PDF into a profile (summary, skills, target roles) for the persona."""
    from app.models.pipeline import UserGoal

    raw = await resume.read()
    pdf_b64 = base64.b64encode(raw).decode()
    try:
        goal_enum = UserGoal(goal)
    except ValueError:
        goal_enum = UserGoal.FULL_TIME
    try:
        profile = await parse_resume(pdf_b64, goal_enum)
        return profile
    except Exception as e:
        logger.error("Resume parse failed: %s", e, exc_info=True)
        raise HTTPException(status_code=422, detail=f"Could not parse resume: {e}")

"""
Async run queue for event mode.

Drop a name + company and move on; each becomes a background "run" that executes
the pipeline and populates the dashboard. Runs are scoped by device_id.

Persistence:
  - Supabase `runs` table when configured (survives restarts, cross-session)
  - local in-memory + .craftd_runs.json fallback otherwise

A semaphore caps concurrent pipelines so capture bursts don't hammer the APIs.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Optional

from app.config import get_settings
from app.models.pipeline import ContactInput, UserPersona
from app.services import supabase_client as sb
from app.services.pipeline import run_pipeline

logger = logging.getLogger(__name__)

_STORE = Path(__file__).resolve().parents[2] / ".craftd_runs.json"
_MAX_CONCURRENCY = 3

_runs: dict[str, dict] = {}  # local fallback only
_tasks: set[asyncio.Task] = set()
_sem: Optional[asyncio.Semaphore] = None


def _db() -> bool:
    return get_settings().supabase_configured


def _semaphore() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(_MAX_CONCURRENCY)
    return _sem


# ── local fallback persistence ────────────────────────────────────────────────
def _load() -> None:
    if _runs or not _STORE.exists():
        return
    try:
        for r in json.loads(_STORE.read_text()):
            _runs[r["id"]] = r
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not load runs store: %s", e)


def _save() -> None:
    try:
        _STORE.write_text(json.dumps(list(_runs.values()), indent=2))
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not save runs store: %s", e)


def _summary(r: dict) -> dict:
    return {
        "id": r["id"],
        "name": r.get("name"),
        "company": r.get("company"),
        "title": r.get("title"),
        "event_name": r.get("event_name"),
        "status": r.get("status"),
        "created_at": r.get("created_at"),
        "updated_at": r.get("updated_at"),
        "error": r.get("error"),
        "enrichment_used": (r.get("report") or {}).get("enrichment_used"),
        "jobs_found": len((r.get("report") or {}).get("top_job_matches") or []),
        "has_email": bool((r.get("report") or {}).get("contact_email")),
    }


async def _set(run_id: str, patch: dict) -> None:
    if _db():
        await sb.update("runs", {"id": run_id}, patch)
    else:
        if run_id in _runs:
            _runs[run_id].update(patch)
            _save()


async def _process(run_id: str, contact: ContactInput, persona: UserPersona | None) -> None:
    async with _semaphore():
        await _set(run_id, {"status": "running", "updated_at": time.time()})
        patch: dict = {"updated_at": time.time()}
        try:
            state = await run_pipeline(contact, persona=persona)
            if state.report:
                patch.update(
                    status="ready",
                    report=state.report.model_dump(),
                    name=state.report.contact_name,
                    company=state.report.contact_company,
                )
            else:
                patch.update(status="error", error="; ".join(state.errors) or "Report failed")
        except Exception as e:  # noqa: BLE001
            logger.error("Run %s failed: %s", run_id, e, exc_info=True)
            patch.update(status="error", error=str(e))
        await _set(run_id, patch)


async def enqueue(
    device_id: str,
    name: Optional[str],
    company: Optional[str],
    title: Optional[str],
    event_name: Optional[str],
    context: Optional[str],
    card_image_base64: Optional[str],
    persona: UserPersona | None,
) -> dict:
    contact = ContactInput(
        name=name,
        company=company,
        title=title,
        card_image_base64=card_image_base64,
        event_name=event_name,
        context=context,
    )
    run_id = uuid.uuid4().hex[:12]
    now = time.time()
    record = {
        "id": run_id,
        "device_id": device_id,
        "name": name or "Reading card…",
        "company": company or "",
        "title": title,
        "event_name": event_name,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "report": None,
        "error": None,
    }

    if _db():
        await sb.upsert("runs", record)
    else:
        _load()
        _runs[run_id] = record
        _save()

    task = asyncio.create_task(_process(run_id, contact, persona))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return _summary(record)


async def list_runs(device_id: str) -> list[dict]:
    if _db():
        try:
            rows = await sb.select("runs", {"device_id": device_id}, order="created_at.desc")
            return [_summary(r) for r in rows]
        except Exception as e:  # noqa: BLE001
            logger.error("list_runs failed: %s", e)
            return []
    _load()
    rows = [r for r in _runs.values() if r.get("device_id") == device_id]
    return sorted((_summary(r) for r in rows), key=lambda r: r["created_at"] or 0, reverse=True)


async def get_run(device_id: str, run_id: str) -> dict | None:
    if _db():
        rows = await sb.select("runs", {"id": run_id})
        return rows[0] if rows else None
    _load()
    return _runs.get(run_id)


async def delete_run(device_id: str, run_id: str) -> None:
    if _db():
        await sb.delete("runs", {"id": run_id})
    else:
        _load()
        _runs.pop(run_id, None)
        _save()

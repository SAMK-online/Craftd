"""
Async run queue for event mode.

You drop a name + company (or a card) and move on; each becomes a background
"run" that executes the full pipeline and populates a dashboard. Runs are kept
in memory and mirrored to a JSON file so they survive a server restart during an
all-day event.

A semaphore caps concurrent pipelines so a burst of captures doesn't hammer the
upstream APIs (Anthropic / Tavily / Prospeo).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from app.models.pipeline import ContactInput, UserPersona
from app.services.pipeline import run_pipeline

logger = logging.getLogger(__name__)

_STORE = Path(__file__).resolve().parents[2] / ".craftd_runs.json"
_MAX_CONCURRENCY = 3

_runs: dict[str, dict] = {}
_tasks: set[asyncio.Task] = set()
_sem: Optional[asyncio.Semaphore] = None


def _semaphore() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(_MAX_CONCURRENCY)
    return _sem


def _load() -> None:
    if _runs:
        return
    if _STORE.exists():
        try:
            for r in json.loads(_STORE.read_text()):
                _runs[r["id"]] = r
            logger.info("Loaded %d runs from disk", len(_runs))
        except Exception as e:  # noqa: BLE001
            logger.warning("Could not load runs store: %s", e)


def _save() -> None:
    try:
        _STORE.write_text(json.dumps(list(_runs.values()), indent=2))
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not save runs store: %s", e)


def _summary(r: dict) -> dict:
    """Lightweight view for the dashboard list (no full report)."""
    return {
        "id": r["id"],
        "name": r["name"],
        "company": r["company"],
        "title": r.get("title"),
        "event_name": r.get("event_name"),
        "status": r["status"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
        "error": r.get("error"),
        "enrichment_used": (r.get("report") or {}).get("enrichment_used"),
        "jobs_found": len((r.get("report") or {}).get("top_job_matches") or []),
        "has_email": bool((r.get("report") or {}).get("contact_email")),
    }


async def _process(run_id: str, contact: ContactInput, persona: UserPersona | None) -> None:
    async with _semaphore():
        run = _runs.get(run_id)
        if not run:
            return
        run["status"] = "running"
        run["updated_at"] = time.time()
        _save()
        try:
            state = await run_pipeline(contact, persona=persona)
            if state.report:
                run["report"] = state.report.model_dump()
                # Backfill display fields from the resolved contact.
                run["name"] = state.report.contact_name
                run["company"] = state.report.contact_company
                run["status"] = "ready"
            else:
                run["status"] = "error"
                run["error"] = "; ".join(state.errors) or "Report generation failed"
        except Exception as e:  # noqa: BLE001
            logger.error("Run %s failed: %s", run_id, e, exc_info=True)
            run["status"] = "error"
            run["error"] = str(e)
        run["updated_at"] = time.time()
        _save()


def enqueue(
    name: Optional[str],
    company: Optional[str],
    title: Optional[str],
    event_name: Optional[str],
    card_image_base64: Optional[str],
    persona: UserPersona | None,
) -> dict:
    """Create a run and kick off its pipeline in the background. Returns the summary."""
    _load()
    contact = ContactInput(
        name=name,
        company=company,
        title=title,
        card_image_base64=card_image_base64,
        event_name=event_name,
    )
    run_id = uuid.uuid4().hex[:12]
    now = time.time()
    _runs[run_id] = {
        "id": run_id,
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
    _save()

    task = asyncio.create_task(_process(run_id, contact, persona))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)

    return _summary(_runs[run_id])


def list_runs() -> list[dict]:
    _load()
    return sorted((_summary(r) for r in _runs.values()), key=lambda r: r["created_at"], reverse=True)


def get_run(run_id: str) -> dict | None:
    _load()
    return _runs.get(run_id)


def delete_run(run_id: str) -> bool:
    _load()
    if run_id in _runs:
        del _runs[run_id]
        _save()
        return True
    return False


def clear_runs() -> None:
    _runs.clear()
    _save()

"""
Persona persistence (Supabase `personas` table, keyed by device_id).

When Supabase isn't configured, returns None / no-ops so the frontend falls back
to its localStorage copy.
"""
from __future__ import annotations

import logging
import time

from app.config import get_settings
from app.services import supabase_client as sb

logger = logging.getLogger(__name__)


async def get_persona(device_id: str) -> dict | None:
    if not get_settings().supabase_configured:
        return None
    try:
        rows = await sb.select("personas", {"device_id": device_id})
    except Exception as e:  # noqa: BLE001
        logger.warning("get_persona failed: %s", e)
        return None
    if not rows:
        return None
    r = rows[0]
    return {
        "name": r.get("name"),
        "position": r.get("position"),
        "goal": r.get("goal"),
        "resume_summary": r.get("resume_summary"),
        "skills": r.get("skills") or [],
        "target_roles": r.get("target_roles") or [],
    }


async def save_persona(device_id: str, persona: dict) -> bool:
    if not get_settings().supabase_configured:
        return False
    row = {
        "device_id": device_id,
        "name": persona.get("name"),
        "position": persona.get("position"),
        "goal": persona.get("goal"),
        "resume_summary": persona.get("resume_summary"),
        "skills": persona.get("skills") or [],
        "target_roles": persona.get("target_roles") or [],
        "updated_at": time.time(),
    }
    try:
        await sb.upsert("personas", row)
        return True
    except Exception as e:  # noqa: BLE001
        logger.error("save_persona failed: %s", e)
        return False

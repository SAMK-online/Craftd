"""
Thin async Supabase (PostgREST) client over httpx — no extra dependency.

Used with the service_role key (backend-only), which bypasses RLS, so the app
reads/writes the `personas` and `runs` tables directly. Scoping by device_id is
done in the query layer (queue_service / persona_store).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def _base() -> tuple[str, dict]:
    s = get_settings()
    url = f"{s.supabase_url.rstrip('/')}/rest/v1"
    headers = {
        "apikey": s.supabase_key,
        "Authorization": f"Bearer {s.supabase_key}",
        "Content-Type": "application/json",
    }
    return url, headers


async def upsert(table: str, row: dict) -> None:
    """Insert or update a row (on primary-key conflict)."""
    url, headers = _base()
    headers = {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{url}/{table}", json=row, headers=headers, timeout=15.0)
        resp.raise_for_status()


async def update(table: str, match: dict, patch: dict) -> None:
    """PATCH rows matching `match` (eq filters)."""
    url, headers = _base()
    params = {k: f"eq.{v}" for k, v in match.items()}
    async with httpx.AsyncClient() as client:
        resp = await client.patch(f"{url}/{table}", params=params, json=patch, headers=headers, timeout=15.0)
        resp.raise_for_status()


async def select(table: str, match: dict | None = None, order: str | None = None) -> list[dict]:
    """SELECT * with optional eq filters and ordering."""
    url, headers = _base()
    params: dict[str, Any] = {"select": "*"}
    if match:
        params.update({k: f"eq.{v}" for k, v in match.items()})
    if order:
        params["order"] = order
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{url}/{table}", params=params, headers=headers, timeout=15.0)
        resp.raise_for_status()
        return resp.json()


async def delete(table: str, match: dict) -> None:
    url, headers = _base()
    params = {k: f"eq.{v}" for k, v in match.items()}
    async with httpx.AsyncClient() as client:
        resp = await client.delete(f"{url}/{table}", params=params, headers=headers, timeout=15.0)
        resp.raise_for_status()

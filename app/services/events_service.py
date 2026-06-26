"""
Vertical-specific event discovery via Exa Search + Claude structuring.

Give it a vertical ("AI infrastructure", "climate tech", "Series B fintech") and
an optional location, and it surfaces real, upcoming conferences / summits /
meetups / expos in that space — each with a date, location, source URL, and a
one-line why-it-fits.

Same shape as discovery_service: two Exa web searches in parallel (widened recall
via two phrasings), then Claude extracts a clean, deduped list and is told to
prefer *upcoming* events and never invent one. The event URL feeds straight into
"Find people" (the existing URL-drop discovery extracts the speakers/organizers).

Returns [] when Exa is unconfigured or nothing is found, so the feature degrades
cleanly rather than erroring.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date

import anthropic
import httpx

from app.config import get_settings
from app.models.pipeline import FoundEvent

logger = logging.getLogger(__name__)

EXA_SEARCH_URL = "https://api.exa.ai/search"

STRUCTURE_SYSTEM = (
    "You extract structured records of real, named professional events "
    "(conferences, summits, expos, meetups) from web search results. Use only "
    "events the results actually support; never invent one. Return strict JSON."
)

STRUCTURE_PROMPT = """The user wants events in this vertical: "{vertical}"{loc_line}

Today is {today}. From the web results below, identify the distinct, real events
that fit the vertical. Strongly prefer events happening today or in the future;
drop ones that have clearly already ended.

RESULTS:
{results}

Return ONLY a JSON array, most relevant/soonest first:
[
  {{
    "name": "Event name",
    "date": "human date string as found (e.g. 'March 12-14, 2026') or null",
    "location": "City, Region / 'Virtual' / null",
    "url": "the event or agenda page url from the results, or null",
    "description": "one short line: what it is and why it fits the vertical"
  }}
]
Rules:
- Only real, named events you can point to in the results. Skip generic
  listicles, 'top 10 conferences' roundups with no single event, and anything
  you can't tie to a specific event page.
- Deduplicate events (same event, different pages -> one entry, best url).
- Keep the date string exactly as written on the source; use null if unknown.
- Max {count}."""


async def _exa_search(
    client: httpx.AsyncClient, api_key: str, query: str, count: int
) -> list[dict]:
    payload = {
        "query": query,
        "type": "auto",
        "numResults": count,
        "contents": {"text": {"maxCharacters": 1500}},
    }
    resp = await client.post(
        EXA_SEARCH_URL,
        json=payload,
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        timeout=30.0,
    )
    if resp.status_code != 200:
        logger.warning("Exa search failed HTTP %s: %s", resp.status_code, resp.text[:200])
        return []
    return resp.json().get("results", [])


async def _structure(
    vertical: str, location: str | None, results: list[dict], count: int
) -> list[FoundEvent]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    digest = "\n".join(
        f"- title: {r.get('title','')}\n  url: {r.get('url','')}\n  text: {(r.get('text') or '')[:600]}"
        for r in results
    )
    prompt = STRUCTURE_PROMPT.format(
        vertical=vertical,
        loc_line=f'\nLocation preference: "{location}"' if location else "",
        today=date.today().isoformat(),
        results=digest,
        count=count,
    )
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=STRUCTURE_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    if not isinstance(data, list):
        return []

    out: list[FoundEvent] = []
    for d in data:
        if not isinstance(d, dict) or not d.get("name"):
            continue
        out.append(
            FoundEvent(
                name=d["name"],
                date=d.get("date"),
                location=d.get("location"),
                url=d.get("url"),
                description=d.get("description"),
            )
        )
    return out


async def find_events(
    vertical: str, location: str | None = None, count: int = 6
) -> list[FoundEvent]:
    """Discover upcoming events in a vertical. [] if Exa is unconfigured/empty."""
    settings = get_settings()
    if not settings.exa_configured:
        logger.warning("Exa not configured - event discovery unavailable (set EXA_API_KEY)")
        return []

    vertical = vertical.strip()
    if not vertical:
        return []
    count = max(1, min(count, 15))

    year = date.today().year
    loc = f" in {location.strip()}" if location and location.strip() else ""
    # Two phrasings widen recall — one conference-led, one meetup/expo-led.
    q1 = f"upcoming {vertical} conferences and summits {year} {year + 1}{loc}"
    q2 = f"{vertical} expo, meetup or industry event {year} {year + 1}{loc}"

    try:
        async with httpx.AsyncClient() as client:
            a, b = await asyncio.gather(
                _exa_search(client, settings.exa_api_key, q1, max(count * 2, 8)),
                _exa_search(client, settings.exa_api_key, q2, count),
                return_exceptions=True,
            )
    except httpx.HTTPError as e:
        logger.error("Exa event search request failed: %s", e)
        return []

    # Merge + dedupe by url.
    seen: set[str] = set()
    results: list[dict] = []
    for batch in (a, b):
        if isinstance(batch, list):
            for r in batch:
                url = r.get("url", "")
                if url and url in seen:
                    continue
                seen.add(url)
                results.append(r)

    if not results:
        return []

    try:
        events = await _structure(vertical, location, results, count)
    except Exception as e:  # noqa: BLE001 - discovery is best-effort, never fatal
        logger.error("Event structuring failed: %s", e, exc_info=True)
        return []

    logger.info(
        "Event discovery '%s'%s -> %d events (from %d results)",
        vertical, loc, len(events), len(results),
    )
    return events[:count]

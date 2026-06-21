"""
Contact discovery via Exa Search + Claude structuring.

Handles two query shapes from one box:
  - role + company   ("Solutions Engineers at Anthropic")
  - event / context  ("people at AWS Summit DC 2026", "speakers at SaaStr")

To cover both, we run two Exa searches in parallel:
  1. a LinkedIn-profile search (great for role+company)
  2. a general web search (surfaces event speaker/agenda/sponsor pages, team
     pages, press — where event people actually live)

Claude then extracts the distinct individuals that match the intent. Email is
resolved later (Prospeo) when the user crafts a follow-up, keeping discovery fast.

Returns [] when Exa is unconfigured or nothing is found.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

import anthropic
import httpx

from app.config import get_settings
from app.models.pipeline import FoundContact

logger = logging.getLogger(__name__)

EXA_SEARCH_URL = "https://api.exa.ai/search"
EXA_CONTENTS_URL = "https://api.exa.ai/contents"
URL_RE = re.compile(r"https?://[^\s]+")

STRUCTURE_SYSTEM = (
    "You extract structured contact records from web + LinkedIn search results. "
    "Use only people the results actually support; never invent anyone. Return strict JSON."
)

STRUCTURE_PROMPT = """The user is looking for: "{query}"

This may be a role+company search OR a search for people tied to an event
(speakers, panelists, organizers, sponsors, notable attendees). Use these
web/LinkedIn results to identify the real individuals who match the intent.

RESULTS:
{results}

Return ONLY a JSON array, most relevant first:
[
  {{
    "name": "Full Name",
    "title": "current job title or null",
    "company": "current company or null",
    "linkedin_url": "linkedin profile url if present in the results, else null"
  }}
]
Rules:
- Only real, named individuals. Skip company pages, generic listicles, and
  results where you can't identify a specific person.
- For event queries, prefer speakers/panelists/organizers/sponsors named in the
  results.
- Deduplicate people. Max {count}."""


async def _exa_search(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    count: int,
    category: str | None = None,
) -> list[dict]:
    payload: dict = {
        "query": query,
        "type": "auto",
        "numResults": count,
        "contents": {"text": {"maxCharacters": 1500}},
    }
    if category:
        payload["category"] = category
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


async def _exa_contents(client: httpx.AsyncClient, api_key: str, url: str) -> list[dict]:
    """Fetch a single page's contents (live-crawled) — for event/link drops."""
    payload = {
        "urls": [url],
        "text": {"maxCharacters": 6000},
        "livecrawl": "always",
    }
    resp = await client.post(
        EXA_CONTENTS_URL,
        json=payload,
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        timeout=45.0,
    )
    if resp.status_code != 200:
        logger.warning("Exa contents failed HTTP %s: %s", resp.status_code, resp.text[:200])
        return []
    return resp.json().get("results", [])


PAGE_PROMPT = """Below is the text of an event/page the user dropped a link to:

{results}

Extract EVERY individual person named on the page:
- the host(s) — e.g. a line like "Hosted By <name>"
- speakers/presenters mentioned anywhere (including @handles in the description)
- any named guests/attendees that are listed

Names may be first-name-only or @handles — include them anyway. Use null for
title/company when the page doesn't say. Do NOT invent people or treat org names
(e.g. "Latent.Space") as a person.

Return ONLY a JSON array, hosts/speakers first:
[
  {{ "name": "...", "title": null, "company": null, "linkedin_url": null }}
]
Max {count}."""


async def _structure(
    query: str, results: list[dict], count: int, page: bool = False
) -> list[FoundContact]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    digest = "\n".join(
        f"- title: {r.get('title','')}\n  url: {r.get('url','')}\n  text: {(r.get('text') or '')[: (4000 if page else 600)]}"
        for r in results
    )
    prompt = (
        PAGE_PROMPT.format(results=digest, count=count)
        if page
        else STRUCTURE_PROMPT.format(query=query, results=digest, count=count)
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

    out: list[FoundContact] = []
    for d in data:
        if not isinstance(d, dict) or not d.get("name"):
            continue
        out.append(
            FoundContact(
                name=d["name"],
                title=d.get("title"),
                company=d.get("company"),
                linkedin_url=d.get("linkedin_url"),
                email=None,  # resolved later when crafting a follow-up
            )
        )
    return out


async def _find_from_url(url: str, count: int) -> list[FoundContact]:
    """Drop an event/page link (e.g. lu.ma/...) -> extract the people named on it.

    Note: many event pages (Luma especially) hide their guest list, so this
    surfaces hosts/speakers/organizers rather than the full attendee roster.
    """
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            results = await _exa_contents(client, settings.exa_api_key, url)
    except httpx.HTTPError as e:
        logger.error("Exa contents request failed: %s", e)
        return []
    if not results:
        return []
    try:
        people = await _structure(url, results, count, page=True)
    except Exception as e:  # noqa: BLE001
        logger.error("URL contact structuring failed: %s", e, exc_info=True)
        return []
    logger.info("Discovery from URL %s -> %d contacts", url, len(people))
    return people[:count]


async def find_people(query: str, count: int = 5) -> list[FoundContact]:
    """Discover people from a free-text query, or from a dropped event/page link."""
    settings = get_settings()
    if not settings.exa_configured:
        logger.warning("Exa not configured - contact discovery unavailable (set EXA_API_KEY)")
        return []

    count = max(1, min(count, 15))

    # If the input contains a URL, fetch that page and extract its people.
    url_match = URL_RE.search(query)
    if url_match:
        return await _find_from_url(url_match.group(0).rstrip(".,)"), count)

    try:
        async with httpx.AsyncClient() as client:
            general, profiles = await asyncio.gather(
                _exa_search(client, settings.exa_api_key, query, max(count * 2, 8)),
                _exa_search(client, settings.exa_api_key, query, count, category="linkedin profile"),
                return_exceptions=True,
            )
    except httpx.HTTPError as e:
        logger.error("Exa search request failed: %s", e)
        return []

    # Merge results, dedupe by url.
    seen: set[str] = set()
    results: list[dict] = []
    for batch in (profiles, general):
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
        people = await _structure(query, results, count)
    except Exception as e:
        logger.error("Contact structuring failed: %s", e, exc_info=True)
        return []

    logger.info("Discovery '%s' -> %d contacts (from %d results)", query, len(people), len(results))
    return people[:count]

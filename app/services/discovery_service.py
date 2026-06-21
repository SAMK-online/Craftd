"""
Contact discovery via Exa Search + Claude structuring.

Turns a free-text search ("Solutions Engineers at Anthropic", "Heads of Growth at
Series B fintechs") into a list of real people with title, company, and LinkedIn.

Uses the Exa Search API (pay-as-you-go, available without a Pro plan) with the
`linkedin profile` category to surface matching profiles, then Claude structures
the raw results into clean contacts. Email is intentionally NOT fetched here —
it's resolved later (via Prospeo) when the user crafts a follow-up for a chosen
person, so discovery stays fast and cheap.

Returns [] when Exa is unconfigured or nothing is found.
"""
from __future__ import annotations

import json
import logging

import anthropic
import httpx

from app.config import get_settings
from app.models.pipeline import FoundContact

logger = logging.getLogger(__name__)

EXA_SEARCH_URL = "https://api.exa.ai/search"

STRUCTURE_SYSTEM = (
    "You extract structured contact records from LinkedIn search results. "
    "Use only what the results support; never invent people. Return strict JSON."
)

STRUCTURE_PROMPT = """The user is looking for: "{query}"

Here are LinkedIn profile search results:
{results}

Return ONLY a JSON array of the people who match the search intent, most relevant first:
[
  {{
    "name": "Full Name",
    "title": "their current job title or null",
    "company": "their current company or null",
    "linkedin_url": "their linkedin profile url"
  }}
]
Skip results that are not individual people (company pages, articles). Max {count}."""


async def _exa_search(client: httpx.AsyncClient, api_key: str, query: str, count: int) -> list[dict]:
    payload = {
        "query": query,
        "type": "auto",
        "category": "linkedin profile",
        "numResults": count,
        "contents": {"text": {"maxCharacters": 600}},
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


async def _structure(query: str, results: list[dict], count: int) -> list[FoundContact]:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    digest = "\n".join(
        f"- title: {r.get('title','')}\n  url: {r.get('url','')}\n  text: {(r.get('text') or '')[:300]}"
        for r in results
    )
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=STRUCTURE_SYSTEM,
        messages=[{"role": "user", "content": STRUCTURE_PROMPT.format(query=query, results=digest, count=count)}],
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


async def find_people(query: str, count: int = 5) -> list[FoundContact]:
    """Discover people matching a free-text query via Exa Search."""
    settings = get_settings()
    if not settings.exa_configured:
        logger.warning("Exa not configured - contact discovery unavailable (set EXA_API_KEY)")
        return []

    count = max(1, min(count, 15))

    try:
        async with httpx.AsyncClient() as client:
            results = await _exa_search(client, settings.exa_api_key, query, count)
    except httpx.HTTPError as e:
        logger.error("Exa search request failed: %s", e)
        return []

    if not results:
        return []

    try:
        people = await _structure(query, results, count)
    except Exception as e:
        logger.error("Contact structuring failed: %s", e, exc_info=True)
        return []

    logger.info("Discovery '%s' -> %d contacts", query, len(people))
    return people[:count]

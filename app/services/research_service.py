"""
Enrichment via live web research (Tavily) + Claude synthesis.

Replaces the Clay integration. Instead of looking a contact up in a static
people database (which needs an email/LinkedIn and a paid plan for read-back),
we:

  1. Run two Tavily web searches in parallel — one on the person, one on the
     company — which works from just a name + company.
  2. Feed the raw search results to Claude, which extracts a structured
     EnrichmentResult (person + company fields) and rates its own confidence.

Exposes the same `enrich_contact(...)` signature the pipeline already calls, so
this is a drop-in replacement: the pipeline, routes, and UI are unchanged.

Returns None when Tavily is not configured or research fails, so the brief
degrades cleanly to public data + job boards.
"""
from __future__ import annotations

import asyncio
import json
import logging

import anthropic
import httpx

from app.config import get_settings
from app.models.pipeline import (
    CompanyEnrichment,
    EnrichmentResult,
    FundingStage,
    PersonEnrichment,
)

logger = logging.getLogger(__name__)

TAVILY_URL = "https://api.tavily.com/search"

SYNTHESIS_SYSTEM = (
    "You are a research analyst. You are given raw web search results about a "
    "person and their company. Extract only what the sources actually support — "
    "never invent facts. Return strict JSON, no markdown fences, no commentary."
)

SYNTHESIS_PROMPT = """Extract a structured profile from these web search results.

CONTACT: {name}{title_part} at {company}

=== PERSON SEARCH RESULTS ===
{person_results}

=== COMPANY SEARCH RESULTS ===
{company_results}

Return ONLY this JSON object (use null / [] when the sources don't support a field):
{{
  "person": {{
    "summary": "2-3 sentence professional summary grounded in the sources",
    "location": "City, State/Country or null",
    "skills": ["skill", ...],
    "years_at_company": number or null,
    "previous_companies": ["company", ...],
    "linkedin_url": "url or null"
  }},
  "company": {{
    "description": "what the company does, 1-2 sentences",
    "industry": "industry or null",
    "employee_count": "approx headcount as a string (e.g. '500-1000') or null",
    "funding_stage": "one of: bootstrapped, pre_seed, seed, series_a, series_b, series_c_plus, public, unknown",
    "total_funding_usd": integer or null,
    "tech_stack": ["technology", ...],
    "recent_news_headlines": ["recent headline", ...],
    "website": "url or null",
    "hiring_signal": true or false
  }},
  "confidence": 0.0 to 1.0  // how well the sources covered this contact
}}"""


def _parse_funding_stage(raw: object) -> FundingStage:
    if not isinstance(raw, str) or not raw:
        return FundingStage.UNKNOWN
    key = raw.lower().replace("-", "_").replace(" ", "_")
    for stage in FundingStage:
        if stage.value == key:
            return stage
    if "series" in key:
        return FundingStage.SERIES_C_PLUS
    return FundingStage.UNKNOWN


def _as_str_list(val: object) -> list[str]:
    if isinstance(val, list):
        return [str(v) for v in val if v]
    return []


async def _tavily_search(client: httpx.AsyncClient, api_key: str, query: str, max_results: int) -> str:
    """Run one Tavily search; return a compact text digest of the results."""
    resp = await client.post(
        TAVILY_URL,
        json={
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": max_results,
            "include_answer": True,
        },
        timeout=20.0,
    )
    resp.raise_for_status()
    data = resp.json()

    lines: list[str] = []
    if data.get("answer"):
        lines.append(f"Summary: {data['answer']}")
    for r in data.get("results", []):
        title = r.get("title", "")
        content = (r.get("content") or "")[:500]
        url = r.get("url", "")
        lines.append(f"- {title} ({url})\n  {content}")
    return "\n".join(lines) if lines else "No results found."


async def enrich_contact(
    name: str,
    company: str,
    title: str | None = None,
    email: str | None = None,
    linkedin_url: str | None = None,
) -> EnrichmentResult | None:
    """Research a contact via Tavily, synthesize with Claude into EnrichmentResult."""
    settings = get_settings()

    if not settings.tavily_configured:
        logger.warning("Tavily not configured - skipping enrichment (set TAVILY_API_KEY)")
        return None
    if name == "UNKNOWN" or company == "UNKNOWN":
        logger.info("Skipping research: unresolved name/company")
        return None

    person_query = " ".join(
        filter(None, [f'"{name}"', company, title or "", "LinkedIn background role experience"])
    )
    company_query = f"{company} company industry funding stage employees tech stack recent news"

    try:
        async with httpx.AsyncClient() as client:
            person_results, company_results = await asyncio.gather(
                _tavily_search(client, settings.tavily_api_key, person_query, settings.tavily_max_results),
                _tavily_search(client, settings.tavily_api_key, company_query, settings.tavily_max_results),
            )
    except httpx.HTTPError as e:
        logger.error("Tavily search failed: %s", e)
        return None

    try:
        data = await _synthesize(name, company, title, person_results, company_results)
    except Exception as e:
        logger.error("Research synthesis failed: %s", e, exc_info=True)
        return None

    return _build_result(name, company, title, email, linkedin_url, data)


async def _synthesize(
    name: str,
    company: str,
    title: str | None,
    person_results: str,
    company_results: str,
) -> dict:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    prompt = SYNTHESIS_PROMPT.format(
        name=name,
        title_part=f" ({title})" if title else "",
        company=company,
        person_results=person_results,
        company_results=company_results,
    )
    logger.info("Synthesizing research for %s @ %s", name, company)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        system=SYNTHESIS_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def _build_result(
    name: str,
    company: str,
    title: str | None,
    email: str | None,
    linkedin_url: str | None,
    data: dict,
) -> EnrichmentResult:
    p = data.get("person") or {}
    c = data.get("company") or {}

    person = PersonEnrichment(
        full_name=name,
        title=title,
        company=company,
        linkedin_url=linkedin_url or p.get("linkedin_url"),
        verified_email=email,
        location=p.get("location"),
        summary=p.get("summary"),
        skills=_as_str_list(p.get("skills")),
        years_at_company=(
            float(p["years_at_company"]) if isinstance(p.get("years_at_company"), (int, float)) else None
        ),
        previous_companies=_as_str_list(p.get("previous_companies")),
    )
    company_obj = CompanyEnrichment(
        name=company,
        description=c.get("description"),
        industry=c.get("industry"),
        employee_count=c.get("employee_count"),
        funding_stage=_parse_funding_stage(c.get("funding_stage")),
        total_funding_usd=(
            int(c["total_funding_usd"]) if isinstance(c.get("total_funding_usd"), (int, float)) else None
        ),
        tech_stack=_as_str_list(c.get("tech_stack")),
        recent_news_headlines=_as_str_list(c.get("recent_news_headlines")),
        website=c.get("website"),
        hiring_signal=bool(c.get("hiring_signal")),
    )

    confidence = data.get("confidence")
    if not isinstance(confidence, (int, float)):
        # Fall back to a completeness-based score.
        fields = [person.summary, person.location, company_obj.description, company_obj.industry]
        confidence = sum(1 for f in fields if f) / len(fields)
    confidence = max(0.0, min(1.0, float(confidence)))

    return EnrichmentResult(
        person=person,
        company=company_obj,
        enrichment_confidence=confidence,
        raw_enrichment=None,
    )

"""
Job Board Service.

Strategy (in priority order):
1. Try Greenhouse / Lever / Ashby public APIs directly - most AI startups use one.
   These are unauthenticated and reliable.
2. Fall back to Apify's LinkedIn Jobs scraper if configured.
3. Fall back to a basic careers page URL with no role data.

Abu's target roles for matching:
- Forward Deployed Engineer (FDE)
- GTM AI Engineer / GTM Engineer
- Solutions Engineer / Solutions Architect
- AI Engineer / ML Engineer
- Technical Account Manager (stretch)
"""
from __future__ import annotations

import asyncio
import logging
from urllib.parse import quote

import httpx

from app.config import get_settings
from app.models.pipeline import JobBoardResult, JobMatch

logger = logging.getLogger(__name__)

# Target role keywords - used to score/filter job listings
TARGET_TITLE_KEYWORDS = [
    "forward deployed",
    "gtm engineer",
    "gtm ai",
    "solutions engineer",
    "solutions architect",
    "ai engineer",
    "machine learning engineer",
    "ml engineer",
    "technical customer success",
    "customer engineer",
    "implementation engineer",
]

DEPRIORITISED_KEYWORDS = [
    "senior staff", "principal", "director", "vp", "head of",
    "intern", "data analyst",
]


def _is_target_role(title: str) -> bool:
    title_lower = title.lower()
    if any(kw in title_lower for kw in DEPRIORITISED_KEYWORDS):
        return False
    return any(kw in title_lower for kw in TARGET_TITLE_KEYWORDS)


def _fit_reason(title: str, company: str) -> str:
    """Generate a one-sentence fit reason for a matched role."""
    title_lower = title.lower()
    if "forward deployed" in title_lower or "fde" in title_lower:
        return f"FDE role at {company} aligns with Abu's hands-on AI deployment work at Actfore and hackathon wins."
    if "gtm" in title_lower:
        return f"GTM Engineer role at {company} matches Abu's GTMBrain project and customer-facing AI pipeline experience."
    if "solutions" in title_lower:
        return f"Solutions Engineer role at {company} fits Abu's pattern of building POCs for enterprise clients."
    if "ai engineer" in title_lower or "ml engineer" in title_lower:
        return f"AI/ML Engineer role at {company} maps to Abu's LangGraph, RAG, and multi-agent systems background."
    return f"This role at {company} matches Abu's technical customer-facing AI engineering profile."


# ─── ATS Platform Detectors ───────────────────────────────────────────────────

async def _try_greenhouse(client: httpx.AsyncClient, company_slug: str) -> list[JobMatch]:
    """
    Greenhouse public API: no auth required.
    Slug is usually the company's lowercase name, e.g. "anthropic", "openai".
    """
    url = f"https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs?content=true"
    try:
        resp = await client.get(url, timeout=8.0)
        if resp.status_code != 200:
            return []
        data = resp.json()
        jobs = data.get("jobs", [])
        matches = []
        for job in jobs:
            title = job.get("title", "")
            if not _is_target_role(title):
                continue
            location = ""
            if job.get("offices"):
                location = job["offices"][0].get("name", "")
            matches.append(
                JobMatch(
                    title=title,
                    company=company_slug.title(),
                    url=job.get("absolute_url", ""),
                    location=location,
                    description_snippet=(job.get("content") or "")[:300],
                    fit_reason=_fit_reason(title, company_slug.title()),
                    ats_platform="Greenhouse",
                )
            )
        logger.info("Greenhouse: found %d target roles for %s", len(matches), company_slug)
        return matches[:3]
    except httpx.HTTPError:
        return []


async def _try_lever(client: httpx.AsyncClient, company_slug: str) -> list[JobMatch]:
    """
    Lever public postings API: no auth required.
    """
    url = f"https://api.lever.co/v0/postings/{company_slug}?mode=json"
    try:
        resp = await client.get(url, timeout=8.0)
        if resp.status_code != 200:
            return []
        jobs = resp.json()
        matches = []
        for job in jobs:
            title = job.get("text", "")
            if not _is_target_role(title):
                continue
            location = job.get("categories", {}).get("location", "")
            snippet = ""
            if job.get("description"):
                snippet = job["description"][:300]
            elif job.get("lists"):
                snippet = job["lists"][0].get("content", "")[:300]
            matches.append(
                JobMatch(
                    title=title,
                    company=company_slug.title(),
                    url=job.get("hostedUrl", ""),
                    location=location,
                    description_snippet=snippet,
                    fit_reason=_fit_reason(title, company_slug.title()),
                    ats_platform="Lever",
                )
            )
        logger.info("Lever: found %d target roles for %s", len(matches), company_slug)
        return matches[:3]
    except httpx.HTTPError:
        return []


async def _try_ashby(client: httpx.AsyncClient, company_slug: str) -> list[JobMatch]:
    """
    Ashby public jobs API.
    """
    url = f"https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams"
    payload = {
        "operationName": "ApiJobBoardWithTeams",
        "variables": {"organizationHostedJobsPageName": company_slug},
        "query": """
            query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
              jobBoard: jobBoardWithTeams(
                organizationHostedJobsPageName: $organizationHostedJobsPageName
              ) {
                jobPostings {
                  id title locationName jobLocation { locationStr } applicationLink
                  descriptionPlain
                }
              }
            }
        """,
    }
    try:
        resp = await client.post(url, json=payload, timeout=8.0)
        if resp.status_code != 200:
            return []
        data = resp.json()
        postings = (
            data.get("data", {})
            .get("jobBoard", {})
            .get("jobPostings", [])
        )
        matches = []
        for job in postings:
            title = job.get("title", "")
            if not _is_target_role(title):
                continue
            location = (
                job.get("locationName")
                or job.get("jobLocation", {}).get("locationStr", "")
            )
            snippet = (job.get("descriptionPlain") or "")[:300]
            matches.append(
                JobMatch(
                    title=title,
                    company=company_slug.title(),
                    url=job.get("applicationLink", f"https://jobs.ashbyhq.com/{company_slug}"),
                    location=location,
                    description_snippet=snippet,
                    fit_reason=_fit_reason(title, company_slug.title()),
                    ats_platform="Ashby",
                )
            )
        logger.info("Ashby: found %d target roles for %s", len(matches), company_slug)
        return matches[:3]
    except httpx.HTTPError:
        return []


async def _try_apify_linkedin(
    client: httpx.AsyncClient,
    company_name: str,
    api_token: str,
) -> list[JobMatch]:
    """
    Apify LinkedIn Jobs Scraper as fallback.
    Uses actor: bebity/linkedin-jobs-scraper
    """
    run_url = "https://api.apify.com/v2/acts/bebity~linkedin-jobs-scraper/run-sync-get-dataset-items"
    params = {"token": api_token, "timeout": 30, "memory": 256}
    payload = {
        "queries": [f"{company_name} {kw}" for kw in ["solutions engineer AI", "forward deployed engineer"]],
        "maxResults": 10,
    }
    try:
        resp = await client.post(run_url, json=payload, params=params, timeout=35.0)
        if resp.status_code != 200:
            logger.warning("Apify returned %s", resp.status_code)
            return []
        items = resp.json()
        matches = []
        for item in items:
            title = item.get("title", "")
            if not _is_target_role(title):
                continue
            matches.append(
                JobMatch(
                    title=title,
                    company=item.get("company", company_name),
                    url=item.get("link") or item.get("url", ""),
                    location=item.get("location", ""),
                    description_snippet=(item.get("description") or "")[:300],
                    fit_reason=_fit_reason(title, company_name),
                    ats_platform="LinkedIn (Apify)",
                )
            )
        return matches[:3]
    except Exception as e:
        logger.warning("Apify scrape failed: %s", e)
        return []


def _slugify(company_name: str) -> str:
    """Best-guess slug from company name for ATS API paths."""
    import re
    slug = company_name.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    return slug


# ─── Main entry point ─────────────────────────────────────────────────────────

async def find_jobs_at_company(company_name: str) -> JobBoardResult:
    """
    Try all known ATS platforms for a company, return first non-empty result.
    Runs Greenhouse, Lever, Ashby in parallel; falls back to Apify if all empty.
    """
    settings = get_settings()
    slug = _slugify(company_name)

    logger.info("Searching jobs at '%s' (slug: %s)", company_name, slug)

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; EventIntelBot/1.0)"},
        follow_redirects=True,
    ) as client:
        # Try the three main ATS platforms in parallel
        gh_task = _try_greenhouse(client, slug)
        lv_task = _try_lever(client, slug)
        ab_task = _try_ashby(client, slug)
        results = await asyncio.gather(gh_task, lv_task, ab_task, return_exceptions=True)

        all_matches: list[JobMatch] = []
        for r in results:
            if isinstance(r, list):
                all_matches.extend(r)

        if all_matches:
            # Deduplicate by title
            seen_titles: set[str] = set()
            unique_matches = []
            for m in all_matches:
                if m.title.lower() not in seen_titles:
                    seen_titles.add(m.title.lower())
                    unique_matches.append(m)
            return JobBoardResult(
                company=company_name,
                jobs_found=unique_matches[:3],
                search_attempted=True,
            )

        # Fallback: Apify
        if settings.apify_configured:
            logger.info("No ATS API results, falling back to Apify for %s", company_name)
            async with httpx.AsyncClient() as apify_client:
                apify_matches = await _try_apify_linkedin(
                    apify_client, company_name, settings.apify_api_token
                )
            if apify_matches:
                return JobBoardResult(
                    company=company_name,
                    jobs_found=apify_matches,
                    search_attempted=True,
                )

        # Nothing found - still return a careers page guess
        return JobBoardResult(
            company=company_name,
            jobs_found=[],
            careers_page_url=f"https://{slug.replace('-', '')}.com/careers",
            search_attempted=True,
            error="No target roles found via automated search. Check careers page directly.",
        )

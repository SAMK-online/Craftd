"""
Job Board Service.

Strategy (in priority order):
1. Try Greenhouse / Lever / Ashby public APIs directly - most AI startups use one.
   These are unauthenticated and reliable.
2. Fall back to Apify's LinkedIn Jobs scraper if configured.
3. Fall back to a basic careers page URL with no role data.

Target roles come from the user's persona (derived from their resume + goal). If
none are provided, a broad default keyword set is used.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
from urllib.parse import quote

import httpx

from app.config import get_settings
from app.models.pipeline import JobBoardResult, JobMatch

logger = logging.getLogger(__name__)

# Fallback keywords when the user's persona has no target roles.
DEFAULT_KEYWORDS = [
    "engineer", "manager", "designer", "analyst", "scientist",
    "developer", "marketing", "product", "intern",
]


def _clean_snippet(raw: str | None, limit: int = 360) -> str:
    """Strip HTML/entities from a scraped JD into a readable brief."""
    if not raw:
        return ""
    text = html.unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _matched_keyword(title: str, keywords: list[str]) -> str | None:
    """Match a keyword on word boundaries so 'intern' doesn't hit 'international'."""
    title_lower = title.lower()
    for kw in keywords:
        if not kw:
            continue
        if re.search(rf"\b{re.escape(kw.lower())}\b", title_lower):
            return kw
    return None


def _is_target_role(title: str, keywords: list[str]) -> bool:
    return _matched_keyword(title, keywords) is not None


def _fit_reason(title: str, company: str, matched: str | None) -> str:
    """One-sentence, persona-neutral fit reason (the report LLM refines it)."""
    if matched:
        return f"{title} at {company} matches your target ({matched})."
    return f"{title} at {company} aligns with your background."


# ─── ATS Platform Detectors ───────────────────────────────────────────────────

async def _try_greenhouse(client: httpx.AsyncClient, company_slug: str, keywords: list[str]) -> list[JobMatch]:
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
            matched = _matched_keyword(title, keywords)
            if not matched:
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
                    description_snippet=_clean_snippet(job.get("content")),
                    fit_reason=_fit_reason(title, company_slug.title(), matched),
                    ats_platform="Greenhouse",
                )
            )
        logger.info("Greenhouse: found %d target roles for %s", len(matches), company_slug)
        return matches[:3]
    except httpx.HTTPError:
        return []


async def _try_lever(client: httpx.AsyncClient, company_slug: str, keywords: list[str]) -> list[JobMatch]:
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
            matched = _matched_keyword(title, keywords)
            if not matched:
                continue
            location = job.get("categories", {}).get("location", "")
            snippet = ""
            if job.get("description"):
                snippet = _clean_snippet(job["description"])
            elif job.get("lists"):
                snippet = _clean_snippet(job["lists"][0].get("content", ""))
            matches.append(
                JobMatch(
                    title=title,
                    company=company_slug.title(),
                    url=job.get("hostedUrl", ""),
                    location=location,
                    description_snippet=snippet,
                    fit_reason=_fit_reason(title, company_slug.title(), matched),
                    ats_platform="Lever",
                )
            )
        logger.info("Lever: found %d target roles for %s", len(matches), company_slug)
        return matches[:3]
    except httpx.HTTPError:
        return []


async def _try_ashby(client: httpx.AsyncClient, company_slug: str, keywords: list[str]) -> list[JobMatch]:
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
            matched = _matched_keyword(title, keywords)
            if not matched:
                continue
            location = (
                job.get("locationName")
                or job.get("jobLocation", {}).get("locationStr", "")
            )
            snippet = _clean_snippet(job.get("descriptionPlain"))
            matches.append(
                JobMatch(
                    title=title,
                    company=company_slug.title(),
                    url=job.get("applicationLink", f"https://jobs.ashbyhq.com/{company_slug}"),
                    location=location,
                    description_snippet=snippet,
                    fit_reason=_fit_reason(title, company_slug.title(), matched),
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
    keywords: list[str],
) -> list[JobMatch]:
    """
    Apify LinkedIn Jobs Scraper as fallback.
    Uses actor: bebity/linkedin-jobs-scraper
    """
    run_url = "https://api.apify.com/v2/acts/bebity~linkedin-jobs-scraper/run-sync-get-dataset-items"
    params = {"token": api_token, "timeout": 30, "memory": 256}
    payload = {
        "queries": [f"{company_name} {kw}" for kw in (keywords[:2] or ["roles"])],
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
            matched = _matched_keyword(title, keywords)
            if not matched:
                continue
            matches.append(
                JobMatch(
                    title=title,
                    company=item.get("company", company_name),
                    url=item.get("link") or item.get("url", ""),
                    location=item.get("location", ""),
                    description_snippet=(item.get("description") or "")[:300],
                    fit_reason=_fit_reason(title, company_name, matched),
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

async def find_jobs_at_company(
    company_name: str,
    target_roles: list[str] | None = None,
) -> JobBoardResult:
    """
    Try all known ATS platforms for a company, return first non-empty result.
    Runs Greenhouse, Lever, Ashby in parallel; falls back to Apify if all empty.

    Roles are matched against `target_roles` (from the user's persona); a broad
    default keyword set is used when none are provided.
    """
    settings = get_settings()
    slug = _slugify(company_name)
    keywords = [k for k in (target_roles or []) if k] or DEFAULT_KEYWORDS

    logger.info("Searching jobs at '%s' (slug: %s) for %d keywords", company_name, slug, len(keywords))

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; EventIntelBot/1.0)"},
        follow_redirects=True,
    ) as client:
        # Try the three main ATS platforms in parallel
        gh_task = _try_greenhouse(client, slug, keywords)
        lv_task = _try_lever(client, slug, keywords)
        ab_task = _try_ashby(client, slug, keywords)
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
                    apify_client, company_name, settings.apify_api_token, keywords
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

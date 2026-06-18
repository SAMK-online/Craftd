"""
Report Generation Service.

Single Claude API call that takes enrichment + job data and produces:
- Person summary
- Company snapshot
- Opportunity angle (why follow up)
- LinkedIn DM (under 300 chars)
- Follow-up email (subject + body)
- 3-5 talking points

The prompt is engineered to produce structured JSON we can parse directly.
"""
from __future__ import annotations

import json
import logging

import anthropic

from app.config import get_settings
from app.models.pipeline import (
    EnrichmentResult,
    IntelReport,
    JobBoardResult,
    OutreachDraft,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert networking strategist helping Abdul Shaik (Abu), a Data Engineer
and AI systems builder in the DMV area, follow up with contacts he meets at tech events.

Abu's background:
- Data Engineer at Actfore Inc, building automated PHI/PII extraction pipelines
- MS Computer Science (AI/NLP) from George Mason University, GPA 3.73, graduated 2025
- Founder of Saasyfy (AI-native B2B SaaS marketplace, accepted into NVIDIA Inception Program)
- Core projects: VelocityAI (voice-first Socratic DSA tutor, won "Most Technically Impressive"
  at FIDE x Lovable Hackathon), MindBridge (multi-agent mental health platform, won NVIDIA
  Agents for Impact Hackathon), GTMBrain (GTM intelligence platform, Claude API + Tavily),
  AI Receptionist for karate academy (Retell AI, n8n, live in production),
  Restaurant Management Dual-Agent System (32 tools, AWS Lambda, PostgreSQL)
- Target roles: Forward Deployed Engineer, GTM AI Engineer, Solutions Engineer, AI Engineer
- Tech: LangGraph, FastAPI, Python, Next.js, Retell AI, n8n, PostgreSQL, AWS Lambda,
  Anthropic Claude API, RAG pipelines, multi-agent systems
- Philosophy: LLMs handle reasoning and NLP; routing, state, scheduling, business logic
  stay deterministic and testable

Your task: produce a JSON intelligence brief for Abu to use when following up with a contact.

Rules:
- Be specific and concrete, not generic. Reference actual details from the enrichment data.
- LinkedIn DM must be under 300 characters. Reference the event where they met.
- Email should be warm, direct, and reference one specific role from the job matches if available.
- Talking points should be conversation starters Abu can use naturally, not scripted pitches.
- If no jobs were found, the outreach should focus on building a relationship, not job hunting.
- Return ONLY valid JSON, no markdown fences, no preamble."""

REPORT_PROMPT_TEMPLATE = """Generate an intelligence brief for this contact.

CONTACT DATA:
Name: {name}
Title: {title}
Company: {company}

ENRICHMENT DATA:
{enrichment_summary}

JOB MATCHES AT THEIR COMPANY:
{jobs_summary}

EVENT WHERE THEY MET: {event_name}

Return a JSON object with exactly these keys:
{{
  "person_summary": "2-3 sentences about who they are and their career trajectory",
  "company_snapshot": "2-3 sentences: what the company does, stage, and any notable recent news or signals",
  "opportunity_angle": "1-2 sentences: the specific reason Abu should follow up with THIS person (not generic)",
  "linkedin_dm": "Under 300 chars. First message only. Reference the event. Warm and human.",
  "follow_up_email_subject": "Email subject line",
  "follow_up_email_body": "Plain text email body. 3-5 short paragraphs. Reference the event, one specific job if available, and a clear ask.",
  "talking_points": ["point 1", "point 2", "point 3"]
}}"""


def _build_enrichment_summary(enrichment: EnrichmentResult | None) -> str:
    if not enrichment:
        return "No enrichment data available."

    p = enrichment.person
    c = enrichment.company
    lines = []

    if p.summary:
        lines.append(f"LinkedIn summary: {p.summary}")
    if p.skills:
        lines.append(f"Skills: {', '.join(p.skills[:8])}")
    if p.years_at_company:
        lines.append(f"Years at current company: {p.years_at_company:.1f}")
    if p.previous_companies:
        lines.append(f"Previous companies: {', '.join(p.previous_companies[:3])}")
    if p.location:
        lines.append(f"Location: {p.location}")

    lines.append("")
    if c.description:
        lines.append(f"Company: {c.description}")
    if c.industry:
        lines.append(f"Industry: {c.industry}")
    if c.employee_count:
        lines.append(f"Employees: {c.employee_count}")
    if c.funding_stage.value != "unknown":
        lines.append(f"Funding stage: {c.funding_stage.value.replace('_', ' ').title()}")
    if c.total_funding_usd:
        lines.append(f"Total funding: ${c.total_funding_usd:,}")
    if c.tech_stack:
        lines.append(f"Tech stack: {', '.join(c.tech_stack[:6])}")
    if c.recent_news_headlines:
        lines.append("Recent news:")
        for headline in c.recent_news_headlines[:3]:
            lines.append(f"  - {headline}")
    if c.hiring_signal:
        lines.append("Signal: Company is actively hiring")

    lines.append(f"Enrichment confidence: {enrichment.enrichment_confidence:.0%}")
    return "\n".join(lines) if lines else "Minimal enrichment data."


def _build_jobs_summary(jobs: JobBoardResult | None) -> str:
    if not jobs or not jobs.jobs_found:
        msg = "No matching open roles found at this company."
        if jobs and jobs.careers_page_url:
            msg += f" Careers page: {jobs.careers_page_url}"
        return msg
    lines = []
    for job in jobs.jobs_found:
        lines.append(f"- {job.title} ({job.location or 'Location TBD'})")
        lines.append(f"  URL: {job.url}")
        lines.append(f"  Fit: {job.fit_reason}")
        if job.description_snippet:
            lines.append(f"  Snippet: {job.description_snippet[:200]}...")
    return "\n".join(lines)


async def generate_report(
    name: str,
    company: str,
    title: str | None,
    enrichment: EnrichmentResult | None,
    jobs: JobBoardResult | None,
    event_name: str | None = None,
) -> IntelReport:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    prompt = REPORT_PROMPT_TEMPLATE.format(
        name=name,
        title=title or "Unknown",
        company=company,
        enrichment_summary=_build_enrichment_summary(enrichment),
        jobs_summary=_build_jobs_summary(jobs),
        event_name=event_name or "a tech event",
    )

    logger.info("Generating intel report for %s @ %s", name, company)

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences defensively
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Report generation returned non-JSON: %s", raw[:500])
        raise ValueError(f"Report JSON parse failed: {e}") from e

    outreach = OutreachDraft(
        linkedin_dm=data["linkedin_dm"],
        follow_up_email_subject=data["follow_up_email_subject"],
        follow_up_email_body=data["follow_up_email_body"],
        talking_points=data.get("talking_points", []),
    )

    return IntelReport(
        contact_name=name,
        contact_company=company,
        contact_title=title,
        person_summary=data["person_summary"],
        company_snapshot=data["company_snapshot"],
        opportunity_angle=data["opportunity_angle"],
        top_job_matches=jobs.jobs_found if jobs else [],
        outreach=outreach,
        enrichment_used=enrichment is not None and enrichment.enrichment_confidence > 0.1,
    )

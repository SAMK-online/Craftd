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
    UserPersona,
)

logger = logging.getLogger(__name__)


def _build_system_prompt(persona: UserPersona | None) -> str:
    """Construct the strategist system prompt from the user's persona."""
    if persona is None:
        who = "the user"
        background = ""
        goal_line = "build a genuine professional relationship"
    else:
        who = f"{persona.name} ({persona.position})"
        bg_parts = []
        if persona.resume_summary:
            bg_parts.append(persona.resume_summary)
        if persona.skills:
            bg_parts.append("Skills: " + ", ".join(persona.skills[:12]))
        if persona.target_roles:
            bg_parts.append("Target roles: " + ", ".join(persona.target_roles[:8]))
        background = "\n".join(f"- {p}" for p in bg_parts)
        goal_line = f"find {persona.goal_label()}"

    return f"""You are an expert networking strategist helping {who} follow up with
contacts they meet at events. Their goal in reaching out is to {goal_line}.

The user's background:
{background or "- (no resume provided)"}

Your task: produce a JSON intelligence brief the user can use to follow up.

Rules:
- Be specific and concrete, not generic. Reference actual details from the enrichment data.
- Write the outreach in the user's voice and frame it around their goal ({goal_line}).
- LinkedIn DM must be under 300 characters. Reference the event where they met.
- The email should be warm and direct. If a relevant open role is in the job matches,
  reference that SPECIFIC role; otherwise focus on a genuine connection, not a hard ask.
- Talking points should be natural conversation starters tied to the user's background.
- Return ONLY valid JSON, no markdown fences, no preamble."""


REPORT_PROMPT_TEMPLATE = """Generate an intelligence brief for this contact.

THE USER (who is reaching out): {user_name}, seeking {goal_label}

CONTACT DATA:
Name: {name}
Title: {title}
Company: {company}

ENRICHMENT DATA:
{enrichment_summary}

OPEN ROLES AT THEIR COMPANY THAT FIT THE USER:
{jobs_summary}

EVENT WHERE THEY MET: {event_name}

NOTES FROM THE CONVERSATION (the strongest personal signal — weave these in naturally):
{context}

Return a JSON object with exactly these keys:
{{
  "person_summary": "2-3 sentences about who they are and their career trajectory",
  "company_snapshot": "2-3 sentences: what the company does, stage, and any notable recent news or signals",
  "opportunity_angle": "1-2 sentences: the specific reason the user should follow up with THIS person (not generic)",
  "linkedin_dm": "Under 300 chars. First message only. Reference the event. Warm and human.",
  "follow_up_email_subject": "Email subject line",
  "follow_up_email_body": "Plain text email body. 3-5 short paragraphs. Reference the event, one specific role if available, and a clear ask aligned to the user's goal.",
  "talking_points": ["point 1", "point 2", "point 3"],
  "event_followup": "If an event is named above OR the notes describe meeting/talking in person, you MUST write this: a short (2-3 sentence) warm, no-ask note to simply stay in touch — e.g. 'Really enjoyed chatting about X at <event> — would love to keep in touch.' Absolutely NO pitch, NO ask, NO mention of roles/jobs; reference a specific detail from the conversation. Use null ONLY when there is no event and no in-person conversation signal at all."
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
    persona: UserPersona | None = None,
    context: str | None = None,
) -> IntelReport:
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    has_company = bool(company and company.upper() != "UNKNOWN")
    company_display = company if has_company else ""

    prompt = REPORT_PROMPT_TEMPLATE.format(
        user_name=persona.name if persona else "the user",
        goal_label=persona.goal_label() if persona else "a genuine connection",
        name=name,
        title=title or "Unknown",
        company=company if has_company else "(unknown — lean on the conversation notes)",
        enrichment_summary=_build_enrichment_summary(enrichment),
        jobs_summary=_build_jobs_summary(jobs),
        event_name=event_name or "a tech event",
        context=context.strip() if context and context.strip() else "(none provided)",
    )

    logger.info("Generating intel report for %s @ %s", name, company)

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=_build_system_prompt(persona),
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

    ef = data.get("event_followup")
    outreach = OutreachDraft(
        linkedin_dm=data["linkedin_dm"],
        follow_up_email_subject=data["follow_up_email_subject"],
        follow_up_email_body=data["follow_up_email_body"],
        talking_points=data.get("talking_points", []),
        event_followup=ef.strip() if isinstance(ef, str) and ef.strip() else None,
    )

    return IntelReport(
        contact_name=name,
        contact_company=company_display,
        contact_title=title,
        contact_email=enrichment.person.verified_email if enrichment else None,
        person_summary=data["person_summary"],
        company_snapshot=data["company_snapshot"],
        opportunity_angle=data["opportunity_angle"],
        top_job_matches=jobs.jobs_found if jobs else [],
        outreach=outreach,
        enrichment_used=enrichment is not None and enrichment.enrichment_confidence > 0.1,
    )

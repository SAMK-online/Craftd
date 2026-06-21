"""
Persona service: turn a resume (PDF) into a structured profile.

Claude reads the resume directly (PDF document block) and returns a summary,
skills, and the role keywords to match jobs against — tuned to the user's goal
(internship / full-time / collaboration / mentorship).
"""
from __future__ import annotations

import json
import logging

import anthropic

from app.config import get_settings
from app.models.pipeline import UserGoal

logger = logging.getLogger(__name__)

RESUME_SYSTEM = (
    "You are a career analyst. Read the resume and extract a tight, factual "
    "profile. Return strict JSON only — no markdown, no commentary."
)

RESUME_PROMPT = """The person is seeking {goal_label}.

From their resume, return ONLY this JSON:
{{
  "resume_summary": "3-4 sentence professional summary: who they are, strongest experience, and trajectory",
  "skills": ["concrete skill", ...],
  "target_roles": ["role keyword", ...]
}}

For "target_roles": list 4-8 lowercase job-title keywords this person should be
matched against, given their background AND that they want {goal_label}. For an
internship goal, bias toward intern/new-grad titles; for full-time, core IC/role
titles. For collaboration or mentorship, list the domains they'd connect over
(these are used loosely). Keep them short, e.g. "data engineer", "ml intern",
"product manager"."""


async def parse_resume(pdf_base64: str, goal: UserGoal) -> dict:
    """Return {resume_summary, skills, target_roles} from a base64 PDF resume."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    goal_label = {
        UserGoal.INTERNSHIP: "an internship",
        UserGoal.FULL_TIME: "a full-time role",
        UserGoal.COLLABORATION: "collaboration or partnership",
        UserGoal.MENTORSHIP: "mentorship and advice",
    }[goal]

    logger.info("Parsing resume for goal=%s", goal.value)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1200,
        system=RESUME_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_base64,
                        },
                    },
                    {"type": "text", "text": RESUME_PROMPT.format(goal_label=goal_label)},
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())

    return {
        "resume_summary": data.get("resume_summary") or "",
        "skills": [str(s) for s in (data.get("skills") or []) if s],
        "target_roles": [str(r).lower() for r in (data.get("target_roles") or []) if r],
    }

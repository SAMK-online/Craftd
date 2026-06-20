"""
Data models for the Event Intel pipeline.
Every stage produces and consumes typed Pydantic models.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


# ─── Input Models ─────────────────────────────────────────────────────────────

class ContactInput(BaseModel):
    """Typed contact input. Either (name + company) or a base64 card image."""
    name: Optional[str] = Field(None, description="Full name of the contact")
    company: Optional[str] = Field(None, description="Company or org name")
    title: Optional[str] = Field(None, description="Job title if known")
    card_image_base64: Optional[str] = Field(
        None, description="Base64-encoded business card image (JPEG/PNG)"
    )
    event_name: Optional[str] = Field(
        None, description="Event where you met them, used to personalise outreach"
    )

    def model_post_init(self, __context) -> None:
        if not self.card_image_base64 and not (self.name and self.company):
            raise ValueError(
                "Provide either card_image_base64 or both name and company"
            )


# ─── OCR Stage ────────────────────────────────────────────────────────────────

class ParsedCard(BaseModel):
    """Structured data extracted from a business card image."""
    name: str
    company: str
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    website: Optional[str] = None
    raw_text: str = Field(description="Full OCR text for debugging")


# ─── Enrichment Stage (live web research) ─────────────────────────────────────

class FundingStage(str, Enum):
    BOOTSTRAPPED = "bootstrapped"
    PRE_SEED = "pre_seed"
    SEED = "seed"
    SERIES_A = "series_a"
    SERIES_B = "series_b"
    SERIES_C_PLUS = "series_c_plus"
    PUBLIC = "public"
    UNKNOWN = "unknown"


class CompanyEnrichment(BaseModel):
    """Company-level enrichment from web research."""
    name: str
    description: Optional[str] = None
    industry: Optional[str] = None
    employee_count: Optional[str] = None
    funding_stage: FundingStage = FundingStage.UNKNOWN
    total_funding_usd: Optional[int] = None
    tech_stack: list[str] = Field(default_factory=list)
    recent_news_headlines: list[str] = Field(default_factory=list)
    website: Optional[str] = None
    linkedin_company_url: Optional[str] = None
    hiring_signal: bool = Field(
        False, description="True if company is actively posting jobs"
    )


class PersonEnrichment(BaseModel):
    """Person-level enrichment from web research."""
    full_name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    verified_email: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = Field(None, description="LinkedIn about section")
    skills: list[str] = Field(default_factory=list)
    years_at_company: Optional[float] = None
    previous_companies: list[str] = Field(default_factory=list)


class EnrichmentResult(BaseModel):
    """Combined enrichment output from web research."""
    person: PersonEnrichment
    company: CompanyEnrichment
    enrichment_confidence: float = Field(
        ge=0.0, le=1.0,
        description="0.0–1.0 confidence score based on data completeness"
    )
    raw_enrichment: Optional[dict] = Field(
        None, description="Raw research payload for debugging"
    )


# ─── Job Board Stage ──────────────────────────────────────────────────────────

class JobMatch(BaseModel):
    """A single job opening that matches Abu's target profile."""
    title: str
    company: str
    url: str
    location: Optional[str] = None
    job_type: Optional[str] = None  # "full-time", "contract", etc.
    posted_date: Optional[str] = None
    description_snippet: str = Field(
        description="First 300 chars of JD, used in outreach"
    )
    fit_reason: str = Field(
        description="One sentence: why this role matches Abu's background"
    )
    ats_platform: Optional[str] = Field(
        None, description="Greenhouse / Lever / Ashby / Workday etc."
    )


class JobBoardResult(BaseModel):
    """All job matches found for a company."""
    company: str
    jobs_found: list[JobMatch] = Field(default_factory=list)
    careers_page_url: Optional[str] = None
    search_attempted: bool = True
    error: Optional[str] = None


# ─── Report Generation Stage ──────────────────────────────────────────────────

class OutreachDraft(BaseModel):
    """The three ready-to-send artifacts."""
    linkedin_dm: str = Field(
        description="Short LinkedIn DM (under 300 chars), first message only"
    )
    follow_up_email_subject: str
    follow_up_email_body: str = Field(
        description="Email body in plain text, references the event and a specific role"
    )
    talking_points: list[str] = Field(
        description="3–5 bullet points for a follow-up conversation"
    )


class IntelReport(BaseModel):
    """The complete intelligence brief for one contact."""
    contact_name: str
    contact_company: str
    contact_title: Optional[str] = None

    person_summary: str = Field(
        description="2–3 sentence summary of who they are and their career trajectory"
    )
    company_snapshot: str = Field(
        description="2–3 sentence snapshot: what the company does, stage, recent news"
    )
    opportunity_angle: str = Field(
        description="Why THIS person is worth following up with specifically"
    )

    top_job_matches: list[JobMatch] = Field(
        default_factory=list,
        description="Up to 3 open roles at their company that fit Abu's profile"
    )

    outreach: OutreachDraft

    enrichment_used: bool = Field(
        description="Whether web-research enrichment succeeded or we fell back to public data"
    )


# ─── Pipeline State (passed between stages) ───────────────────────────────────

class PipelineState(BaseModel):
    """Full mutable state threaded through the pipeline."""
    input: ContactInput
    parsed_card: Optional[ParsedCard] = None

    # Resolved contact info (from card OCR or direct input)
    resolved_name: Optional[str] = None
    resolved_company: Optional[str] = None
    resolved_title: Optional[str] = None

    enrichment: Optional[EnrichmentResult] = None
    jobs: Optional[JobBoardResult] = None
    report: Optional[IntelReport] = None

    # Timing / debug
    stage_timings: dict[str, float] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)

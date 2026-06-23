"""
Application configuration.

Single source of truth for every runtime setting. Values are read from
environment variables (and a local .env file in development) via
pydantic-settings, validated once, and cached for the process lifetime.

Every attribute and property defined here is consumed somewhere in the
service layer:

  anthropic_api_key        -> ocr_service, report_service (Claude client)
  tavily_api_key           -> research_service (live web research)
  tavily_max_results       -> research_service (results per query)
  tavily_configured        -> research_service (skip enrichment if False)
  prospeo_api_key          -> email_service (verified email lookup)
  prospeo_configured       -> email_service / research_service (skip if False)
  apify_api_token          -> jobs_service (fallback scraper auth)
  apify_configured         -> jobs_service (skip Apify fallback if False)
  linkedin_scrape_enabled  -> reserved for the direct-LinkedIn path
  app_env                  -> main (CORS open only in development)
  log_level                -> main (logging.basicConfig level)
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Typed, validated application settings.

    Field names map case-insensitively to env vars, so `anthropic_api_key`
    is populated from `ANTHROPIC_API_KEY`. Unknown env vars are ignored so a
    shared machine .env never breaks startup.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Anthropic (required for the core pipeline) ────────────────────────────
    # Left optional at load time so the app still imports without keys (useful
    # for unit tests and `/api/health`); enforced lazily via `require_anthropic`.
    anthropic_api_key: str = Field(default="", description="Claude API key (sk-ant-...)")

    # ── Job board fallback (optional) ─────────────────────────────────────────
    apify_api_token: str = Field(
        default="", description="Apify token for the LinkedIn Jobs scraper fallback"
    )
    linkedin_scrape_enabled: bool = Field(
        default=False, description="Enable the direct-LinkedIn scrape path (needs cookies)"
    )

    # ── Enrichment via live web research (Tavily) ─────────────────────────────
    tavily_api_key: str = Field(
        default="", description="Tavily search API key for live person/company research"
    )
    tavily_max_results: int = Field(
        default=5, ge=1, le=10, description="Results per Tavily query"
    )

    # ── Email finding (Prospeo) ───────────────────────────────────────────────
    prospeo_api_key: str = Field(
        default="", description="Prospeo API key for verified-email lookup"
    )

    # ── Database (Supabase / Postgres via PostgREST) ──────────────────────────
    supabase_url: str = Field(default="", description="Supabase project URL")
    supabase_key: str = Field(
        default="", description="Supabase service_role key (backend-only)"
    )

    # ── Contact discovery (Exa Websets) ───────────────────────────────────────
    exa_api_key: str = Field(
        default="", description="Exa API key for Websets contact/list finding"
    )
    websets_timeout_seconds: int = Field(
        default=90, ge=10, le=240,
        description="Max seconds to wait for Websets results before returning what we have"
    )

    # ── App runtime ───────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = Field(
        default="development", description="Deployment environment"
    )
    log_level: str = Field(default="INFO", description="Root log level")
    cors_origins: str = Field(
        default="",
        description="Comma-separated browser origins allowed to call the API in "
        "non-development envs (e.g. https://your-frontend.onrender.com). In "
        "development all origins are allowed and this is ignored.",
    )

    # ── Derived gates the services branch on ──────────────────────────────────
    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        """Allowed CORS origins as a list, parsed from the comma-separated env."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def apify_configured(self) -> bool:
        """True when the Apify fallback scraper can be called."""
        return bool(self.apify_api_token)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def prospeo_configured(self) -> bool:
        """True when verified-email lookup can run."""
        return bool(self.prospeo_api_key)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def exa_configured(self) -> bool:
        """True when Websets contact discovery can run."""
        return bool(self.exa_api_key)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def supabase_configured(self) -> bool:
        """True when persona + runs persist to Supabase (else local fallback)."""
        return bool(self.supabase_url and self.supabase_key)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tavily_configured(self) -> bool:
        """True when live web-research enrichment can run.

        research_service skips enrichment (returns None) when this is False, so
        the pipeline degrades cleanly to public data + job boards.
        """
        return bool(self.tavily_api_key)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key)

    def require_anthropic(self) -> str:
        """Return the Anthropic key or fail loudly.

        Call this at the point of use (OCR / report) so a missing key surfaces
        as a clear error instead of a confusing 401 from the SDK.
        """
        if not self.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to your environment or .env "
                "file - it is required for OCR and report generation."
            )
        return self.anthropic_api_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings once and reuse the cached instance everywhere.

    Cached so repeated `get_settings()` calls across the request path don't
    re-parse .env. Call `get_settings.cache_clear()` in tests to reload.
    """
    settings = Settings()

    # Surface configuration gaps at startup without crashing optional paths.
    if not settings.anthropic_configured:
        logger.warning(
            "ANTHROPIC_API_KEY not set - OCR and report generation will fail until configured."
        )
    if not settings.tavily_configured:
        logger.info(
            "Tavily not configured - enrichment will be skipped (set TAVILY_API_KEY). "
            "Briefs still generate from public data + job boards."
        )
    if not settings.prospeo_configured:
        logger.info("Prospeo not configured - briefs will omit verified emails (set PROSPEO_API_KEY).")
    if not settings.apify_configured:
        logger.debug("Apify not configured - job search will use ATS APIs only.")

    return settings

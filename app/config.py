"""
Application configuration.

Single source of truth for every runtime setting. Values are read from
environment variables (and a local .env file in development) via
pydantic-settings, validated once, and cached for the process lifetime.

Every attribute and property defined here is consumed somewhere in the
service layer:

  anthropic_api_key        -> ocr_service, report_service (Claude client)
  clay_api_key             -> clay_service (poll auth: Bearer token)
  clay_table_webhook_url   -> clay_service (enrichment trigger)
  clay_table_id            -> clay_service (row polling path)
  clay_timeout_seconds     -> clay_service (poll deadline)
  clay_configured          -> clay_service (skip enrichment if False)
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

    # ── Clay enrichment (optional; pipeline degrades gracefully without it) ────
    clay_api_key: str = Field(default="", description="Clay API key for row polling")
    clay_table_webhook_url: str = Field(
        default="", description="Clay table webhook URL that triggers an enrichment row"
    )
    clay_table_id: str = Field(
        default="", description="Clay table ID, used to poll the enriched row"
    )
    clay_timeout_seconds: int = Field(
        default=12,
        ge=1,
        le=60,
        description="Max seconds to wait for Clay enrichment before falling back",
    )

    # ── Job board fallback (optional) ─────────────────────────────────────────
    apify_api_token: str = Field(
        default="", description="Apify token for the LinkedIn Jobs scraper fallback"
    )
    linkedin_scrape_enabled: bool = Field(
        default=False, description="Enable the direct-LinkedIn scrape path (needs cookies)"
    )

    # ── App runtime ───────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = Field(
        default="development", description="Deployment environment"
    )
    log_level: str = Field(default="INFO", description="Root log level")

    # ── Derived gates the services branch on ──────────────────────────────────
    @computed_field  # type: ignore[prop-decorator]
    @property
    def clay_configured(self) -> bool:
        """True only when enrichment can actually be triggered.

        clay_service skips enrichment entirely (returns None) when this is
        False, so both the trigger URL and the poll key must be present.
        """
        return bool(self.clay_api_key and self.clay_table_webhook_url)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def apify_configured(self) -> bool:
        """True when the Apify fallback scraper can be called."""
        return bool(self.apify_api_token)

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
    if not settings.clay_configured:
        logger.info(
            "Clay not configured - enrichment will be skipped (set CLAY_API_KEY + CLAY_TABLE_WEBHOOK_URL)."
        )
    if settings.clay_configured and not settings.clay_table_id:
        logger.info(
            "CLAY_TABLE_ID not set - Clay will run in webhook-only mode (no row polling)."
        )
    if not settings.apify_configured:
        logger.debug("Apify not configured - job search will use ATS APIs only.")

    return settings

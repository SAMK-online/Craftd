"""
Event Intel - FastAPI Application
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(
    title="Event Intel API",
    description=(
        "Turn a name + company (or business card photo) into a full intelligence brief "
        "with personalized outreach drafts and job matches."
    ),
    version="0.1.0",
)

# Allow the frontend (Next.js dev server or deployed web app) to call the API.
# In development we allow everything; in staging/production we only allow the
# origins listed in CORS_ORIGINS (comma-separated) — set this to your deployed
# frontend URL, or the browser will block every request.
if settings.app_env == "development":
    cors_origins = ["*"]
else:
    cors_origins = settings.cors_origin_list
    if not cors_origins:
        logging.getLogger(__name__).warning(
            "APP_ENV=%s but CORS_ORIGINS is empty - the browser frontend will be "
            "blocked. Set CORS_ORIGINS to your deployed frontend URL.",
            settings.app_env,
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root():
    return {
        "service": "event-intel",
        "docs": "/docs",
        "health": "/api/health",
    }

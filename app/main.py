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

# Allow the frontend (Next.js dev server or mobile app) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.app_env == "development" else [],
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

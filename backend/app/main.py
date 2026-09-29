import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database.db import Base, DATABASE_INFO, engine
from app.database.migrate import ensure_lightweight_migrations
from app.api import api_router
import app.models.models  # ensure models are registered

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("neuronest")


def _log_database_target() -> None:
    """Print, once at import, exactly which database the API is writing to.

    Without this line a misconfigured Supabase block silently keeps the local
    SQLite file in use, and every "my data is not in Supabase" report starts
    with a guessing game.
    """
    logger.info(
        "Database: %s (%s) -> %s",
        DATABASE_INFO.get("backend"),
        DATABASE_INFO.get("source"),
        DATABASE_INFO.get("host") or DATABASE_INFO.get("database"),
    )
    if DATABASE_INFO.get("pooler"):
        logger.info("Using the Supabase connection pooler (NullPool).")
    for warning in settings.configuration_warnings:
        logger.warning("Config: %s", warning)


# Create tables.
#
# This is deliberately non-fatal. A hosted database (Supabase) can be paused,
# asleep, or simply not filled in yet, and a hard crash here means uvicorn
# never starts - so the browser shows an unreachable API instead of the real
# error. Failing soft lets /health explain what is wrong, and the first real
# query reports the rest.
try:
    Base.metadata.create_all(bind=engine)
    ensure_lightweight_migrations(engine)
except (SQLAlchemyError, OSError, RuntimeError) as exc:
    logger.warning(
        "Could not prepare the database schema (%s: %s). The API will start, "
        "but requests that touch the database will fail until this is fixed. "
        "For Supabase, check USE_SUPABASE / SUPABASE_DB_* in backend/.env and "
        "run: ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --check",
        type(exc).__name__,
        exc,
    )

_log_database_target()

app = FastAPI(
    title="NeuroNest AI API",
    description=(
        "Personalized cognitive care, one interaction at a time. "
        "Assistive cognitive engagement platform - not a medical diagnostic tool."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {
        "message": "NeuroNest AI API is running",
        "docs": "/docs",
        "database": DATABASE_INFO.get("backend"),
    }


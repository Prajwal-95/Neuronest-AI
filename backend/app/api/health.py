"""Health, database and Supabase probes.

`/health` keeps its original contract (`status` / `service` / `version`) so the
existing smoke test, the PWA and `run.ps1` keep working, and adds a `database`
and `supabase` block. The two deeper probes are separate endpoints so a liveness
check never has to wait on a third-party network call.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.config import settings
from app.database.db import (
    check_database_connection,
    database_backend,
    get_db_soft,
)
from app.database.supabase_client import (
    probe_rest,
    supabase_status,
)

router = APIRouter(tags=["health"])

SERVICE_NAME = "NeuroNest AI"
SERVICE_VERSION = "1.0.0"


@router.get("/health")
def health(db=Depends(get_db_soft)):
    """Liveness probe - never touches Supabase over the network.

    `status` is `ok` while the API can reach its database and `degraded` when it
    cannot, which is the signal an uptime monitor or `run.ps1` can act on. The
    Supabase block is pure configuration reporting, so a slow Supabase REST
    response can never make this endpoint flap - use `/health/supabase` for the
    actual round trip.
    """
    connected = True
    error = None
    if db is None:
        connected = False
        error = "No database session could be opened"
    else:
        try:
            db.execute(text("SELECT 1"))
        except Exception as exc:
            connected = False
            error = f"{type(exc).__name__}: {exc}"

    return {
        "status": "ok" if connected else "degraded",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "database": {
            "backend": database_backend(),
            "managed_by": settings.database_info.get("managed_by"),
            "source": settings.database_info.get("source"),
            "connected": connected,
            "error": error,
        },
        "supabase": supabase_status(),
    }


@router.get("/health/database")
def health_database():
    """Detailed database report: host, TLS, pool mode, latency, tables.

    Row counts are only included when `HEALTH_EXPOSE_COUNTS=true`, because this
    endpoint is unauthenticated.
    """
    return check_database_connection(include_counts=settings.HEALTH_EXPOSE_COUNTS)


@router.get("/health/supabase")
def health_supabase():
    """Verify the Supabase project URL and anon key with a real HTTPS round trip.

    Catches the two mistakes that are easy to make and hard to read: a typo'd
    project URL (unreachable) and a stale anon key (HTTP 401/403).
    """
    return {"status": supabase_status(), "probe": probe_rest()}


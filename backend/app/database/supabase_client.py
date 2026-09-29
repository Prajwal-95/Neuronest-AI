"""Supabase client for the REST / Storage side of the project.

The API's own data - users, game sessions, recommendations, reminders and
caregiver links - lives in **Supabase Postgres** and is read and written
through SQLAlchemy (`app/database/db.py`). Nothing in this module is required
for that, and no feature depends on the optional `supabase` SDK.

What this module adds is the part SQLAlchemy cannot do: Storage buckets,
Realtime subscriptions, GoTrue admin calls, and a cheap "are my project URL and
keys correct?" probe behind the health endpoints.

Everything here degrades gracefully:

* no credentials      -> `None` / `configured: false`, no crash
* SDK not installed   -> only `get_supabase*()` are unavailable; the HTTPS
  probe still works, because it uses `urllib` from the standard library
"""

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger("neuronest.supabase")

#: The project's Supabase REST base URL, without a trailing slash.
REST_URL = (settings.SUPABASE_URL or "").strip().rstrip("/")

# Supabase only ever returns the project name/version here, so a bare GET is a
# safe, unauthenticated way to prove the project URL resolves.
GOtrue_HEALTH_PATH = "/auth/v1/health"

_clients: Dict[str, Any] = {}


def sdk_available() -> bool:
    """True when the real `supabase` package is installed and usable.

    Checking `import supabase` on its own is not enough: any directory named
    `supabase/` on `sys.path` is importable as an empty *namespace package*, so
    the import succeeds and the failure only shows up later as a confusing
    `ImportError: cannot import name 'create_client'`. Importing the symbol the
    code actually needs is the only honest check.
    """
    try:
        from supabase import create_client  # noqa: F401
    except Exception:
        return False
    return True


def is_configured() -> bool:
    """True when a project URL and anon key are both usable."""
    return settings.supabase_rest_configured


def _build_client(service_role: bool):
    """Create a Supabase client, or None when it cannot be created.

    Imported lazily so the SQLite demo path never pays for (or breaks on) the
    optional dependency. `Exception` (not just `ModuleNotFoundError`) is caught
    because a shadowing namespace package raises a plain `ImportError`.
    """
    if not is_configured():
        return None
    try:
        from supabase import create_client
    except Exception:
        logger.debug("The optional `supabase` SDK is not installed.")
        return None

    key = (
        settings.supabase_service_role_key
        if service_role
        else settings.supabase_anon_key
    )
    if service_role and key is None:
        logger.warning(
            "A service-role Supabase client was requested but "
            "SUPABASE_SERVICE_ROLE_KEY is not set."
        )
        return None
    try:
        return create_client(REST_URL, key)
    except Exception:  # pragma: no cover - network / SDK version issues
        logger.warning("Could not create the Supabase client", exc_info=True)
        return None


def get_supabase():
    """The anon-key Supabase client, or None when unavailable.

    Respects Row Level Security, so it only sees what the project's policies
    allow. Use `get_supabase_admin()` for trusted server-side writes.
    """
    if "anon" not in _clients:
        _clients["anon"] = _build_client(service_role=False)
    return _clients["anon"]


def get_supabase_admin():
    """The service-role Supabase client, or None when unavailable.

    The service-role key bypasses Row Level Security. Never expose it to the
    frontend, and never return this client to a request handler that a patient
    or caregiver can drive directly.
    """
    if "service" not in _clients:
        _clients["service"] = _build_client(service_role=True)
    return _clients["service"]


def probe_rest(timeout: float = 5.0) -> Dict[str, Any]:
    """Check that SUPABASE_URL resolves and answers, over plain HTTPS.

    Uses `urllib` rather than the SDK on purpose, so the probe works with zero
    extra dependencies and can be called from `/health/supabase` on every
    deploy. Never raises.
    """
    report: Dict[str, Any] = {
        "configured": is_configured(),
        "sdk_installed": sdk_available(),
        "url": REST_URL or None,
        "reachable": None,
        "status_code": None,
        "error": None,
    }
    if not is_configured():
        report["error"] = "Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)."
        return report

    request = urllib.request.Request(
        f"{REST_URL}{GOtrue_HEALTH_PATH}",
        headers={
            "apikey": settings.supabase_anon_key or "",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            report["status_code"] = response.status
            report["reachable"] = response.status == 200
            try:
                report["project"] = json.loads(body or b"{}")
            except ValueError:
                report["project"] = None
    except urllib.error.HTTPError as exc:
        # A 401 here means the URL is right but the anon key is wrong, which is
        # a materially different problem from an unreachable project.
        report["status_code"] = exc.code
        report["reachable"] = False
        report["error"] = (
            f"HTTP {exc.code}: the project answered but rejected the request - "
            "check SUPABASE_ANON_KEY."
            if exc.code in (401, 403)
            else f"HTTP {exc.code} from {REST_URL}"
        )
    except Exception as exc:
        report["reachable"] = False
        report["error"] = f"{type(exc).__name__}: {exc}"
    return report


def supabase_status() -> Dict[str, Any]:
    """Compact, secret-free Supabase status for the health endpoints."""
    return {
        "configured": is_configured(),
        "database_in_use": settings.use_supabase_database,
        "database_managed_by": settings.database_info.get("managed_by"),
        "storage_bucket": settings.SUPABASE_STORAGE_BUCKET,
        "sdk_installed": sdk_available(),
    }

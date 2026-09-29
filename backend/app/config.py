"""
Application settings.

DATABASE RESOLUTION ORDER (see `Settings.resolved_database_url`):

  1. `USE_SUPABASE=true` plus a Supabase database password/host
     ->  the project's Supabase Postgres database.
  2. An explicit `DATABASE_URL` in the environment / `.env`
     ->  whatever that URL says (PostgreSQL, MySQL, ... as before).
  3. Nothing configured
     ->  the local SQLite file `backend/neuronest.db`.

SQLite stays the zero-config default on purpose: it keeps the pytest suite,
the offline-first PWA demo and a laptop with no internet working. Supabase is
strictly opt-in, so nobody is forced onto a hosted database to run the app.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from urllib.parse import quote

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings
from sqlalchemy.engine import make_url

#: Values that mean "the template was copied but never filled in". Treated as
#: unset so a half-edited `.env` falls back to SQLite with a clear warning
#: instead of trying to connect to `db.your-project-ref.supabase.co`.
_PLACEHOLDER_VALUES = {
    "",
    "your-supabase-db-password",
    "your-db-password",
    "your-supabase-password",
    "your-project-ref",
    "your-supabase-url",
    "your-supabase-anon-key",
    "your-supabase-publishable-key",
    "your-supabase-service-role-key",
    "your-supabase-secret-key",
    "changeme",
    "change-me",
}

#: Query parameters the Supabase dashboard appends to its pooler connection
#: string that libpq / psycopg2 rejects outright with
#: `invalid dsn: invalid connection option "pgbouncer"`. They are psycopg3 and
#: Supavisor concepts, so they are stripped before SQLAlchemy sees the URL.
_PSYCOPG2_UNSUPPORTED_PARAMS = {
    "pgbouncer",
    "connection_limit",
    "pool_mode",
    "supavisor",
}

#: Host fragments that identify Supabase's connection pooler (Supavisor).
#: The pooler needs a different SQLAlchemy pool strategy than a direct
#: connection - see `app.database.db.build_engine_kwargs`.
_POOLER_HOST_MARKERS = ("pooler.supabase.com", "pooler.supabase.co")

# Absolute path to the `backend/` package directory. A relative SQLite URL
# (`sqlite:///./neuronest.db`) is resolved by SQLAlchemy against the *process*
# working directory, so launching uvicorn from the repo root silently created a
# second, empty database at the root and logged every demo account out. We anchor
# the default to backend/ so the app behaves identically from any directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent

SQLITE_FALLBACK_URL: str = f"sqlite:///{(BACKEND_DIR / 'neuronest.db').as_posix()}"


def _default_database_url() -> str:
    return SQLITE_FALLBACK_URL


def is_unset(value: Optional[str]) -> bool:
    """True when `value` is missing, blank, or still an unedited placeholder."""
    if value is None:
        return True
    return value.strip().lower() in _PLACEHOLDER_VALUES


def url_is_postgres(url: str) -> bool:
    return url.startswith("postgresql") or url.startswith("postgres://")


def is_pooler_host(host: Optional[str]) -> bool:
    """True when `host` is Supabase's Supavisor connection pooler."""
    if not host:
        return False
    lowered = host.lower()
    return any(marker in lowered for marker in _POOLER_HOST_MARKERS)


def _strip_pooler_params(url: str) -> str:
    """Remove query parameters psycopg2 cannot parse from `url`."""
    if "?" not in url:
        return url
    base, _, query = url.partition("?")
    kept = [
        part
        for part in query.split("&")
        if part
        and part.split("=", 1)[0].strip().lower() not in _PSYCOPG2_UNSUPPORTED_PARAMS
    ]
    return f"{base}?{'&'.join(kept)}" if kept else base


def normalize_database_url(url: str) -> str:
    """Make a pasted Supabase / PostgreSQL URL usable by SQLAlchemy + psycopg2.

    * `postgres://` and driver-less `postgresql://` are rewritten to the
      `postgresql+psycopg2://` dialect. SQLAlchemy otherwise picks whichever
      driver it finds first and fails with a confusing
      `ModuleNotFoundError: No module named 'psycopg2'` when the project only
      has psycopg 3 / asyncpg installed.
    * pooler-only query parameters are dropped (see
      `_PSYCOPG2_UNSUPPORTED_PARAMS`).
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://") :]
    if url.startswith("postgresql+psycopg2://"):
        return _strip_pooler_params(url)
    return url


def with_sslmode(url: str, sslmode: Optional[str]) -> str:
    """Append `?sslmode=...` when the URL does not already carry one.

    Supabase refuses unencrypted connections, and its error message
    (`FATAL: no pg_hba.conf entry for host ..., no encryption`) never mentions
    sslmode, which makes a missing TLS flag very hard to diagnose. So TLS is
    switched on by default for any Postgres URL that lacks it.
    """
    if not sslmode or not url_is_postgres(url) or "sslmode=" in url.lower():
        return url
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}sslmode={sslmode}"


def build_supabase_database_url(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    sslmode: Optional[str] = "require",
) -> str:
    """Compose a SQLAlchemy URL from the Supabase connection fields.

    The password is percent-encoded: Supabase generates passwords containing
    `@`, `#`, `/` and `:`, all of which corrupt a hand-concatenated URL.
    `urllib.parse.quote` is used rather than `quote_plus` because SQLAlchemy
    unquotes userinfo with `unquote`, where `+` is a literal plus and not a
    space.
    """
    credentials = f"{quote(user, safe='')}:{quote(password, safe='')}"
    url = f"postgresql+psycopg2://{credentials}@{host}:{port}/{database}"
    return with_sslmode(url, sslmode)


def describe_database_url(url: str) -> Dict[str, Any]:
    """Describe `url` without ever exposing the password.

    # Consumed by `/health`, the bootstrap script, and `build_engine_kwargs`
    # (which uses `pooler` to pick a pool strategy).
    """
    info: Dict[str, Any] = {
        "backend": "unknown",
        "host": None,
        "port": None,
        "database": None,
        "pooler": False,
        "ssl": None,
        "managed_by": "self-hosted",
    }
    try:
        parsed = make_url(url)
    except Exception:  # a malformed URL must never break /health
        return info

    info["backend"] = parsed.get_backend_name()
    info["host"] = parsed.host or None
    info["port"] = parsed.port
    info["database"] = parsed.database or None
    query = {str(k).lower(): v for k, v in (parsed.query or {}).items()}
    info["ssl"] = query.get("sslmode") or (
        "built-in" if info["backend"] == "sqlite" else None
    )
    info["pooler"] = is_pooler_host(info["host"])
    if info["host"] and "supabase" in info["host"].lower():
        info["managed_by"] = "supabase"
    return info


class Settings(BaseSettings):
    # ---- Core ----
    DATABASE_URL: str = _default_database_url()
    JWT_SECRET_KEY: str = "neuronest-dev-secret-key-2024"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # Accepted forms (see `_coerce_cors_origins`):
    #   JSON list (`.env` default):  CORS_ORIGINS=["http://localhost:5173"]
    #   plain string (Render env):   CORS_ORIGINS=https://app.onrender.com
    #   comma-separated (Render):    CORS_ORIGINS=https://a.onrender.com,https://b.onrender.com
    # The `Union[List[str], str]` annotation is not decorative: pydantic-settings
    # only tolerates a non-JSON env value when the field is a union that contains
    # a complex member (`EnvSettingsSource._field_is_complex` -> allow_parse_failure).
    # With a bare `List[str]`, a plain URL from Render's env panel raised
    # SettingsError at import time and the API never booted.
    CORS_ORIGINS: Union[List[str], str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"]
    )

    # ---- Supabase ----
    # Hosted Postgres + REST for this project. Opt in with USE_SUPABASE=true.
    USE_SUPABASE: bool = False

    # Project API. Used by app/database/supabase_client.py for Storage /
    # Realtime, and by the reachability probe behind /health/supabase.
    # Supabase renamed keys in 2025: anon -> publishable, service_role -> secret.
    # Both namings are accepted here; SUPABASE_ANON_KEY takes priority when both
    # are set so existing deployments do not change behaviour.
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_SECRET_KEY: Optional[str] = None

    # Database connection. Supply EITHER the connection fields below
    # (SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD, or just SUPABASE_PROJECT_REF +
    # SUPABASE_DB_PASSWORD) OR set DATABASE_URL to the full pasted string.
    SUPABASE_PROJECT_REF: Optional[str] = None
    SUPABASE_DB_HOST: Optional[str] = None
    SUPABASE_DB_PORT: int = 5432
    SUPABASE_DB_NAME: str = "postgres"
    SUPABASE_DB_USER: Optional[str] = None
    SUPABASE_DB_PASSWORD: Optional[str] = None
    SUPABASE_SSL_MODE: str = "require"
    #: Force the pooler code path (NullPool) even when the host does not look
    #: like a pooler - useful behind a custom domain in front of Supavisor.
    SUPABASE_POOLER: bool = False
    #: Optional Storage bucket name, reserved for future media uploads.
    SUPABASE_STORAGE_BUCKET: str = "neuronest-uploads"

    # ---- Connection pool (ignored by SQLite) ----
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE_SECONDS: int = 300
    DB_CONNECT_TIMEOUT_SECONDS: int = 10

    # ---- Health endpoints ----
    #: Include per-table row counts in /health/database. Off by default: that
    #: endpoint is unauthenticated, and the number of registered users is not
    #: something a public probe should publish. Turn it on locally to confirm
    #: that real data landed in Supabase (scripts/supabase_setup.py --check
    #: always reports counts, since it runs on your machine).
    HEALTH_EXPOSE_COUNTS: bool = False

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _coerce_cors_origins(cls, value: Any) -> Any:
        """Accept a JSON list or a plain comma-separated string.

        Render (and most hosts) store env vars as raw strings, so
        ``CORS_ORIGINS=https://app.onrender.com`` must work, as must
        ``CORS_ORIGINS=https://a.onrender.com,https://b.onrender.com``.
        ``.env`` files keep using the JSON list form.
        """
        if value is None or isinstance(value, list):
            return value
        text = str(value).strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except ValueError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return [part.strip().rstrip("/") for part in text.split(",") if part.strip()]

    class Config:
        # Resolved relative to the process CWD, which is `backend/` (the dir
        # holding `requirements.txt` and `neuronest.db`) per the run
        # instructions. `"../.env"` never resolved for either `backend/.env`
        # (run from backend/) or a repo-root `.env` (run from repo root),
        # which silently left every setting on its default.
        env_file = ".env"
        env_file_encoding = "utf-8"
        # pydantic-settings defaults to extra="forbid", which turns ANY
        # unrecognised key in `.env` (or the environment) into a startup
        # ValidationError. An unknown key must never stop the API from booting.
        extra = "ignore"
        case_sensitive = False

    # ------------------------------------------------------------------
    # Supabase helpers
    # ------------------------------------------------------------------
    @property
    def supabase_anon_key(self) -> Optional[str]:
        """The publishable/anon key, accepting either the old or new name."""
        if not is_unset(self.SUPABASE_ANON_KEY):
            return (self.SUPABASE_ANON_KEY or "").strip()
        if not is_unset(self.SUPABASE_PUBLISHABLE_KEY):
            return (self.SUPABASE_PUBLISHABLE_KEY or "").strip()
        return None

    @property
    def supabase_service_role_key(self) -> Optional[str]:
        """The secret/service_role key, accepting either the old or new name."""
        if not is_unset(self.SUPABASE_SERVICE_ROLE_KEY):
            return (self.SUPABASE_SERVICE_ROLE_KEY or "").strip()
        if not is_unset(self.SUPABASE_SECRET_KEY):
            return (self.SUPABASE_SECRET_KEY or "").strip()
        return None

    @property
    def supabase_rest_configured(self) -> bool:
        """True when the project URL + anon/publishable key are usable (SDK / REST access)."""
        return not is_unset(self.SUPABASE_URL) and self.supabase_anon_key is not None

    @property
    def supabase_host(self) -> Optional[str]:
        """The database host, derived from the project ref when not given."""
        if not is_unset(self.SUPABASE_DB_HOST):
            return self.SUPABASE_DB_HOST.strip()
        if not is_unset(self.SUPABASE_PROJECT_REF):
            return f"db.{self.SUPABASE_PROJECT_REF.strip()}.supabase.co"
        return None

    # ------------------------------------------------------------------
    # Auth - Google sign-in (Google Identity Services)
    # ------------------------------------------------------------------
    # The browser gets a Google ID token with GIS; the backend verifies it
    # against Google's tokeninfo endpoint and mints the app's own JWT, so the
    # rest of the stack (SQLite or Supabase, ProtectedRoute, offline sync)
    # works unchanged. Empty => the Login page hides the Google button.
    GOOGLE_CLIENT_ID: Optional[str] = None
    # Comma-separated allow-list; empty means any valid Google account may sign
    # in. Useful for a family/caregiver pilot.
    GOOGLE_ALLOWED_EMAILS: Optional[str] = None
    # Default role for first-time Google users (they pick it on the Login page
    # before continuing; this is only the fallback).
    GOOGLE_DEFAULT_ROLE: str = "patient"

    @property
    def google_configured(self) -> bool:
        """True when Google sign-in can be offered (a client id is set)."""
        return not is_unset(self.GOOGLE_CLIENT_ID)

    @property
    def supabase_uses_pooler(self) -> bool:
        """True when the active Supabase connection goes through the pooler."""
        return bool(self.SUPABASE_POOLER) or is_pooler_host(self.supabase_host)

    @property
    def supabase_user(self) -> str:
        """The database role to authenticate as.

        Supavisor's pooler (port 6543 / `*.pooler.supabase.com`) requires
        `postgres.<project-ref>`, while a direct connection (port 5432 /
        `db.<ref>.supabase.co`) uses plain `postgres`. Getting this wrong yields
        `FATAL: Tenant or user not found`, so it is derived rather than left to
        the user to remember.
        """
        if not is_unset(self.SUPABASE_DB_USER):
            return self.SUPABASE_DB_USER.strip()
        if self.supabase_uses_pooler and not is_unset(self.SUPABASE_PROJECT_REF):
            return f"postgres.{self.SUPABASE_PROJECT_REF.strip()}"
        return "postgres"

    @property
    def supabase_db_configured(self) -> bool:
        """True when a password plus a host (direct or via project ref) exist."""
        return not is_unset(self.SUPABASE_DB_PASSWORD) and self.supabase_host is not None

    def build_supabase_database_url(self) -> Optional[str]:
        """Build the SQLAlchemy URL for this project, or None if incomplete."""
        if not self.supabase_db_configured:
            return None
        host = self.supabase_host
        if not host:
            return None
        return build_supabase_database_url(
            host=host,
            port=self.SUPABASE_DB_PORT,
            database=self.SUPABASE_DB_NAME,
            user=self.supabase_user,
            password=(self.SUPABASE_DB_PASSWORD or "").strip(),
            sslmode=self.SUPABASE_SSL_MODE,
        )

    @property
    def use_supabase_database(self) -> bool:
        """True when Supabase Postgres is the database that serves the API."""
        return bool(self.USE_SUPABASE) and self.supabase_db_configured

    @property
    def resolved_database_url(self) -> str:
        """The URL SQLAlchemy is built with. See the module docstring for order."""
        if self.use_supabase_database:
            url = self.build_supabase_database_url()
            if url:
                return url
        return normalize_database_url(
            with_sslmode(self.DATABASE_URL, self.SUPABASE_SSL_MODE)
        )

    @property
    def database_info(self) -> Dict[str, Any]:
        """Non-secret description of the active database connection."""
        info = describe_database_url(self.resolved_database_url)
        info["source"] = "supabase" if self.use_supabase_database else "DATABASE_URL"
        return info

    @property
    def configuration_warnings(self) -> List[str]:
        """Human-readable config problems, logged at startup.

        These are warnings and never hard failures: an unconfigured or
        half-filled Supabase block must fall back to SQLite rather than stop
        the API from booting.
        """
        warnings: List[str] = []
        if self.USE_SUPABASE and not self.supabase_db_configured:
            warnings.append(
                "USE_SUPABASE=true but SUPABASE_DB_PASSWORD is missing (and no "
                "host or project ref was supplied). Falling back to DATABASE_URL."
            )
        if self.USE_SUPABASE and not self.supabase_rest_configured:
            warnings.append(
                "USE_SUPABASE=true but SUPABASE_URL / SUPABASE_ANON_KEY are not "
                "set, so the Supabase REST/Storage client stays disabled."
            )
        if not self.USE_SUPABASE and self.supabase_db_configured:
            warnings.append(
                "Supabase credentials are present but USE_SUPABASE is not true, "
                "so the local SQLite database is still in use."
            )
        if url_is_postgres(self.resolved_database_url) and "sslmode=" not in self.resolved_database_url:
            warnings.append(
                "The Postgres URL has no sslmode; Supabase rejects unencrypted "
                "connections."
            )
        return warnings


settings = Settings()

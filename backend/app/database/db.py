"""Database engine + session factory.

The API stores everything in one relational database whose URL comes from
`app.config.Settings.resolved_database_url`:

  * **Supabase Postgres**  - when `USE_SUPABASE=true`
  * any other Postgres / SQLite - via `DATABASE_URL`
  * `backend/neuronest.db` - the zero-config SQLite default

Supabase *is* PostgreSQL, so every model, query and service in this project
works against it unchanged. Only the connection has to be configured
differently: TLS is mandatory, and the connection pooler needs its own pool
strategy.
"""

import logging
import time
from typing import Any, Dict

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import is_pooler_host, settings

logger = logging.getLogger("neuronest.database")

DATABASE_URL = settings.resolved_database_url
DATABASE_INFO = settings.database_info


def _verify_driver(url: str) -> None:
    """Fail with an actionable message when the Postgres driver is missing."""
    if not url.startswith("postgresql"):
        return
    try:
        import psycopg2  # noqa: F401
    except ModuleNotFoundError as exc:  # pragma: no cover - environment issue
        raise RuntimeError(
            "The configured database is PostgreSQL (Supabase) but the psycopg2 "
            "driver is not installed, so SQLAlchemy cannot connect.\n"
            "Install it with:\n"
            "    cd F:\\Neuronest-AI\\backend\n"
            "    ..\\venv\\Scripts\\python.exe -m pip install -r requirements.txt\n"
            "or directly:\n"
            "    ..\\venv\\Scripts\\python.exe -m pip install psycopg2-binary"
        ) from exc


def build_engine_kwargs(
    url: str,
    *,
    pool_size: int = 5,
    max_overflow: int = 10,
    pool_recycle: int = 300,
    connect_timeout: int = 10,
) -> Dict[str, Any]:
    """Engine options for `url`. A pure function, so it can be unit-tested.

    Supabase specifics:

    * **TLS** is mandatory, so `sslmode` is forwarded through `connect_args`.
    * **`pool_pre_ping`** discards connections Supabase quietly closed. The
      free tier reaps idle server connections, which otherwise surfaces as
      `server closed the connection unexpectedly` on the first request after a
      quiet period - a failure that only appears once the demo has sat idle.
    * **Supavisor's transaction pooler** already multiplexes many clients onto
      a few server connections. Adding a client-side pool on top of it
      multiplies those connections and exhausts the project's connection
      budget, so the pooler gets `NullPool` while a direct connection gets a
      normal pool.
    """
    params = make_url(url)
    kwargs: Dict[str, Any] = {"pool_pre_ping": True}

    if params.get_backend_name() == "sqlite":
        # SQLite needs no TLS and no pool tuning. FastAPI runs sync sessions in
        # a threadpool, hence check_same_thread=False.
        kwargs["connect_args"] = {"check_same_thread": False}
        return kwargs

    query = {str(k).lower(): v for k, v in (params.query or {}).items()}
    connect_args: Dict[str, Any] = {"connect_timeout": connect_timeout}
    if query.get("sslmode"):
        connect_args["sslmode"] = query["sslmode"]
    kwargs["connect_args"] = connect_args

    if is_pooler_host(params.host):
        kwargs["poolclass"] = NullPool
    else:
        kwargs["pool_size"] = pool_size
        kwargs["max_overflow"] = max_overflow
        kwargs["pool_recycle"] = pool_recycle
    return kwargs


_verify_driver(DATABASE_URL)

engine = create_engine(
    DATABASE_URL,
    **build_engine_kwargs(
        DATABASE_URL,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
        connect_timeout=settings.DB_CONNECT_TIMEOUT_SECONDS,
    ),
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_soft():
    """Yield a Session, or None when a session cannot even be opened.

    Used by `/health`: a liveness probe must be able to report "the database is
    down" instead of turning into an opaque 500 before the handler runs.
    """
    try:
        db = SessionLocal()
    except Exception:  # pragma: no cover - severe misconfiguration only
        logger.warning("Could not open a database session", exc_info=True)
        yield None
        return
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception:  # pragma: no cover
            pass


def database_backend() -> str:
    """Short label for the active database: "sqlite", "postgresql", ..."""
    return str(DATABASE_INFO.get("backend") or "unknown")


def check_database_connection(*, include_counts: bool = False) -> Dict[str, Any]:
    """Probe the database with `SELECT 1` and describe the result.

    Never raises, so it is safe to call from a health endpoint. Row counts are
    opt-in (`include_counts`) because a health endpoint is normally public and
    the number of registered users is not something to publish.
    """
    started = time.perf_counter()
    report: Dict[str, Any] = {
        "backend": database_backend(),
        "managed_by": DATABASE_INFO.get("managed_by"),
        "host": DATABASE_INFO.get("host"),
        "database": DATABASE_INFO.get("database"),
        "pooler": bool(DATABASE_INFO.get("pooler")),
        "ssl": DATABASE_INFO.get("ssl"),
        "connected": False,
        "latency_ms": None,
        "tables": None,
        "error": None,
    }
    # Fixed tuple, never user input - safe to interpolate into the query.
    countable_tables = (
        "users",
        "caregiver_patient",
        "game_sessions",
        "recommendations",
        "reminders",
    )
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            report["connected"] = True
            report["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
            if include_counts:
                present = inspect(connection).get_table_names()
                report["tables"] = present
                report["row_counts"] = {
                    table: int(
                        connection.execute(
                            text(f"SELECT COUNT(*) FROM {table}")
                        ).scalar()
                        or 0
                    )
                    for table in countable_tables
                    if table in present
                }
    except (SQLAlchemyError, OSError) as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
    return report

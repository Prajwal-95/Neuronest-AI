"""Bring an existing database up to the current models without losing data.

SQLite and Supabase start from the same SQLAlchemy models, but a database
created BEFORE a model change (e.g. the Google-OAuth columns) is missing those
columns — and `create_all()` never adds a column to an existing table. This
helper runs at startup (and from `supabase_setup.py --create`) and issues the
minimal `ADD COLUMN IF NOT EXISTS`-style migration for the known additions.

Safe to run on every boot: each step checks the live table first and skips
when the column already exists. Only additive changes live here — nothing is
ever dropped or renamed.
"""

import logging

from sqlalchemy import inspect, text

logger = logging.getLogger("neuronest.database.migrate")

#: (table, column, ddl-fragment-per-dialect-backend). SQLite has no
#: `ADD COLUMN IF NOT EXISTS`, so existence is checked via the inspector.
_ADD_COLUMNS = (
    ("users", "google_sub", {
        "sqlite": "ALTER TABLE users ADD COLUMN google_sub VARCHAR",
        "postgresql": "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR",
    }),
    ("users", "auth_provider", {
        "sqlite": "ALTER TABLE users ADD COLUMN auth_provider VARCHAR DEFAULT 'local'",
        "postgresql": (
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR "
            "DEFAULT 'local'"
        ),
    }),
    ("users", "avatar_url", {
        "sqlite": "ALTER TABLE users ADD COLUMN avatar_url VARCHAR",
        "postgresql": "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
    }),
)

#: Unique indexes backing the Google-link lookups. Plain CREATE INDEX exists on
#: SQLite (no IF NOT EXISTS for older versions is fine — we check first).
_ADD_INDEXES = (
    ("ix_users_google_sub", "users", "google_sub"),
)


def ensure_lightweight_migrations(engine) -> None:
    """Add any missing additive columns/indexes. Never raises."""
    try:
        backend = engine.url.get_backend_name()
        with engine.begin() as connection:
            existing_tables = set(inspect(connection).get_table_names())
            for table, column, statements in _ADD_COLUMNS:
                if table not in existing_tables:
                    continue  # create_all() owns brand-new tables
                existing = {col["name"] for col in inspect(connection).get_columns(table)}
                if column in existing:
                    continue
                statement = statements.get(backend, statements.get("postgresql"))
                connection.execute(text(statement))
                logger.info("Migration: added %s.%s", table, column)
            for index_name, table, column in _ADD_INDEXES:
                if table not in existing_tables:
                    continue
                existing_indexes = {idx["name"] for idx in inspect(connection).get_indexes(table)}
                if index_name in existing_indexes:
                    continue
                connection.execute(
                    text(f"CREATE UNIQUE INDEX {index_name} ON {table} ({column})")
                )
                logger.info("Migration: added index %s", index_name)
    except Exception as exc:  # startup must never crash on a migration
        logger.warning(
            "Lightweight migration skipped (%s: %s). Google login may fail until "
            "the columns exist — run scripts/supabase_setup.py --create.",
            type(exc).__name__,
            exc,
        )

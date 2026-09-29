"""Supabase bootstrap and verification CLI for NeuroNest AI.

Run it from `backend/`:

    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --check
    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --create
    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --seed
    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --schema
    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --probe
    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --all

Commands
    --check    verify the configuration, connect, and list tables + row counts
    --create   create any missing tables (safe to repeat)
    --seed     create tables, then (re)load the demo accounts + 3 weeks of data
    --schema   print db/schema.sql, ready to paste into the SQL Editor
    --probe    HTTPS round trip to the Supabase project (validates URL + key)

The exit code is 0 only when every requested step succeeded, so this can gate a
deploy script.

`--seed` DELETES all rows before inserting. Because that is destructive, it
refuses to run against a database that already holds an account which is not
one of the three seeded demo users, unless `--force` is also passed. That guard
is what stops `--seed` from wiping a Supabase project holding real data.
"""

import argparse
import sys
from pathlib import Path
from types import SimpleNamespace

# Make `import app.*` work no matter which directory the script is run from.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Lives in `db/`, NOT in a folder called `supabase/`. Anything sitting directly
# inside `backend/` is importable as a namespace package, and a `supabase/`
# directory here silently shadows the real Supabase SDK for every import in the
# app (`import supabase` succeeds and returns an empty module).
SCHEMA_FILE = BACKEND_DIR / "db" / "schema.sql"

#: The only accounts `--seed` is allowed to wipe without --force.
DEMO_EMAILS = {
    "caregiver@neuronest.demo",
    "patient@neuronest.demo",
    "meena@neuronest.demo",
}

OK = "[ OK ]"
WARN = "[WARN]"
FAIL = "[FAIL]"
INFO = "[ .. ]"


def section(title: str) -> None:
    print()
    print("-" * 68)
    print(title)
    print("-" * 68)


def load_app() -> SimpleNamespace:
    """Import the app's database layer, or exit with a readable error."""
    try:
        from app.config import settings
        from app.database.db import (
            Base,
            DATABASE_INFO,
            DATABASE_URL,
            SessionLocal,
            check_database_connection,
            engine,
        )

        # Importing the models registers every table on Base.metadata. Without
        # this the metadata is EMPTY and `--create` would silently create
        # nothing while reporting success - the worst possible failure mode for
        # a setup script.
        import app.models.models  # noqa: F401
    except RuntimeError as exc:
        # e.g. a Postgres URL with no psycopg2 installed.
        print(f"{FAIL} {exc}")
        raise SystemExit(1)
    return SimpleNamespace(
        settings=settings,
        Base=Base,
        DATABASE_INFO=DATABASE_INFO,
        DATABASE_URL=DATABASE_URL,
        SessionLocal=SessionLocal,
        check_database_connection=check_database_connection,
        engine=engine,
    )


def redact(url: str) -> str:
    """Render a database URL with the password replaced by ***."""
    from sqlalchemy.engine import make_url

    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<unparseable URL>"


def cmd_check(app: SimpleNamespace) -> bool:
    """Report configuration, connectivity, tables and row counts. Read-only."""
    info = app.settings.database_info
    section("Configuration")
    print(f"{INFO} source ......... {info.get('source')}")
    print(f"{INFO} backend ........ {info.get('backend')}")
    print(f"{INFO} managed by ..... {info.get('managed_by')}")
    print(f"{INFO} host ........... {info.get('host') or '(local file)'}")
    print(f"{INFO} port ........... {info.get('port')}")
    print(f"{INFO} database ....... {info.get('database')}")
    print(f"{INFO} TLS ............ {info.get('ssl')}")
    print(f"{INFO} pooler ......... {'yes (NullPool)' if info.get('pooler') else 'no'}")
    print(f"{INFO} URL ............ {redact(app.DATABASE_URL)}")

    for warning in app.settings.configuration_warnings:
        print(f"{WARN} {warning}")

    section("Connection")
    report = app.check_database_connection(include_counts=True)
    if report["connected"]:
        print(f"{OK} Connected in {report['latency_ms']} ms")
    else:
        print(f"{FAIL} Not connected: {report['error']}")
        print()
        print("  Things to check in backend/.env:")
        print("    * USE_SUPABASE=true")
        print("    * SUPABASE_DB_PASSWORD is the DATABASE password (Set up")
        print("      database password), NOT the anon or service_role API key")
        print("    * SUPABASE_DB_HOST / SUPABASE_PROJECT_REF match the project")
        print("    * the project is not paused (Supabase pauses idle free ones)")
        return False

    tables = report.get("tables") or []
    expected = sorted(app.Base.metadata.tables)
    missing = [t for t in expected if t not in tables]
    if missing:
        print(f"{WARN} Missing tables: {', '.join(missing)}")
        print(f"       Run:  ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --create")
    else:
        print(f"{OK} All {len(expected)} tables present")

    counts = report.get("row_counts") or {}
    if counts:
        print()
        print(f"{INFO} Stored rows:")
        for table, count in sorted(counts.items()):
            print(f"         {table:<20} {count}")
        if not any(counts.values()):
            print(f"{WARN} Every table is empty. Load the demo data with --seed,")
            print("       or register an account through the app.")

    if report.get("backend") == "sqlite":
        print()
        print(f"{WARN} This is the local SQLite file, not Supabase. Set")
        print("       USE_SUPABASE=true in backend/.env to use the hosted database.")
    return not missing


def cmd_create(app: SimpleNamespace) -> bool:
    """Create any missing tables. Never drops and never alters existing ones."""
    from sqlalchemy import inspect
    from sqlalchemy.exc import SQLAlchemyError

    section("Creating tables")
    from app.database.db import database_backend

    try:
        inspector = inspect(app.engine)
        existing = set(inspector.get_table_names())
    except (SQLAlchemyError, OSError) as exc:
        print(f"{FAIL} Cannot reach the database: {type(exc).__name__}: {exc}")
        return False

    expected = sorted(app.Base.metadata.tables)
    missing = [name for name in expected if name not in existing]
    if not missing:
        print(f"{OK} All {len(expected)} tables already exist")
        print(f"{INFO} Target: {database_backend()}")
        return True

    print(f"{INFO} Creating: {', '.join(missing)}")
    try:
        app.Base.metadata.create_all(bind=app.engine)
    except (SQLAlchemyError, OSError) as exc:
        print(f"{FAIL} create_all failed: {type(exc).__name__}: {exc}")
        return False

    present = set(inspect(app.engine).get_table_names())
    try:
        from app.database.migrate import ensure_lightweight_migrations

        ensure_lightweight_migrations(app.engine)
    except Exception as exc:  # pragma: no cover - migration helper issue
        print(f"{WARN} Lightweight migration skipped: {exc}")
    present = set(inspect(app.engine).get_table_names())
    still_missing = [name for name in expected if name not in present]
    if still_missing:
        print(f"{FAIL} Still missing after create_all: {', '.join(still_missing)}")
        return False
    print(f"{OK} Schema ready on {database_backend()} ({len(expected)} tables)")
    print(f"{INFO} Tip: run scripts\\supabase_setup.py --schema and paste it into")
    print("       the Supabase SQL Editor to enable Row Level Security.")
    return True


def _non_demo_accounts(app: SimpleNamespace) -> list:
    """Emails of accounts that `--seed` would destroy (not the demo trio)."""
    from app.models.models import User

    session = app.SessionLocal()
    try:
        rows = session.query(User.email).all()
    except Exception:
        # No users table yet - nothing can be lost.
        return []
    finally:
        session.close()
    return sorted(
        email for (email,) in rows if (email or "").lower() not in DEMO_EMAILS
    )


def cmd_seed(app: SimpleNamespace, force: bool) -> bool:
    """Load the demo accounts + 3 weeks of sessions. DESTRUCTIVE."""
    section("Seeding demo data")
    if not cmd_create(app):
        return False

    real = _non_demo_accounts(app)
    if real and not force:
        print()
        print(f"{FAIL} Refusing to seed: this database already holds "
              f"{len(real)} account(s) that are not demo users:")
        for email in real[:10]:
            print(f"         {email}")
        if len(real) > 10:
            print(f"         ... and {len(real) - 10} more")
        print()
        print("  --seed DELETES every row in users, game_sessions, reminders,")
        print("  recommendations and caregiver_patient before loading the demo")
        print("  accounts. If this is a real Supabase project, stop here.")
        print("  To overwrite it anyway:")
        print("    ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --seed --force")
        return False

    if real:
        print(f"{WARN} --force: replacing {len(real)} non-demo account(s).")

    from seed import seed

    try:
        seed()
    except Exception as exc:
        print(f"{FAIL} Seeding failed: {type(exc).__name__}: {exc}")
        return False

    location = app.DATABASE_INFO.get("host") or app.DATABASE_INFO.get("database")
    print(f"{OK} Demo data written to {app.DATABASE_INFO.get('backend')} ({location})")
    return True


def cmd_schema(_app: SimpleNamespace) -> bool:
    """Print db/schema.sql, ready for the Supabase SQL Editor."""
    section("Supabase SQL Editor schema")
    if not SCHEMA_FILE.exists():
        print(f"{FAIL} {SCHEMA_FILE} is missing from the repository")
        return False
    print(SCHEMA_FILE.read_text(encoding="utf-8"))
    print()
    print(f"{INFO} Paste the block above into Supabase -> SQL Editor -> Run.")
    print(f"{INFO} It also enables Row Level Security, so the public anon key")
    print("       cannot read patient data through the REST API.")
    return True


def cmd_probe(_app: SimpleNamespace) -> bool:
    """HTTPS round trip that validates SUPABASE_URL and SUPABASE_ANON_KEY."""
    from app.database.supabase_client import probe_rest

    section("Supabase REST probe")
    report = probe_rest()
    if not report["configured"]:
        print(f"{WARN} Supabase REST is not configured: {report['error']}")
        print("       Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.")
        print("       (This does not affect the database connection.)")
        return False
    print(f"{INFO} project ........ {report['url']}")
    print(f"{INFO} SDK installed .. {report['sdk_installed']}")
    if report["reachable"]:
        project = report.get("project") or {}
        print(f"{OK} Reachable (HTTP {report['status_code']}) "
              f"{project.get('name', '')} {project.get('version', '')}".rstrip())
        return True
    print(f"{FAIL} {report['error']}")
    return False


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="supabase_setup.py",
        description="Bootstrap and verify the NeuroNest AI Supabase database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --all\n"
            "  ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --create\n"
            "  ..\\venv\\Scripts\\python.exe scripts\\supabase_setup.py --seed\n\n"
            "Docs: docs\\SUPABASE_SETUP.md\n"
        ),
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true",
                        help="verify config, connect, list tables + row counts")
    action.add_argument("--create", action="store_true",
                        help="create any missing tables")
    action.add_argument("--seed", action="store_true",
                        help="create tables, then load the demo data (destructive)")
    action.add_argument("--schema", action="store_true",
                        help="print db/schema.sql for the SQL Editor")
    action.add_argument("--probe", action="store_true",
                        help="HTTPS round trip to the Supabase project")
    action.add_argument("--all", action="store_true",
                        help="--probe followed by --check")
    parser.add_argument("--force", action="store_true",
                        help="let --seed overwrite non-demo accounts too")
    args = parser.parse_args(argv)

    print("=" * 68)
    print("NEURONEST AI  --  SUPABASE SETUP")
    print("=" * 68)

    app = load_app()

    if args.schema:
        ok = cmd_schema(app)
    elif args.probe:
        ok = cmd_probe(app)
    elif args.create:
        ok = cmd_create(app)
    elif args.seed:
        ok = cmd_seed(app, args.force)
    elif args.all:
        probed = cmd_probe(app)
        checked = cmd_check(app)
        ok = probed and checked
    else:  # --check
        ok = cmd_check(app)

    section("Result")
    print(f"{OK if ok else FAIL} "
          f"{'All steps succeeded.' if ok else 'One or more steps failed.'}")
    print()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Tests for the Supabase / PostgreSQL integration.

These are offline tests: no network access and no Supabase project required.
They cover the URL-resolution rules, the engine options chosen for Supabase's
connection pooler, the schema file staying in sync with the ORM models, the
extra health endpoints, and the guard that stops `supabase_setup.py --seed`
from wiping a database that holds real accounts.

    cd backend
    ..\\venv\\Scripts\\python.exe -m pytest tests/test_supabase_config.py -v
"""

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateIndex, CreateTable

from app.config import (
    BACKEND_DIR,
    Settings,
    build_supabase_database_url,
    describe_database_url,
    is_unset,
    normalize_database_url,
    with_sslmode,
)
from app.database.db import Base, build_engine_kwargs
from app.main import app
from app.models.models import User, UserRole

# The setup script lives outside the `app` package; import it the same way a
# developer runs it.
sys.path.insert(0, str(BACKEND_DIR / "scripts"))
import supabase_setup  # noqa: E402

SCHEMA_FILE = BACKEND_DIR / "db" / "schema.sql"

DIRECT_URL = "postgresql://postgres:pw@db.abcdefghijklm.supabase.co:5432/postgres"
POOLER_URL = (
    "postgresql://postgres.abcdefghijklm:pw@aws-0-ap-south-1.pooler.supabase.com"
    ":6543/postgres?pgbouncer=true&connection_limit=1"
)


def make_settings(**overrides) -> Settings:
    """Settings with every Supabase field pinned.

    `_env_file=None` skips the developer's real `backend/.env`, so an assertion
    can never be broken (or accidentally satisfied) by local credentials.
    """
    pinned = {
        "DATABASE_URL": "sqlite:///:memory:",
        "USE_SUPABASE": False,
        "SUPABASE_URL": None,
        "SUPABASE_ANON_KEY": None,
        "SUPABASE_PUBLISHABLE_KEY": None,
        "SUPABASE_SERVICE_ROLE_KEY": None,
        "SUPABASE_SECRET_KEY": None,
        "SUPABASE_PROJECT_REF": None,
        "SUPABASE_DB_HOST": None,
        "SUPABASE_DB_PORT": 5432,
        "SUPABASE_DB_NAME": "postgres",
        "SUPABASE_DB_USER": None,
        "SUPABASE_DB_PASSWORD": None,
        "SUPABASE_SSL_MODE": "require",
        "SUPABASE_POOLER": False,
    }
    pinned.update(overrides)
    return Settings(_env_file=None, **pinned)


def normalized(sql: str) -> str:
    """Collapse whitespace so generated DDL and the .sql file compare equal."""
    return " ".join(sql.replace("IF NOT EXISTS ", "").split()).lower()


class TestUrlNormalisation(unittest.TestCase):
    """A pasted Supabase connection string must survive contact with SQLAlchemy."""

    def test_postgres_scheme_selects_psycopg2(self):
        self.assertTrue(
            normalize_database_url(DIRECT_URL).startswith("postgresql+psycopg2://")
        )

    def test_legacy_postgres_scheme_is_rewritten(self):
        url = normalize_database_url("postgres://u:p@h:5432/d")
        self.assertTrue(url.startswith("postgresql+psycopg2://"))

    def test_driverless_url_is_not_double_prefixed(self):
        url = normalize_database_url("postgresql+psycopg2://u:p@h:5432/d")
        self.assertEqual(url, "postgresql+psycopg2://u:p@h:5432/d")

    def test_pooler_only_params_are_stripped(self):
        """psycopg2 raises `invalid dsn` on pgbouncer / connection_limit."""
        url = normalize_database_url(POOLER_URL)
        self.assertNotIn("pgbouncer", url)
        self.assertNotIn("connection_limit", url)
        # The rest of the URL must be untouched.
        self.assertIn("pooler.supabase.com:6543", url)

    def test_sslmode_is_added_to_postgres_urls(self):
        url = with_sslmode(normalize_database_url(DIRECT_URL), "require")
        self.assertIn("sslmode=require", url)

    def test_existing_sslmode_is_not_duplicated(self):
        url = with_sslmode("postgresql://u:p@h/d?sslmode=verify-full", "require")
        self.assertEqual(url.count("sslmode="), 1)
        self.assertIn("verify-full", url)

    def test_sslmode_is_not_added_to_sqlite(self):
        url = with_sslmode("sqlite:///x.db", "require")
        self.assertEqual(url, "sqlite:///x.db")

    def test_sqlite_urls_are_left_alone(self):
        url = "sqlite:///F:/Neuronest-AI/backend/neuronest.db"
        self.assertEqual(normalize_database_url(url), url)


class TestPlaceholderDetection(unittest.TestCase):
    def test_none_and_blank_are_unset(self):
        self.assertTrue(is_unset(None))
        self.assertTrue(is_unset("   "))

    def test_template_values_are_unset(self):
        self.assertTrue(is_unset("your-supabase-db-password"))
        self.assertTrue(is_unset("YOUR-PROJECT-REF"))
        self.assertTrue(is_unset("your-supabase-publishable-key"))
        self.assertTrue(is_unset("your-supabase-secret-key"))

    def test_real_values_are_set(self):
        self.assertFalse(is_unset("hunter2"))
        self.assertFalse(is_unset("abcdefghijklm"))

    def test_publishable_key_counts_as_anon_key(self):
        settings = make_settings(
            SUPABASE_URL="https://abcdefghijklm.supabase.co",
            SUPABASE_PUBLISHABLE_KEY="sb_publishable_real",
        )
        self.assertEqual(settings.supabase_anon_key, "sb_publishable_real")
        self.assertTrue(settings.supabase_rest_configured)

    def test_anon_key_takes_priority_over_publishable(self):
        settings = make_settings(
            SUPABASE_URL="https://abcdefghijklm.supabase.co",
            SUPABASE_ANON_KEY="anon_real",
            SUPABASE_PUBLISHABLE_KEY="sb_publishable_real",
        )
        self.assertEqual(settings.supabase_anon_key, "anon_real")


class TestDatabaseResolution(unittest.TestCase):
    """Which database wins: USE_SUPABASE, DATABASE_URL, or the SQLite default."""

    def test_sqlite_is_the_zero_config_default(self):
        settings = make_settings()
        self.assertTrue(settings.resolved_database_url.startswith("sqlite:///"))
        self.assertEqual(settings.database_info["backend"], "sqlite")
        self.assertFalse(settings.use_supabase_database)

    def test_use_supabase_builds_the_project_url(self):
        settings = make_settings(
            USE_SUPABASE=True,
            SUPABASE_PROJECT_REF="abcdefghijklm",
            SUPABASE_DB_PASSWORD="pw",
        )
        self.assertTrue(settings.use_supabase_database)
        self.assertEqual(settings.supabase_host, "db.abcdefghijklm.supabase.co")
        url = settings.resolved_database_url
        self.assertTrue(url.startswith("postgresql+psycopg2://"))
        self.assertIn("db.abcdefghijklm.supabase.co:5432/postgres", url)
        self.assertIn("sslmode=require", url)
        self.assertEqual(settings.database_info["source"], "supabase")
        self.assertEqual(settings.database_info["managed_by"], "supabase")

    def test_direct_connection_uses_the_plain_postgres_role(self):
        settings = make_settings(
            USE_SUPABASE=True,
            SUPABASE_PROJECT_REF="abcdefghijklm",
            SUPABASE_DB_PASSWORD="pw",
        )
        self.assertEqual(settings.supabase_user, "postgres")

    def test_pooler_connection_uses_the_tenant_qualified_role(self):
        """Supavisor rejects a plain `postgres` with `Tenant or user not found`."""
        settings = make_settings(
            USE_SUPABASE=True,
            SUPABASE_PROJECT_REF="abcdefghijklm",
            SUPABASE_DB_PASSWORD="pw",
            SUPABASE_DB_HOST="aws-0-ap-south-1.pooler.supabase.com",
            SUPABASE_DB_PORT=6543,
        )
        self.assertTrue(settings.supabase_uses_pooler)
        self.assertEqual(settings.supabase_user, "postgres.abcdefghijklm")
        self.assertTrue(settings.database_info["pooler"])

    def test_an_explicit_host_overrides_the_project_ref_host(self):
        settings = make_settings(
            USE_SUPABASE=True,
            SUPABASE_DB_PASSWORD="pw",
            SUPABASE_DB_HOST="aws-0-ap-south-1.pooler.supabase.com",
            SUPABASE_PROJECT_REF="abcdefghijklm",
        )
        self.assertEqual(
            settings.supabase_host, "aws-0-ap-south-1.pooler.supabase.com"
        )

    def test_explicit_database_url_wins_when_supabase_is_off(self):
        settings = make_settings(
            DATABASE_URL="postgresql://u:p@my-db.internal:5432/neuronest",
            USE_SUPABASE=False,
            SUPABASE_DB_PASSWORD="pw",
            SUPABASE_PROJECT_REF="abcdefghijklm",
        )
        self.assertFalse(settings.use_supabase_database)
        self.assertIn("my-db.internal:5432/neuronest", settings.resolved_database_url)
        self.assertEqual(settings.database_info["source"], "DATABASE_URL")

    def test_placeholder_password_falls_back_to_sqlite(self):
        """An unfilled template must not be treated as a real credential."""
        settings = make_settings(
            USE_SUPABASE=True,
            SUPABASE_PROJECT_REF="abcdefghijklm",
            SUPABASE_DB_PASSWORD="your-supabase-db-password",
        )
        self.assertFalse(settings.use_supabase_database)
        self.assertTrue(settings.resolved_database_url.startswith("sqlite:///"))

    def test_use_supabase_without_a_password_warns_and_falls_back(self):
        settings = make_settings(USE_SUPABASE=True, SUPABASE_PROJECT_REF="abcdefghijklm")
        self.assertTrue(settings.resolved_database_url.startswith("sqlite:///"))
        self.assertTrue(
            any("SUPABASE_DB_PASSWORD" in w for w in settings.configuration_warnings)
        )

    def test_special_characters_in_the_password_survive_a_round_trip(self):
        """Supabase passwords contain @ # / : which corrupt hand-built URLs."""
        from sqlalchemy.engine import make_url

        password = "p@ss:w/rd#1?+%"
        url = build_supabase_database_url(
            host="db.abcdefghijklm.supabase.co",
            port=5432,
            database="postgres",
            user="postgres",
            password=password,
        )
        self.assertEqual(make_url(url).password, password)


class TestDescribeDatabaseUrl(unittest.TestCase):
    def test_reports_supabase_and_the_pooler(self):
        info = describe_database_url(POOLER_URL)
        self.assertEqual(info["managed_by"], "supabase")
        self.assertTrue(info["pooler"])
        self.assertEqual(info["port"], 6543)

    def test_direct_supabase_url_is_not_a_pooler(self):
        info = describe_database_url(DIRECT_URL)
        self.assertFalse(info["pooler"])
        self.assertEqual(info["managed_by"], "supabase")

    def test_sqlite_is_described_as_a_local_file(self):
        info = describe_database_url("sqlite:///F:/x/neuronest.db")
        self.assertEqual(info["backend"], "sqlite")
        self.assertEqual(info["managed_by"], "self-hosted")

    def test_a_malformed_url_never_raises(self):
        self.assertEqual(describe_database_url("not a url at all")["backend"], "unknown")

    def test_the_password_is_never_included(self):
        self.assertNotIn("pw", str(describe_database_url(DIRECT_URL)))

class TestEngineOptions(unittest.TestCase):
    """The pool strategy has to match how Supabase hands out connections."""

    def test_sqlite_keeps_its_thread_setting(self):
        kwargs = build_engine_kwargs("sqlite:///x.db")
        self.assertFalse(kwargs["connect_args"]["check_same_thread"])
        self.assertNotIn("poolclass", kwargs)

    def test_direct_connection_gets_a_real_pool_and_tls(self):
        kwargs = build_engine_kwargs(DIRECT_URL + "?sslmode=require", pool_recycle=300)
        self.assertNotIn("poolclass", kwargs)
        self.assertEqual(kwargs["pool_size"], 5)
        self.assertEqual(kwargs["pool_recycle"], 300)
        self.assertEqual(kwargs["connect_args"]["sslmode"], "require")

    def test_pooler_gets_nullpool(self):
        """A client side pool on top of Supavisor exhausts the connection budget."""
        kwargs = build_engine_kwargs(POOLER_URL)
        self.assertIs(kwargs["poolclass"], NullPool)
        self.assertNotIn("pool_size", kwargs)

    def test_pre_ping_is_always_on(self):
        """Supabase reaps idle connections; without pre-ping the demo breaks."""
        for url in ("sqlite:///x.db", DIRECT_URL, POOLER_URL):
            self.assertTrue(build_engine_kwargs(url)["pool_pre_ping"])

    def test_connect_timeout_is_bounded(self):
        """A paused Supabase project must not hang a request forever."""
        self.assertEqual(
            build_engine_kwargs(DIRECT_URL, connect_timeout=7)["connect_args"][
                "connect_timeout"
            ],
            7,
        )


class TestSchemaFileMatchesModels(unittest.TestCase):
    """db/schema.sql must never drift from app/models/models.py.

    The file exists so the schema can be pasted into the Supabase SQL Editor,
    but the app creates its tables with `Base.metadata.create_all()`. If the two
    disagree, one of the two paths silently produces a broken database - so the
    generated DDL is compared against the file, table by table.
    """

    @classmethod
    def setUpClass(cls):
        cls.raw = SCHEMA_FILE.read_text(encoding="utf-8")
        cls.sql = normalized(cls.raw)
        cls.dialect = postgresql.dialect()

    def test_schema_file_exists(self):
        self.assertTrue(SCHEMA_FILE.exists(), f"{SCHEMA_FILE} is missing")

    def test_every_model_table_is_present_verbatim(self):
        for table in Base.metadata.sorted_tables:
            ddl = normalized(str(CreateTable(table).compile(dialect=self.dialect)))
            self.assertIn(
                ddl,
                self.sql,
                f"db/schema.sql is out of date for table '{table.name}'",
            )

    def test_every_model_index_is_present(self):
        for table in Base.metadata.sorted_tables:
            for index in table.indexes:
                ddl = normalized(str(CreateIndex(index).compile(dialect=self.dialect)))
                self.assertIn(
                    ddl,
                    self.sql,
                    f"db/schema.sql is missing index '{index.name}'",
                )

    def test_the_role_enum_matches_the_model(self):
        values = ", ".join(f"'{member.value}'" for member in UserRole)
        self.assertIn(f"create type userrole as enum ({values})", self.sql)

    def test_row_level_security_is_enabled_for_every_table(self):
        """Without RLS the public anon key can read patient data over REST."""
        for table in Base.metadata.sorted_tables:
            self.assertIn(
                f"alter table {table.name} enable row level security",
                self.sql,
                f"Row Level Security is not enabled on '{table.name}'",
            )

    def test_the_schema_is_idempotent(self):
        """Re-running it in the SQL Editor must not drop or overwrite data."""
        self.assertNotIn("drop table", self.sql)
        self.assertIn("if not exists", self.raw.lower())


class TestHealthEndpoints(unittest.TestCase):
    """The Supabase work must not change the existing /health contract."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_keeps_its_original_shape(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["service"], "NeuroNest AI")
        self.assertEqual(body["version"], "1.0.0")
        self.assertIn(body["status"], ("ok", "degraded"))

    def test_health_status_reflects_database_reachability(self):
        """`ok` if and only if the configured database answered.

        Written as an invariant rather than `status == "ok"` so the test stays
        valid on a machine pointed at a paused or unreachable Supabase project.
        test_endpoints.py keeps the strict "ok" assertion for the SQLite default.
        """
        body = self.client.get("/health").json()
        connected = body["database"]["connected"]
        self.assertIsInstance(connected, bool)
        self.assertEqual(body["status"], "ok" if connected else "degraded")
        if connected:
            self.assertIsNone(body["database"]["error"])
        else:
            self.assertTrue(body["database"]["error"])

    def test_health_reports_the_database_backend(self):
        database = self.client.get("/health").json()["database"]
        self.assertIn(database["backend"], ("sqlite", "postgresql", "mysql", "unknown"))
        self.assertIn(database["source"], ("supabase", "DATABASE_URL"))
        self.assertIsInstance(database["connected"], bool)

    def test_health_reports_supabase_configuration(self):
        supabase = self.client.get("/health").json()["supabase"]
        self.assertIsInstance(supabase["configured"], bool)
        self.assertIn("database_in_use", supabase)
        self.assertIn("sdk_installed", supabase)

    def test_root_advertises_the_backend(self):
        self.assertIn("database", self.client.get("/").json())

    def test_database_report_is_internally_consistent(self):
        body = self.client.get("/health/database").json()
        self.assertIsInstance(body["connected"], bool)
        if body["connected"]:
            self.assertIsNone(body["error"])
            self.assertIsInstance(body["latency_ms"], float)
        else:
            self.assertTrue(body["error"])

    def test_database_report_hides_row_counts_by_default(self):
        """The endpoint is public, so the user count is not published by default."""
        from app.config import settings

        body = self.client.get("/health/database").json()
        if not settings.HEALTH_EXPOSE_COUNTS:
            self.assertNotIn("row_counts", body)

    def test_supabase_probe_shape(self):
        """Runs without touching the network when Supabase is unconfigured."""
        probe = self.client.get("/health/supabase").json()["probe"]
        self.assertIsInstance(probe["configured"], bool)
        self.assertIsInstance(probe["sdk_installed"], bool)
        if not probe["configured"]:
            self.assertIsNone(probe["reachable"])
            self.assertTrue(probe["error"])


class TestSeedGuard(unittest.TestCase):
    """`--seed` deletes every row, so it must refuse to touch real accounts.

    This is the difference between "load the demo data" and "destroy a
    Supabase project holding real patient records", so it is tested directly.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db_path = Path(self.tmp.name) / "seed_guard.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.app_ns = SimpleNamespace(
            settings=make_settings(),
            Base=Base,
            engine=self.engine,
            SessionLocal=self.Session,
            DATABASE_INFO={"backend": "sqlite", "host": None, "database": str(db_path)},
        )

    def tearDown(self):
        self.engine.dispose()
        self.tmp.cleanup()

    def _add_user(self, email, role=UserRole.PATIENT):
        session = self.Session()
        session.add(
            User(name="Someone", email=email, password_hash="hash", role=role)
        )
        session.commit()
        session.close()

    def _user_emails(self):
        session = self.Session()
        emails = {email for (email,) in session.query(User.email).all()}
        session.close()
        return emails

    def test_demo_accounts_alone_do_not_block_seeding(self):
        for email in sorted(supabase_setup.DEMO_EMAILS):
            self._add_user(email)
        self.assertEqual(supabase_setup._non_demo_accounts(self.app_ns), [])

    def test_refuses_when_a_real_account_exists(self):
        self._add_user("real.patient@example.com")
        output = io.StringIO()
        with redirect_stdout(output):
            allowed = supabase_setup.cmd_seed(self.app_ns, force=False)
        self.assertFalse(allowed)
        self.assertIn("--force", output.getvalue())
        self.assertIn("real.patient@example.com", output.getvalue())
        # Nothing may have been deleted.
        self.assertEqual(self._user_emails(), {"real.patient@example.com"})

    def test_an_empty_database_does_not_block_seeding(self):
        self.assertEqual(supabase_setup._non_demo_accounts(self.app_ns), [])

    def test_the_demo_password_is_the_documented_one(self):
        import seed

        self.assertEqual(seed.DEMO_PASSWORD, "demo1234")

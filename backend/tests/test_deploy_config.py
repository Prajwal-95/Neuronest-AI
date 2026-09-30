"""Deployment configuration tests - the Render blueprint and env parsing.

Everything here exists because the deploy target behaves differently from a
developer laptop:

* Render's env panel stores **plain strings**, but `CORS_ORIGINS` is a list
  field. pydantic-settings JSON-decodes list fields before validators run, so a
  bare `List[str]` annotation made `CORS_ORIGINS=https://app.onrender.com` raise
  `SettingsError` at import time - the API crashed on boot with a message that
  pointed at nothing useful. The `Union[List[str], str]` annotation plus
  `_coerce_cors_origins` is what fixes it, and these tests are the regression
  net for that.
* A Render Blueprint is a *contract*: the CORS list on the API and the build-time
  `VITE_API_URL` on the static site have to agree with the services' *public
  URLs*. A service name usually gives you `https://<name>.onrender.com`, but
  Render appends a suffix when the name is already taken - `neuronest-api`
  deployed as `neuronest-api-39se.onrender.com` and `neuronest-web` as
  `neuronest-web-1fj8.onrender.com` - so both real URLs are pinned in
  `PROD_API_URL` / `PROD_WEB_URL` instead of being derived from the name. Getting
  either value wrong produces a deployed app whose every request is blocked by
  CORS or "Failed to fetch" - a 3-second test beats an hour of staring at the
  network tab.

    cd backend
    ..\\venv\\Scripts\\python.exe -m pytest tests/test_deploy_config.py -v
"""

import os
import re
import unittest
from unittest.mock import patch

import yaml

from app.config import BACKEND_DIR, Settings, is_unset

REPO_ROOT = BACKEND_DIR.parent
BLUEPRINT_FILE = REPO_ROOT / "render.yaml"

#: The API service's real public URL. Render serves `https://<name>.onrender.com`
#: only while that name is still free when the service is created, so
#: `neuronest-api` came out as `neuronest-api-39se.onrender.com`. `VITE_API_URL`
#: is baked into the frontend bundle at build time and has to point at the URL
#: that actually answers, which is why the assertion below pins the URL itself
#: rather than rebuilding it from the service name.
PROD_API_URL = "https://neuronest-api-39se.onrender.com"

#: The static site's real public URL, pinned for exactly the same reason: the
#: `neuronest-web` name was already taken, so the PWA is actually served from
#: `neuronest-web-1fj8.onrender.com`. `CORSMiddleware` compares the browser's
#: `Origin` header against `CORS_ORIGINS` entries literally - scheme + host, no
#: trailing slash - so the name-derived host is just a foreign origin and the
#: deployed app had every request blocked. Deriving it from the name is the bug.
PROD_WEB_URL = "https://neuronest-web-1fj8.onrender.com"


def load_blueprint() -> dict:
    with open(BLUEPRINT_FILE, encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def services_by_name() -> dict:
    return {service["name"]: service for service in load_blueprint()["services"]}


def env_var(service: dict, key: str):
    """The declared env var on a blueprint service (None when not declared)."""
    for entry in service.get("envVars", []):
        if entry["key"] == key:
            return entry
    return None


def cors_from_environment(value):
    """Read CORS_ORIGINS the way Render feeds it: a raw environment variable."""
    with patch.dict(os.environ, {}, clear=False):
        if value is None:
            os.environ.pop("CORS_ORIGINS", None)
        else:
            os.environ["CORS_ORIGINS"] = value
        # `_env_file=None` keeps a developer's backend/.env out of the result.
        return Settings(_env_file=None).CORS_ORIGINS


class TestCorsOriginsParsing(unittest.TestCase):
    """`CORS_ORIGINS` must accept both the `.env` and the Render env-panel form."""

    def test_the_default_allows_the_local_dev_origins(self):
        self.assertIn("http://localhost:5173", Settings(_env_file=None).CORS_ORIGINS)

    def test_json_list_from_an_env_file_still_works(self):
        self.assertEqual(
            cors_from_environment('["http://localhost:5173", "http://localhost:3000"]'),
            ["http://localhost:5173", "http://localhost:3000"],
        )

    def test_a_plain_url_from_the_render_env_panel_does_not_crash(self):
        """The regression that broke booting on Render outright."""
        self.assertEqual(
            cors_from_environment("https://neuronest-web.onrender.com"),
            ["https://neuronest-web.onrender.com"],
        )

    def test_comma_separated_urls_are_split(self):
        self.assertEqual(
            cors_from_environment("https://a.onrender.com,https://b.onrender.com"),
            ["https://a.onrender.com", "https://b.onrender.com"],
        )

    def test_whitespace_and_trailing_slashes_are_cleaned(self):
        """`https://app.onrender.com/` never matches an Origin header."""
        self.assertEqual(
            cors_from_environment(" https://a.onrender.com/ ,  https://b.onrender.com "),
            ["https://a.onrender.com", "https://b.onrender.com"],
        )

    def test_blank_means_no_origins_rather_than_a_broken_entry(self):
        self.assertEqual(cors_from_environment("   "), [])

    def test_unset_falls_back_to_the_default_list(self):
        self.assertEqual(
            cors_from_environment(None),
            ["http://localhost:5173", "http://localhost:3000"],
        )

    def test_a_real_list_passes_straight_through(self):
        """Programmatic construction (tests, tooling) may pass a list directly."""
        self.assertEqual(
            Settings(_env_file=None, CORS_ORIGINS=["https://x.test"]).CORS_ORIGINS,
            ["https://x.test"],
        )

    def test_the_result_is_always_a_list_of_strings(self):
        """CORSMiddleware rejects anything but a list, whatever the input was."""
        for raw in ("https://a.test", "https://a.test,https://b.test", '["https://c.test"]'):
            with self.subTest(raw=raw):
                value = cors_from_environment(raw)
                self.assertIsInstance(value, list)
                self.assertTrue(all(isinstance(item, str) for item in value))


@unittest.skipUnless(BLUEPRINT_FILE.exists(), "render.yaml is not present")
class TestRenderBlueprint(unittest.TestCase):
    """The blueprint must describe a service pair that actually talks to each other."""

    @classmethod
    def setUpClass(cls):
        cls.services = services_by_name()
        cls.api = cls.services.get("neuronest-api", {})
        cls.web = cls.services.get("neuronest-web", {})

    def test_both_services_are_declared(self):
        self.assertEqual(sorted(self.services), ["neuronest-api", "neuronest-web"])
        self.assertEqual(self.api.get("type"), "web")
        # A static site is `type: web` + `runtime: static`; `type: static` was
        # never a Blueprint service type and makes the whole import fail.
        self.assertEqual(self.web.get("type"), "web")
        self.assertEqual(self.web.get("runtime"), "static")

    def test_the_api_pins_python_with_the_python_version_env_var(self):
        """`runtimeVersion` left the Blueprint spec; PYTHON_VERSION replaced it."""
        self.assertNotIn("runtimeVersion", self.api)
        pin = env_var(self.api, "PYTHON_VERSION")
        self.assertIsNotNone(
            pin, "declare PYTHON_VERSION or Render picks the interpreter for you"
        )
        self.assertEqual(pin["value"], "3.11.9")

    def test_the_api_builds_from_the_backend_package(self):
        self.assertEqual(self.api.get("rootDir"), "backend")
        self.assertIn("requirements.txt", self.api.get("buildCommand", ""))

    def test_the_api_listens_on_the_port_render_assigns(self):
        """Hard-coding 8000 is the classic "Service unavailable" on Render."""
        start = self.api.get("startCommand", "")
        self.assertIn("app.main:app", start)
        # `$PORT` or the `${PORT:-8000}` bash fallback - both expand correctly.
        self.assertRegex(start, r"\$\{?PORT")
        self.assertIn("0.0.0.0", start)

    def test_the_health_check_points_at_the_liveness_probe(self):
        """/health answers without any third-party network call - the right probe."""
        self.assertEqual(self.api.get("healthCheckPath"), "/health")

    def test_the_api_is_told_to_use_supabase(self):
        self.assertEqual(env_var(self.api, "USE_SUPABASE")["value"], "true")

    def test_the_database_host_is_the_ipv4_pooler(self):
        """The direct host (db.<ref>.supabase.co) is IPv6-only and times out."""
        host = env_var(self.api, "SUPABASE_DB_HOST")["value"]
        self.assertIn("pooler.", host)
        self.assertEqual(env_var(self.api, "SUPABASE_DB_PORT")["value"], "5432")

    def test_nothing_secret_is_committed_to_the_blueprint(self):
        """Placeholders are fine; a real password in git is not."""
        for service in self.services.values():
            for entry in service.get("envVars", []):
                key = entry["key"]
                if not re.search(r"PASSWORD|SECRET|KEY$", key):
                    continue
                if "value" not in entry:
                    continue  # generateValue, or filled in on the dashboard
                with self.subTest(service=service["name"], key=key):
                    self.assertTrue(
                        is_unset(entry["value"]),
                        f"{key} looks like a real secret committed to git",
                    )

    def test_the_api_allows_the_static_site_origin(self):
        """`CORS_ORIGINS` must list the static site's *real* public URL.

        Deliberately not `https://<service name>.onrender.com`: Render appended a
        suffix because the `neuronest-web` name was taken, so the name-derived
        host is a different origin as far as the browser is concerned and the API
        rejected every request from the deployed PWA.
        """
        allowed = cors_from_environment(env_var(self.api, "CORS_ORIGINS")["value"])
        self.assertIn(PROD_WEB_URL, allowed)
        # Local dev origins stay listed so `npm run dev` can still reach this API.
        self.assertIn("http://localhost:5173", allowed)

    def test_the_static_site_points_at_the_api_origin(self):
        """`VITE_API_URL` is compiled into the bundle - it must be the live URL."""
        api_url = env_var(self.web, "VITE_API_URL")["value"]
        self.assertEqual(api_url, PROD_API_URL)
        self.assertFalse(api_url.endswith("/"), "a trailing slash breaks /api paths")

    def test_the_static_site_publishes_dist_and_builds_with_vite(self):
        self.assertEqual(self.web.get("rootDir"), "frontend")
        self.assertIn("npm run build", self.web.get("buildCommand", ""))
        self.assertIn("dist", self.web.get("staticPublishPath", ""))

    def test_the_static_site_rewrites_deep_links_to_the_spa(self):
        """Without this, refreshing /patient returns Render's 404 page.

        The Blueprint key is `routes`, and every entry carries an explicit
        `type: rewrite` - the older `rewrites` list is not part of the spec.
        """
        routes = self.web.get("routes", [])
        self.assertTrue(routes, "the static site must declare at least one route")
        spa_routes = [
            route
            for route in routes
            if route.get("type") == "rewrite"
            and route.get("destination") == "/index.html"
        ]
        self.assertTrue(
            spa_routes,
            f"no route rewrites deep links to /index.html: {routes}",
        )

    def test_the_static_site_builds_on_the_same_node_major_as_dev(self):
        node_version = env_var(self.web, "NODE_VERSION")
        self.assertIsNotNone(node_version, "pin NODE_VERSION or Vite may fail to build")
        self.assertTrue(str(node_version["value"]).split(".")[0].isdigit())


class TestDeploymentDocumentation(unittest.TestCase):
    """The examples must stay copy-pasteable, or the first deploy wastes an hour."""

    def test_the_render_walkthrough_exists(self):
        self.assertTrue((REPO_ROOT / "docs" / "RENDER_DEPLOYMENT.md").exists())

    def test_the_backend_example_documents_both_cors_forms(self):
        text = (BACKEND_DIR / ".env.example").read_text(encoding="utf-8")
        self.assertIn("onrender.com", text)
        self.assertIn("CORS_ORIGINS", text)

    def test_the_frontend_example_documents_the_api_url(self):
        text = (REPO_ROOT / "frontend" / ".env.example").read_text(encoding="utf-8")
        self.assertIn("VITE_API_URL", text)

    def test_the_python_version_pin_is_a_usable_version(self):
        pin = (BACKEND_DIR / ".python-version").read_text(encoding="utf-8").strip()
        self.assertRegex(pin, r"^\d+\.\d+$")


if __name__ == "__main__":
    unittest.main()


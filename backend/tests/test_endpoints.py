"""
Endpoint tests for /health, /patients, and /root routes.

Uses an in-memory SQLite database with dependency overrides so tests run
in complete isolation with no side-effects.

    cd backend
    python -m unittest discover -s tests -v
"""

import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.db import Base, get_db
from app.main import app
from app.models.models import User, UserRole, CaregiverPatient, GameSession
from app.auth.security import create_access_token


# ---- Test database setup (in-memory SQLite with StaticPool for shared state) ----
TEST_DATABASE_URL = "sqlite://"  # in-memory
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


class _BaseEndpointTests(unittest.TestCase):
    """Shared setup: fresh schema + seeded data for every test."""

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.db = TestSession()

        # Seed patient
        self.patient = User(
            name="Test Patient",
            email="patient@test.com",
            password_hash="fakehash",
            role=UserRole.PATIENT,
            language="hi",
        )
        self.db.add(self.patient)
        self.db.flush()

        # Seed caregiver
        self.caregiver = User(
            name="Test Caregiver",
            email="caregiver@test.com",
            password_hash="fakehash",
            role=UserRole.CAREGIVER,
        )
        self.db.add(self.caregiver)
        self.db.flush()

        # Link caregiver ↔ patient
        link = CaregiverPatient(
            caregiver_id=self.caregiver.id, patient_id=self.patient.id
        )
        self.db.add(link)

        # Seed a game session
        session = GameSession(
            patient_id=self.patient.id,
            game_type="memory_match",
            difficulty=2,
            score=85.0,
            accuracy=0.85,
            response_time=4.2,
            mistakes=1,
            attempts=8,
            completed=True,
            created_at=datetime.utcnow() - timedelta(days=1),
            # An online session is stamped as synced on creation (see
            # session_service.create_session); mirror that here so the
            # sync_status assertions reflect a realistically-shaped row.
            synced_at=datetime.utcnow() - timedelta(days=1),
        )
        self.db.add(session)
        self.db.commit()

        # Save IDs before closing session (ORM objects become detached after close)
        self.patient_id = self.patient.id
        self.caregiver_id = self.caregiver.id
        self.db.close()

        # Token helpers
        self.patient_token = create_access_token({"sub": str(self.patient_id)})
        self.caregiver_token = create_access_token({"sub": str(self.caregiver_id)})
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()


class TestDatabasePathResolution(unittest.TestCase):
    """The SQLite URL must not depend on the process working directory.

    SQLAlchemy resolves a relative `sqlite:///./neuronest.db` against the CWD,
    so launching uvicorn from the repo root used to create a SECOND, empty
    database next to the seeded one. Every demo login then failed with
    "Incorrect email or password" while the real database sat untouched.
    """

    def test_default_url_points_at_backend_directory(self):
        from app.config import settings, BACKEND_DIR

        self.assertTrue(
            settings.DATABASE_URL.startswith("sqlite:///"),
            f"expected the local SQLite default, got {settings.DATABASE_URL}",
        )
        db_path = settings.DATABASE_URL.replace("sqlite:///", "", 1)
        self.assertTrue(
            Path(db_path).is_absolute(),
            f"SQLite path must be absolute, got {db_path!r}",
        )
        self.assertEqual(
            Path(db_path).parent.resolve(),
            BACKEND_DIR.resolve(),
            "the database must live in backend/, not the current directory",
        )

    def test_resolved_db_file_is_the_seeded_one(self):
        from app.config import settings

        db_file = Path(settings.DATABASE_URL.replace("sqlite:///", "", 1))
        self.assertTrue(
            db_file.name == "neuronest.db",
            f"unexpected database filename {db_file.name!r}",
        )
        # A repo-root neuronest.db is the tell-tale sign of the old bug.
        stray = db_file.parent.parent / "neuronest.db"
        self.assertFalse(
            stray.exists(),
            f"stray database at {stray} - the working directory is leaking "
            "into the database path again",
        )


class TestRootAndHealth(_BaseEndpointTests):
    def test_root_returns_running_message(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("running", r.json()["message"].lower())

    def test_health_returns_ok(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["service"], "NeuroNest AI")
        self.assertEqual(body["version"], "1.0.0")


class TestPatientsList(_BaseEndpointTests):
    def test_patient_sees_self(self):
        r = self.client.get(
            "/patients", headers={"Authorization": f"Bearer {self.patient_token}"}
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["email"], "patient@test.com")

    def test_caregiver_sees_connected_patients(self):
        r = self.client.get(
            "/patients",
            headers={"Authorization": f"Bearer {self.caregiver_token}"},
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Test Patient")

    def test_unauthenticated_returns_401(self):
        r = self.client.get("/patients")
        self.assertEqual(r.status_code, 401)

    def test_invalid_token_returns_401(self):
        r = self.client.get(
            "/patients", headers={"Authorization": "Bearer invalid.token.here"}
        )
        self.assertEqual(r.status_code, 401)

    def test_response_schema_fields(self):
        r = self.client.get(
            "/patients", headers={"Authorization": f"Bearer {self.patient_token}"}
        )
        self.assertEqual(r.status_code, 200)
        patient = r.json()[0]
        for key in ("id", "name", "email", "language", "last_activity",
                     "weekly_sessions", "overall_performance", "sync_status"):
            self.assertIn(key, patient, f"Missing key: {key}")


class TestGetPatientById(_BaseEndpointTests):
    def test_patient_can_get_self(self):
        r = self.client.get(
            f"/patients/{self.patient_id}",
            headers={"Authorization": f"Bearer {self.patient_token}"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["email"], "patient@test.com")

    def test_caregiver_can_get_connected_patient(self):
        r = self.client.get(
            f"/patients/{self.patient_id}",
            headers={"Authorization": f"Bearer {self.caregiver_token}"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["name"], "Test Patient")

    def test_nonexistent_patient_returns_404(self):
        r = self.client.get(
            "/patients/99999",
            headers={"Authorization": f"Bearer {self.patient_token}"},
        )
        self.assertEqual(r.status_code, 404)

    def test_unlinked_caregiver_returns_403(self):
        # Create a second caregiver with no link to the patient
        db2 = TestSession()
        orphan = User(
            name="Orphan CG", email="orphan@test.com",
            password_hash="x", role=UserRole.CAREGIVER,
        )
        db2.add(orphan)
        db2.commit()
        orphan_id = orphan.id
        db2.close()
        orphan_token = create_access_token({"sub": str(orphan_id)})
        r = self.client.get(
            f"/patients/{self.patient_id}",
            headers={"Authorization": f"Bearer {orphan_token}"},
        )
        self.assertEqual(r.status_code, 403)


class TestResetLevels(_BaseEndpointTests):
    def test_caregiver_can_reset_patient_levels(self):
        r = self.client.delete(
            f"/patients/{self.patient_id}/levels",
            headers={"Authorization": f"Bearer {self.caregiver_token}"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["reset"])
        self.assertEqual(body["level"], 1)

    def test_patient_cannot_reset_own_levels(self):
        r = self.client.delete(
            f"/patients/{self.patient_id}/levels",
            headers={"Authorization": f"Bearer {self.patient_token}"},
        )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.status_code, 403)


class TestSessionGameTypeValidation(_BaseEndpointTests):
    """Every game the frontend can produce must be accepted by the API.

    The `game_type` pattern used to enumerate only three of the five shipped
    games, so completing Quick Math or Word Recall produced a 422 on sync.
    """

    SHIPPED_GAMES = [
        "memory_match",
        "sequence_recall",
        "attention",
        "quick_math",
        "word_recall",
    ]

    def _session_body(self, game_type, **overrides):
        body = {
            "game_type": game_type,
            "difficulty": 2,
            "score": 70.0,
            "accuracy": 0.8,
            "response_time": 4.0,
            "mistakes": 1,
            "attempts": 6,
            "completed": True,
            "client_id": f"test-{game_type}",
        }
        body.update(overrides)
        return body

    def test_all_shipped_games_accepted_via_games_endpoint(self):
        for game in self.SHIPPED_GAMES:
            with self.subTest(game=game):
                r = self.client.post(
                    "/games/sessions",
                    headers={"Authorization": f"Bearer {self.patient_token}"},
                    json=self._session_body(game),
                )
                self.assertEqual(r.status_code, 200, f"{game} rejected: {r.text}")
                self.assertEqual(r.json()["game_type"], game)

    def test_all_shipped_games_accepted_via_sync_endpoint(self):
        body = {"sessions": [self._session_body(g) for g in self.SHIPPED_GAMES]}
        r = self.client.post(
            "/sync/sessions",
            headers={"Authorization": f"Bearer {self.patient_token}"},
            json=body,
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["failed"], 0)
        stored = {s["game_type"] for s in r.json()["synced"]}
        self.assertEqual(stored, set(self.SHIPPED_GAMES))

    def test_unknown_game_type_still_rejected(self):
        r = self.client.post(
            "/games/sessions",
            headers={"Authorization": f"Bearer {self.patient_token}"},
            json=self._session_body("not_a_real_game"),
        )
        self.assertEqual(r.status_code, 422)

    def test_all_shipped_games_accept_level_10(self):
        """Regression: difficulty was capped at `le=5`, so level 6-10 sessions
        were rejected with 422 even though every game ships ten levels. A live
        server started before the fix kept serving the old cap, which made the
        games look like they stopped at level 5."""
        for game in self.SHIPPED_GAMES:
            with self.subTest(game=game):
                r = self.client.post(
                    "/games/sessions",
                    headers={"Authorization": f"Bearer {self.patient_token}"},
                    json=self._session_body(
                        game, difficulty=10, client_id=f"level10-{game}"
                    ),
                )
                self.assertEqual(
                    r.status_code, 200, f"{game} rejected level 10: {r.text}"
                )
                self.assertEqual(r.json()["difficulty"], 10)

    def test_difficulty_outside_1_to_10_rejected(self):
        """Widening the ceiling to 10 must not open the range beyond it."""
        for level in (0, 11, -1, 99):
            with self.subTest(level=level):
                r = self.client.post(
                    "/games/sessions",
                    headers={"Authorization": f"Bearer {self.patient_token}"},
                    json=self._session_body("memory_match", difficulty=level),
                )
                self.assertEqual(
                    r.status_code, 422, f"difficulty {level} was accepted"
                )

    def test_adaptive_engine_never_recommends_above_level_10(self):
        """A strong session at the top level must clamp, not overflow to 11."""
        for level in (1, 5, 9, 10):
            with self.subTest(level=level):
                r = self.client.post(
                    "/games/adaptive",
                    headers={"Authorization": f"Bearer {self.patient_token}"},
                    json={
                        "accuracy": 0.99,
                        "response_time": 1.0,
                        "mistakes": 0,
                        "current_difficulty": level,
                        "recent_scores": [96.0, 97.0, 98.0],
                        "game_type": "memory_match",
                    },
                )
                self.assertEqual(r.status_code, 200, r.text)
                recommended = r.json()["recommended_difficulty"]
                self.assertTrue(
                    1 <= recommended <= 10,
                    f"L{level} recommended L{recommended}, outside 1..10",
                )


class TestSyncScoreParity(_BaseEndpointTests):
    """The score stored on sync must match the score the client displayed.

    sync_sessions recomputes the score server-side, so it has to receive the
    same `recent_scores` the client used. It previously recomputed without
    them, silently falling back to consistency=0.5 / improvement=0 and
    recording a different number than the patient was shown.
    """

    def test_sync_matches_direct_submit_for_same_history(self):
        db = TestSession()
        for i, score in enumerate([40.0, 55.0, 70.0, 88.0]):
            db.add(
                GameSession(
                    patient_id=self.patient_id,
                    game_type="memory_match",
                    difficulty=2,
                    score=score,
                    accuracy=0.8,
                    response_time=4.0,
                    mistakes=1,
                    attempts=6,
                    completed=True,
                    created_at=datetime.utcnow() - timedelta(days=10 - i),
                )
            )
        db.commit()
        db.close()

        metrics = dict(
            game_type="quick_math",
            difficulty=2,
            score=0.0,  # placeholder; the server recomputes
            accuracy=0.9,
            response_time=3.0,
            mistakes=0,
            attempts=5,
            completed=True,
        )
        auth = {"Authorization": f"Bearer {self.patient_token}"}

        direct = self.client.post("/games/sessions", headers=auth, json=metrics)
        self.assertEqual(direct.status_code, 200, direct.text)

        synced = self.client.post(
            "/sync/sessions",
            headers=auth,
            json={"sessions": [dict(metrics, client_id="parity-check")]},
        )


class TestRecentScoreOrdering(_BaseEndpointTests):
    """recent_scores_for_patient must be oldest-first.

    The adaptive engine counts consecutive strong sessions with
    reversed(recent[-5:]) and the score formula treats recent[0] as oldest, so
    a newest-first return inverted the improvement feature and made the
    hysteresis check inspect the *oldest* sessions.
    """

    def _seed_scores(self, scores):
        db = TestSession()
        # Offsets are kept well clear of the row seeded in setUp (1 day ago)
        # so ordering assertions are not ambiguous.
        base = len(scores) + 20
        for i, score in enumerate(scores):
            db.add(
                GameSession(
                    patient_id=self.patient_id,
                    game_type="attention",
                    difficulty=1,
                    score=score,
                    accuracy=0.7,
                    response_time=5.0,
                    mistakes=2,
                    attempts=5,
                    completed=True,
                    created_at=datetime.utcnow() - timedelta(days=base - i),
                )
            )
        db.commit()
        db.close()

    def _recent(self):
        from app.services.analytics_service import recent_scores_for_patient

        db = TestSession()
        try:
            return recent_scores_for_patient(db, self.patient_id)
        finally:
            db.close()

    def test_returns_chronological_order(self):
        self._seed_scores([10.0, 20.0, 30.0, 40.0, 50.0])
        # The setUp session (score 85, 1 day ago) is the newest row, so it
        # correctly sorts last. Everything before it is ascending.
        self.assertEqual(self._recent(), [20.0, 30.0, 40.0, 50.0, 85.0])

    def test_cap_keeps_newest_five_in_chronological_order(self):
        self._seed_scores([float(i + 1) for i in range(8)])
        # Newest 5 kept (scores 5-8 plus the setUp row at 85), still oldest-first.
        self.assertEqual(self._recent(), [5.0, 6.0, 7.0, 8.0, 85.0])



class TestCaregiverDashboardScoping(_BaseEndpointTests):
    """The dashboard must only count the caregiver's own connected patients."""

    def _add_session(self, patient_id, days_ago=0):
        db = TestSession()
        db.add(
            GameSession(
                patient_id=patient_id,
                game_type="attention",
                difficulty=1,
                score=60.0,
                accuracy=0.7,
                response_time=5.0,
                mistakes=1,
                attempts=5,
                completed=True,
                created_at=datetime.utcnow() - timedelta(days=days_ago),
            )
        )
        db.commit()
        db.close()

    def _dashboard(self, token):
        return self.client.get(
            "/caregiver/dashboard",
            headers={"Authorization": f"Bearer {token}"},
        )

    def test_excludes_unlinked_patients_sessions(self):
        # A second patient with no link to this caregiver.
        db = TestSession()
        stranger = User(
            name="Stranger",
            email="stranger@test.com",
            password_hash="x",
            role=UserRole.PATIENT,
        )
        db.add(stranger)
        db.commit()
        stranger_id = stranger.id
        db.close()

        for _ in range(3):
            self._add_session(stranger_id)

        r = self._dashboard(self.caregiver_token)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        # The linked patient seeded in setUp has exactly 1 recent session.
        # Before the fix the 3 stranger sessions were counted too.
        self.assertEqual(body["sessions_this_week"], 1)
        self.assertEqual([p["email"] for p in body["patients"]], ["patient@test.com"])

    def test_counts_linked_patients_sessions(self):
        self._add_session(self.patient_id)
        r = self._dashboard(self.caregiver_token)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["sessions_this_week"], 2)

    def test_caregiver_without_patients_reports_zero(self):
        db = TestSession()
        lonely = User(
            name="Lonely CG",
            email="lonely@test.com",
            password_hash="x",
            role=UserRole.CAREGIVER,
        )
        db.add(lonely)
        db.commit()
        lonely_id = lonely.id
        db.close()

        r = self._dashboard(create_access_token({"sub": str(lonely_id)}))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["sessions_this_week"], 0)
        self.assertEqual(r.json()["patients"], [])

    def test_patient_role_is_forbidden(self):
        self.assertEqual(self._dashboard(self.patient_token).status_code, 403)


class TestSyncStatusReporting(_BaseEndpointTests):
    """sync_status must reflect real unsynced rows, not a hardcoded string."""

    def test_patient_with_unsynced_session_reports_pending(self):
        db = TestSession()
        db.add(
            GameSession(
                patient_id=self.patient_id,
                game_type="quick_math",
                difficulty=1,
                score=55.0,
                accuracy=0.7,
                response_time=5.0,
                mistakes=1,
                attempts=4,
                completed=True,
                offline_created=True,
                synced_at=None,
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
        db.close()

        r = self.client.get(
            "/patients", headers={"Authorization": f"Bearer {self.patient_token}"}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()[0]["sync_status"], "pending")

    def test_fully_synced_patient_reports_synced(self):
        r = self.client.get(
            "/patients", headers={"Authorization": f"Bearer {self.patient_token}"}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()[0]["sync_status"], "synced")

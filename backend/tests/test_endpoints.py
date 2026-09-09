"""
Endpoint tests for /health, /patients, and /root routes.

Uses an in-memory SQLite database with dependency overrides so tests run
in complete isolation with no side-effects.

    cd backend
    python -m unittest discover -s tests -v
"""

import unittest
from datetime import datetime, timedelta

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
        self.assertEqual(body["service"], "neurONest-ai")
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

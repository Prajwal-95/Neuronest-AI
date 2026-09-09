"""
Seed script for NeuroNest AI DEMO DATA.

Creates demo accounts and realistic historical sessions so the SIH demo
has meaningful trends, charts, and recommendations to display.

All records created here are clearly DEMO DATA for development.
"""

from datetime import datetime, timedelta
import random
from app.database.db import Base, engine, SessionLocal
from app.models.models import (
    User, UserRole, CaregiverPatient, GameSession, Recommendation, Reminder,
)
from app.auth.security import hash_password

DEMO_PASSWORD = "demo1234"


def seed():
    random.seed(42)  # deterministic demo data
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # --- Clean existing demo data ---
    db.query(Reminder).delete()
    db.query(Recommendation).delete()
    db.query(GameSession).delete()
    db.query(CaregiverPatient).delete()
    db.query(User).delete()
    db.commit()

    # --- Create users ---
    caregiver = User(
        name="Demo Caregiver",
        email="caregiver@neuronest.demo",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.CAREGIVER,
        language="en",
    )
    patient1 = User(
        name="Ravi Sharma",
        email="patient@neuronest.demo",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.PATIENT,
        language="en",
    )
    patient2 = User(
        name="Meena Devi",
        email="meena@neuronest.demo",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.PATIENT,
        language="hi",
    )
    db.add_all([caregiver, patient1, patient2])
    db.commit()

    # --- Link caregiver to patients ---
    db.add(CaregiverPatient(caregiver_id=caregiver.id, patient_id=patient1.id))
    db.add(CaregiverPatient(caregiver_id=caregiver.id, patient_id=patient2.id))
    db.commit()

    # --- Generate 3 weeks of historical sessions with realistic trends ---
    def gen_sessions(patient_id, base_accuracy, trend_up):
        now = datetime.utcnow()
        sessions = []
        for day_offset in range(21, -1, -1):
            day = now - timedelta(days=day_offset)
            # ~60% chance of activity on any day
            if random.random() < 0.4:
                continue
            # Pick 1-2 games per active day
            for _ in range(random.randint(1, 2)):
                game_type = random.choice(["memory_match", "sequence_recall", "attention", "quick_math", "word_recall"])
                # Difficulty progression: rises with time for a positive trend
                progress = trend_up * (1 - day_offset / 21.0)
                difficulty = max(1, min(5, int(1 + progress * 3 + random.choice([0, 1]))))
                # Accuracy improves over time for patient1
                accuracy = min(
                    0.98,
                    base_accuracy + progress * 0.15 + random.uniform(-0.08, 0.06),
                )
                accuracy = max(0.3, accuracy)
                mistakes = max(0, int((1 - accuracy) * 20) + random.choice([0, 1]))
                attempts = random.randint(8, 20)
                response_time = max(
                    1.0,
                    random.uniform(1.5, 3.5) * (1 + difficulty * 0.1),
                )
                completed = random.random() < 0.9
                sessions.append(GameSession(
                    patient_id=patient_id,
                    game_type=game_type,
                    difficulty=difficulty,
                    score=round(accuracy * 100 * random.uniform(0.85, 0.98), 1),
                    accuracy=round(accuracy, 2),
                    response_time=round(response_time, 2),
                    mistakes=mistakes,
                    attempts=attempts,
                    completed=completed,
                    offline_created=False,
                    created_at=day,
                    synced_at=day,
                ))
        return sessions

    s1 = gen_sessions(patient1.id, base_accuracy=0.65, trend_up=True)
    s2 = gen_sessions(patient2.id, base_accuracy=0.72, trend_up=False)
    db.add_all(s1 + s2)
    db.commit()

    # --- Recommendations ---
    db.add(Recommendation(
        patient_id=patient1.id,
        game_type="memory_match",
        difficulty=3,
        reason="Your recent memory accuracy has remained above 85%. NeuroNest recommends Memory Level 3.",
        confidence=0.84,
    ))
    db.add(Recommendation(
        patient_id=patient2.id,
        game_type="attention",
        difficulty=2,
        reason="Attention accuracy has been steady. A Level 2 attention activity is recommended.",
        confidence=0.71,
    ))
    db.commit()

    # --- Reminders ---
    now = datetime.utcnow()
    db.add(Reminder(
        patient_id=patient1.id,
        caregiver_id=caregiver.id,
        title="Morning cognitive exercise",
        description="A short Memory Match session after breakfast.",
        scheduled_time=now.replace(hour=10, minute=0, second=0, microsecond=0),
        completed=False,
    ))
    db.add(Reminder(
        patient_id=patient2.id,
        caregiver_id=caregiver.id,
        title="Evening Sequence activity",
        description="Sequence Recall before dinner.",
        scheduled_time=now.replace(hour=17, minute=30, second=0, microsecond=0),
        completed=True,
    ))
    db.commit()

    print("=" * 60)
    print("NeuroNest AI DEMO DATA seeded successfully.")
    print("=" * 60)
    print(f"Caregiver: caregiver@neuronest.demo / {DEMO_PASSWORD}")
    print(f"Patient 1: patient@neuronest.demo / {DEMO_PASSWORD}")
    print(f"Patient 2: meena@neuronest.demo / {DEMO_PASSWORD}")
    print("Note: All seed data is DEMO DATA for development only.")
    db.close()


if __name__ == "__main__":
    seed()

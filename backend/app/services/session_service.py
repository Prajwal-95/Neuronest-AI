from datetime import datetime
from typing import List
from sqlalchemy.orm import Session
from app.models.models import GameSession
from app.schemas.schemas import SessionCreate, SessionResponse
from app.ml.adaptive_engine import compute_performance_score


def create_session(db: Session, patient_id: int, data: SessionCreate) -> GameSession:
    session = GameSession(
        patient_id=patient_id,
        game_type=data.game_type,
        difficulty=data.difficulty,
        score=data.score,
        accuracy=data.accuracy,
        response_time=data.response_time,
        mistakes=data.mistakes,
        attempts=data.attempts,
        completed=data.completed,
        offline_created=data.offline_created,
        client_id=data.client_id,
        created_at=data.created_at or datetime.utcnow(),
        synced_at=None if data.offline_created else datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def sync_sessions(db: Session, patient_id: int, sessions: List[SessionCreate]):
    synced = []
    duplicates = 0
    failed = 0

    for data in sessions:
        if data.client_id:
            existing = (
                db.query(GameSession)
                .filter(
                    GameSession.client_id == data.client_id,
                    GameSession.patient_id == patient_id,
                )
                .first()
            )
            if existing:
                duplicates += 1
                continue
        # Recompute score server-side from raw metrics
        score = compute_performance_score({
            "accuracy": data.accuracy,
            "response_time": data.response_time,
            "mistakes": data.mistakes,
            "attempts": data.attempts,
            "completed": data.completed,
            "difficulty": data.difficulty,
        })
        data_dict = data.model_dump()
        data_dict["score"] = score
        data_dict["client_id"] = data.client_id
        data_dict["created_at"] = data.created_at or datetime.utcnow()
        data_dict["offline_created"] = True
        try:
            session = create_session(
                db, patient_id, SessionCreate(**data_dict)
            )
            synced.append(session)
            session.synced_at = datetime.utcnow()
            db.commit()
        except Exception:
            db.rollback()
            failed += 1

    return synced, duplicates, failed

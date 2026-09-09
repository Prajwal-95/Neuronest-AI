from datetime import datetime
from sqlalchemy.orm import Session
from app.models.models import Recommendation
from app.ml.recommendation import recommendation_model
from app.services.analytics_service import (
    get_sessions_for_patient, recent_scores_for_patient,
)
from app.ml.adaptive_engine import adaptive_engine


def generate_recommendation(db: Session, patient_id: int) -> Recommendation:
    """Generate a new recommendation based on real patient data."""
    sessions = get_sessions_for_patient(db, patient_id)
    recent = recent_scores_for_patient(db, patient_id)

    if not sessions:
        reason = (
            "You haven't completed any activities yet. NeuroNest recommends starting "
            "with a Memory Match activity at Level 1 to begin your cognitive journey."
        )
        rec = Recommendation(
            patient_id=patient_id,
            game_type="memory_match",
            difficulty=1,
            reason=reason,
            confidence=0.7,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return rec

    avg_accuracy = sum(s.accuracy or 0 for s in sessions) / len(sessions)
    avg_response = sum(s.response_time or 0 for s in sessions) / len(sessions)
    completed = [s for s in sessions if s.completed]
    completion_rate = len(completed) / len(sessions)
    mistakes_total = sum(s.mistakes or 0 for s in sessions)
    error_rate = mistakes_total / max(len(sessions) * 10, 1)

    # Improvement: compare first vs last half of recent sessions
    improvement = 0.0
    if len(recent) >= 4:
        half = len(recent) // 2
        first_half = sum(recent[:half]) / half
        second_half = sum(recent[half:]) / max(len(recent) - half, 1)
        improvement = second_half - first_half

    features = {
        "avg_accuracy": avg_accuracy,
        "avg_response_time": avg_response,
        "improvement": improvement,
        "error_rate": error_rate,
        "completion_rate": completion_rate,
        "current_difficulty": sessions[0].difficulty if sessions else 2,
        "recent_scores": recent,
    }

    rec_data = recommendation_model.recommend(features)

    rec = Recommendation(
        patient_id=patient_id,
        game_type=rec_data["game_type"],
        difficulty=rec_data["difficulty"],
        reason=rec_data["reason"],
        confidence=rec_data["confidence"],
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

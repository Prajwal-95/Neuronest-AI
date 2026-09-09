from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.models import GameSession, User
from app.ml.adaptive_engine import compute_performance_score


GAME_DOMAINS = {
    "memory_match": "Memory",
    "sequence_recall": "Recognition",
    "attention": "Attention",
    "quick_math": "Processing",
    "word_recall": "Memory",
}


def get_sessions_for_patient(db: Session, patient_id: int) -> List[GameSession]:
    return (
        db.query(GameSession)
        .filter(GameSession.patient_id == patient_id, GameSession.completed == True)
        .order_by(GameSession.created_at.desc())
        .all()
    )


def compute_current_streak(sessions: List[GameSession]) -> int:
    """Compute consecutive days with at least one completed session."""
    if not sessions:
        return 0
    days = {s.created_at.date() for s in sessions}
    streak = 0
    day = datetime.utcnow().date()
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def build_patient_analytics(db: Session, patient_id: int) -> Dict[str, Any]:
    sessions = get_sessions_for_patient(db, patient_id)

    if not sessions:
        now = datetime.utcnow().date().isoformat()
        return {
            "overall_score": 0,
            "sessions_completed": 0,
            "current_streak": 0,
            "weekly_activity": 0,
            "domains": [
                {"domain": "Memory", "score": 0, "accuracy": 0, "sessions": 0},
                {"domain": "Attention", "score": 0, "accuracy": 0, "sessions": 0},
                {"domain": "Recognition", "score": 0, "accuracy": 0, "sessions": 0},
                {"domain": "Processing", "score": 0, "accuracy": 0, "sessions": 0},
            ],
            "weekly_trend": [{"date": now, "score": 0, "sessions": 0}],
            "recent_sessions": [],
            "difficulty_progression": [],
        }

    # --- Overall ---
    overall_score = round(
        sum(s.score for s in sessions) / len(sessions), 1
    )
    sessions_completed = len(sessions)
    current_streak = compute_current_streak(sessions)

    # --- Weekly activity ---
    week_ago = datetime.utcnow() - timedelta(days=7)
    weekly_sessions = [s for s in sessions if s.created_at >= week_ago]
    weekly_activity = len(weekly_sessions)

    # --- Cognitive domains ---
    domain_map = {}
    for s in sessions:
        domain = GAME_DOMAINS.get(s.game_type, "Processing")
        d = domain_map.setdefault(domain, {"scores": [], "accuracies": [], "n": 0})
        if s.score is not None:
            d["scores"].append(s.score)
        if s.accuracy is not None:
            d["accuracies"].append(s.accuracy)
        d["n"] += 1

    domains = []
    for domain_name in ["Memory", "Attention", "Recognition", "Processing"]:
        d = domain_map.get(domain_name)
        if not d or not d["scores"]:
            domains.append({"domain": domain_name, "score": 0, "accuracy": 0, "sessions": 0})
        else:
            avg_score = sum(d["scores"]) / len(d["scores"])
            avg_acc = sum(d["accuracies"]) / len(d["accuracies"])
            domains.append({
                "domain": domain_name,
                "score": round(avg_score, 1),
                "accuracy": round(avg_acc, 2),
                "sessions": d["n"],
            })

    # --- Weekly trend (last 7 days) ---
    weekly_trend = []
    for i in range(6, -1, -1):
        day = (datetime.utcnow() - timedelta(days=i)).date()
        day_sessions = [s for s in sessions if s.created_at.date() == day]
        if day_sessions:
            avg = round(sum(s.score for s in day_sessions) / len(day_sessions), 1)
        else:
            avg = 0
        weekly_trend.append({
            "date": day.isoformat(),
            "score": avg,
            "sessions": len(day_sessions),
        })

    # --- Recent sessions ---
    recent = sessions[:20]

    # --- Difficulty progression ---
    difficulty_progression = [
        {"game_type": s.game_type, "difficulty": s.difficulty, "created_at": s.created_at.isoformat()}
        for s in sessions[-30:]
    ]

    return {
        "overall_score": overall_score,
        "sessions_completed": sessions_completed,
        "current_streak": current_streak,
        "weekly_activity": weekly_activity,
        "domains": domains,
        "weekly_trend": weekly_trend,
        "recent_sessions": recent,
        "difficulty_progression": difficulty_progression,
    }


def recent_scores_for_patient(db: Session, patient_id: int) -> List[float]:
    sessions = (
        db.query(GameSession)
        .filter(GameSession.patient_id == patient_id)
        .order_by(GameSession.created_at.desc())
        .limit(5)
        .all()
    )
    return [s.score for s in sessions if s.score is not None]

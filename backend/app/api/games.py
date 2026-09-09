from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole, GameSession
from app.auth.security import get_current_user, require_role
from app.schemas.schemas import (
    SessionCreate, SessionResponse, AdaptiveRequest, AdaptiveResponse,
)
from app.services.session_service import create_session
from app.services.analytics_service import recent_scores_for_patient
from app.ml.adaptive_engine import adaptive_engine

router = APIRouter(prefix="/games", tags=["games"])


@router.post("/sessions", response_model=SessionResponse)
def submit_session(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can submit game sessions")
    session = create_session(db, current_user.id, data)
    return SessionResponse.model_validate(session)


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(GameSession)
        .filter(GameSession.patient_id == current_user.id)
        .order_by(GameSession.created_at.desc())
        .limit(50)
        .all()
    )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.post("/adaptive", response_model=AdaptiveResponse)
def adaptive(
    data: AdaptiveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evaluate adaptive difficulty from provided performance data."""
    recent = recent_scores_for_patient(db, current_user.id)
    input_data = data.model_dump()
    input_data["recent_scores"] = recent if recent else data.recent_scores
    result = adaptive_engine(input_data)
    return AdaptiveResponse(**result)

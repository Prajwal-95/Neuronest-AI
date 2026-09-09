from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole, Recommendation
from app.auth.security import get_current_user
from app.schemas.schemas import (
    RecommendationResponse, GenerateRecommendationsRequest,
)
from app.services.recommendation_service import generate_recommendation

router = APIRouter(tags=["recommendations"])


def _patient_authorized(current_user: User, patient_id: int, db: Session) -> bool:
    if current_user.role == UserRole.PATIENT and current_user.id == patient_id:
        return True
    if current_user.role == UserRole.CAREGIVER:
        from app.models.models import CaregiverPatient
        link = (
            db.query(CaregiverPatient)
            .filter(
                CaregiverPatient.caregiver_id == current_user.id,
                CaregiverPatient.patient_id == patient_id,
            )
            .first()
        )
        return link is not None
    return False


@router.get("/patients/{patient_id}/recommendations", response_model=list[RecommendationResponse])
def patient_recommendations(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _patient_authorized(current_user, patient_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.patient_id == patient_id)
        .order_by(Recommendation.created_at.desc())
        .limit(10)
        .all()
    )
    return [RecommendationResponse.model_validate(r) for r in recs]


@router.post("/recommendations/generate", response_model=RecommendationResponse)
def create_recommendation(
    data: GenerateRecommendationsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _patient_authorized(current_user, data.patient_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
    rec = generate_recommendation(db, data.patient_id)
    return RecommendationResponse.model_validate(rec)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole, CaregiverPatient, GameSession, Recommendation
from app.auth.security import get_current_user
from app.schemas.schemas import (
    PatientAnalytics, PatientSummary, CaregiverDashboard,
)
from app.services.analytics_service import (
    build_patient_analytics, get_sessions_for_patient,
)

router = APIRouter(tags=["patients"])


def _is_authorized(caregiver: User, patient_id: int, db: Session) -> bool:
    if caregiver.role == UserRole.PATIENT and caregiver.id == patient_id:
        return True
    if caregiver.role == UserRole.CAREGIVER:
        link = (
            db.query(CaregiverPatient)
            .filter(
                CaregiverPatient.caregiver_id == caregiver.id,
                CaregiverPatient.patient_id == patient_id,
            )
            .first()
        )
        if link:
            return True
    return False


def _get_patient_or_403(db: Session, current_user: User, patient_id: int) -> User:
    patient = db.query(User).filter(User.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not _is_authorized(current_user, patient_id, db):
        raise HTTPException(status_code=403, detail="Not authorized for this patient")
    return patient


@router.get("/patients", response_model=list[PatientSummary])
def list_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List patients. For caregivers: connected patients. For patients: self."""
    from datetime import datetime, timedelta

    if current_user.role == UserRole.PATIENT:
        sessions = get_sessions_for_patient(db, current_user.id)
        last_activity = sessions[0].created_at if sessions else None
        week_ago = datetime.utcnow() - timedelta(days=7)
        weekly = [s for s in sessions if s.created_at >= week_ago]
        overall = round(sum(s.score for s in sessions) / len(sessions), 1) if sessions else 0
        return [PatientSummary(
            id=current_user.id,
            name=current_user.name,
            email=current_user.email,
            language=current_user.language,
            last_activity=last_activity,
            weekly_sessions=len(weekly),
            overall_performance=overall,
            sync_status="synced",
        )]

    # Caregiver
    links = (
        db.query(CaregiverPatient)
        .filter(CaregiverPatient.caregiver_id == current_user.id)
        .all()
    )
    summaries = []
    for link in links:
        patient = db.query(User).filter(User.id == link.patient_id).first()
        if not patient:
            continue
        sessions = get_sessions_for_patient(db, patient.id)
        last_activity = sessions[0].created_at if sessions else None
        week_ago = datetime.utcnow() - timedelta(days=7)
        weekly = [s for s in sessions if s.created_at >= week_ago]
        overall = round(sum(s.score for s in sessions) / len(sessions), 1) if sessions else 0
        summaries.append(PatientSummary(
            id=patient.id,
            name=patient.name,
            email=patient.email,
            language=patient.language,
            last_activity=last_activity,
            weekly_sessions=len(weekly),
            overall_performance=overall,
            sync_status="synced",
        ))
    return summaries


@router.get("/patients/{patient_id}", response_model=PatientSummary)
def get_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single patient summary (self or connected patient)."""
    patient = _get_patient_or_403(db, current_user, patient_id)
    from datetime import datetime, timedelta
    sessions = get_sessions_for_patient(db, patient.id)
    last_activity = sessions[0].created_at if sessions else None
    week_ago = datetime.utcnow() - timedelta(days=7)
    weekly = [s for s in sessions if s.created_at >= week_ago]
    overall = round(sum(s.score for s in sessions) / len(sessions), 1) if sessions else 0
    return PatientSummary(
        id=patient.id,
        name=patient.name,
        email=patient.email,
        language=patient.language,
        last_activity=last_activity,
        weekly_sessions=len(weekly),
        overall_performance=overall,
        sync_status="synced",
    )


@router.get("/patients/{patient_id}/analytics", response_model=PatientAnalytics)
def patient_analytics(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_patient_or_403(db, current_user, patient_id)
    data = build_patient_analytics(db, patient_id)
    # Convert session domain objects to response models
    from app.schemas.schemas import SessionResponse
    data["recent_sessions"] = [
        SessionResponse.model_validate(s) for s in data.get("recent_sessions", [])
    ]
    return PatientAnalytics(**data)


@router.delete("/patients/{patient_id}/levels")
def reset_patient_levels(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Caregiver action: reset a patient's adaptive difficulty to Level 1.

    Deletes stored recommendations so the adaptive engine starts over from the
    base level. Completed session history is preserved (for analytics), but a
    fresh recommendation will be generated from level 1 on the next session.
    """
    _get_patient_or_403(db, current_user, patient_id)
    deleted = (
        db.query(Recommendation)
        .filter(Recommendation.patient_id == patient_id)
        .delete()
    )
    db.commit()
    return {"reset": True, "level": 1, "removed_recommendations": deleted}


@router.get("/caregiver/dashboard", response_model=CaregiverDashboard)
def caregiver_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(status_code=403, detail="Caregiver access only")
    from datetime import datetime, timedelta

    patients = list_patients(current_user=current_user, db=db)
    week_ago = datetime.utcnow() - timedelta(days=7)
    all_sessions = (
        db.query(GameSession)
        .filter(GameSession.created_at >= week_ago)
        .all()
    )
    sessions_this_week = len(all_sessions)
    avg_engagement = round(sessions_this_week / max(len(patients), 1), 1)
    return CaregiverDashboard(
        patients=patients,
        sessions_this_week=sessions_this_week,
        average_engagement=avg_engagement,
    )

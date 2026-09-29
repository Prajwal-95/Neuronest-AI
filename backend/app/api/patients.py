from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole, CaregiverPatient, GameSession, Recommendation, Reminder
from app.auth.security import get_current_user, require_role, hash_password
from app.schemas.schemas import (
    PatientAnalytics, PatientSummary, CaregiverDashboard, SessionResponse,
    PatientCreate, PatientDeleteResponse, PatientReport,
)
from app.services.analytics_service import (
    build_patient_analytics, get_sessions_for_patient,
)
from app.services.report_service import build_patient_report

router = APIRouter(tags=["patients"])


def _summary_for(db: Session, patient: User) -> PatientSummary:
    """Build the caregiver/patient summary card for one patient."""
    sessions = get_sessions_for_patient(db, patient.id)
    last_activity = sessions[0].created_at if sessions else None
    week_ago = datetime.utcnow() - timedelta(days=7)
    weekly = [s for s in sessions if s.created_at >= week_ago]
    overall = round(sum(s.score for s in sessions) / len(sessions), 1) if sessions else 0

    # A patient is only truly synced once every stored session has been
    # acknowledged; offline-created rows keep `synced_at = None` until the queue
    # is flushed through /sync/sessions. Checked across all sessions (not just
    # completed ones) so a dropped offline run still surfaces.
    unsynced = (
        db.query(GameSession.id)
        .filter(
            GameSession.patient_id == patient.id,
            GameSession.synced_at.is_(None),
        )
        .first()
    )

    return PatientSummary(
        id=patient.id,
        name=patient.name,
        email=patient.email,
        language=patient.language,
        last_activity=last_activity,
        weekly_sessions=len(weekly),
        overall_performance=overall,
        sync_status="pending" if unsynced else "synced",
    )


def _connected_patients(db: Session, caregiver_id: int) -> list:
    links = (
        db.query(CaregiverPatient)
        .filter(CaregiverPatient.caregiver_id == caregiver_id)
        .all()
    )
    patients = []
    for link in links:
        patient = db.query(User).filter(User.id == link.patient_id).first()
        if patient:
            patients.append(patient)
    return patients


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
    if current_user.role == UserRole.PATIENT:
        return [_summary_for(db, current_user)]
    return [_summary_for(db, p) for p in _connected_patients(db, current_user.id)]


@router.get("/patients/{patient_id}", response_model=PatientSummary)
def get_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single patient summary (self or connected patient)."""
    patient = _get_patient_or_403(db, current_user, patient_id)
    return _summary_for(db, patient)


@router.get("/patients/{patient_id}/analytics", response_model=PatientAnalytics)
def patient_analytics(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_patient_or_403(db, current_user, patient_id)
    data = build_patient_analytics(db, patient_id)
    # Convert session domain objects to response models
    data["recent_sessions"] = [
        SessionResponse.model_validate(s) for s in data.get("recent_sessions", [])
    ]
    return PatientAnalytics(**data)


@router.get("/patients/{patient_id}/sessions", response_model=list[SessionResponse])
def patient_sessions(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full session history for a patient, newest first.

    Backs the caregiver's "pick a day and inspect every activity" view. The
    existing /analytics endpoint only returns the 20 most recent sessions, so
    without this a caregiver cannot see what happened on an older date.

    Authorisation is identical to /analytics: a caregiver may only read
    patients they are linked to, and a patient may only read their own.
    """
    _get_patient_or_403(db, current_user, patient_id)
    sessions = (
        db.query(GameSession)
        .filter(GameSession.patient_id == patient_id)
        .order_by(GameSession.created_at.desc())
        .limit(500)
        .all()
    )
    return [SessionResponse.model_validate(s) for s in sessions]


@router.post("/patients", response_model=PatientSummary, status_code=201)
def add_patient(
    data: PatientCreate,
    current_user: User = Depends(require_role(UserRole.CAREGIVER)),
    db: Session = Depends(get_db),
):
    """Add a patient and link them to the current caregiver.

    If the email already exists we link the existing account rather than
    failing, which is what a caregiver means by "add my father" when he has
    already played once on another device.
    """
    email = data.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()

    if existing:
        if not data.link_existing:
            raise HTTPException(status_code=409, detail="A user with that email already exists")
        # Never let a caregiver attach a caregiver account as their patient.
        if existing.role != UserRole.PATIENT:
            raise HTTPException(
                status_code=400,
                detail="That account is not a patient account",
            )
        already = (
            db.query(CaregiverPatient)
            .filter(
                CaregiverPatient.caregiver_id == current_user.id,
                CaregiverPatient.patient_id == existing.id,
            )
            .first()
        )
        if not already:
            db.add(CaregiverPatient(caregiver_id=current_user.id, patient_id=existing.id))
            db.commit()
        return _summary_for(db, existing)

    patient = User(
        name=data.name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role=UserRole.PATIENT,
        language=data.language if data.language in ("en", "hi") else "en",
    )
    db.add(patient)
    db.flush()  # assign patient.id before creating the link
    db.add(CaregiverPatient(caregiver_id=current_user.id, patient_id=patient.id))
    db.commit()
    db.refresh(patient)
    return _summary_for(db, patient)


@router.delete("/patients/{patient_id}", response_model=PatientDeleteResponse)
def remove_patient(
    patient_id: int,
    remove_account: bool = False,
    current_user: User = Depends(require_role(UserRole.CAREGIVER)),
    db: Session = Depends(get_db),
):
    """Unlink a patient from this caregiver.

    By default this ONLY removes the caregiver<->patient link, so the patient's
    own account and activity history survive - the safe default, because the
    same patient may be cared for by more than one person.

    `remove_account=true` additionally deletes the patient user and their
    sessions. That is irreversible, so the UI must confirm explicitly.
    """
    patient = db.query(User).filter(User.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if patient.role != UserRole.PATIENT:
        raise HTTPException(status_code=400, detail="Not a patient account")
    # Must be linked to THIS caregiver, otherwise one caregiver could delete
    # another caregiver's patient.
    link = (
        db.query(CaregiverPatient)
        .filter(
            CaregiverPatient.caregiver_id == current_user.id,
            CaregiverPatient.patient_id == patient_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not authorized for this patient")

    db.delete(link)
    removed_user = False
    if remove_account:
        db.query(GameSession).filter(GameSession.patient_id == patient_id).delete()
        db.query(Reminder).filter(Reminder.patient_id == patient_id).delete()
        db.query(Recommendation).filter(Recommendation.patient_id == patient_id).delete()
        # Other caregivers' links would dangle, so clear them too.
        db.query(CaregiverPatient).filter(CaregiverPatient.patient_id == patient_id).delete()
        db.delete(patient)
        removed_user = True
    db.commit()
    return PatientDeleteResponse(
        deleted=True, patient_id=patient_id,
        unlinked_only=not removed_user, removed_user=removed_user,
    )


@router.get("/patients/{patient_id}/report", response_model=PatientReport)
def patient_report(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Caregiver-facing progress report for one patient.

    Rule-based, derived purely from stored session metrics. See
    services/report_service.py for the honesty note on what it deliberately
    does NOT claim.
    """
    _get_patient_or_403(db, current_user, patient_id)
    return PatientReport(**build_patient_report(db, patient_id))


@router.delete("/patients/{patient_id}/levels")
def reset_patient_levels(
    patient_id: int,
    current_user: User = Depends(require_role(UserRole.CAREGIVER)),
    db: Session = Depends(get_db),
):
    """Caregiver action: reset a patient's adaptive difficulty to Level 1.

    Deletes the stored recommendations so the recommendation card no longer
    pushes the patient toward an elevated level; the next call to
    /recommendations/generate rebuilds one from scratch.

    Completed session history is deliberately preserved (analytics are
    longitudinal, and the difficulty history is the caregiver's evidence of
    progression).

    Note on scope: the *per-game level* the games actually launch at lives in
    the patient device's localStorage, not in the database. The caregiver UI
    clears those keys on this browser as part of the same action, so the reset
    takes effect immediately on the device it is performed from. A patient who
    has signed in on a second device will pick the reset up on their next
    session, once their local queue syncs and a fresh recommendation is served.
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

    linked = _connected_patients(db, current_user.id)
    patients = [_summary_for(db, p) for p in linked]

    # Count only sessions belonging to THIS caregiver's connected patients.
    # Counting the whole table leaked every tenant's activity into this
    # dashboard and inflated engagement on any multi-caregiver deployment.
    week_ago = datetime.utcnow() - timedelta(days=7)
    linked_ids = [p.id for p in linked]
    if linked_ids:
        sessions_this_week = (
            db.query(GameSession.id)
            .filter(
                GameSession.patient_id.in_(linked_ids),
                GameSession.created_at >= week_ago,
            )
            .count()
        )
    else:
        sessions_this_week = 0

    avg_engagement = round(sessions_this_week / max(len(patients), 1), 1)
    return CaregiverDashboard(
        patients=patients,
        sessions_this_week=sessions_this_week,
        average_engagement=avg_engagement,
    )

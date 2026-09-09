from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole, Reminder
from app.auth.security import get_current_user
from app.schemas.schemas import (
    ReminderCreate, ReminderUpdate, ReminderResponse,
)

router = APIRouter(prefix="/reminders", tags=["reminders"])


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


@router.get("", response_model=list[ReminderResponse])
def list_reminders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List reminders. Patients see their own; caregivers see reminders
    for all connected patients."""
    if current_user.role == UserRole.PATIENT:
        reminders = (
            db.query(Reminder)
            .filter(Reminder.patient_id == current_user.id)
            .order_by(Reminder.scheduled_time.desc())
            .all()
        )
        return [ReminderResponse.model_validate(r) for r in reminders]

    from app.models.models import CaregiverPatient
    patient_ids = [
        link.patient_id
        for link in db.query(CaregiverPatient)
        .filter(CaregiverPatient.caregiver_id == current_user.id)
        .all()
    ]
    if not patient_ids:
        return []
    reminders = (
        db.query(Reminder)
        .filter(Reminder.patient_id.in_(patient_ids))
        .order_by(Reminder.scheduled_time.desc())
        .all()
    )
    return [ReminderResponse.model_validate(r) for r in reminders]


@router.post("", response_model=ReminderResponse)
def create_reminder(
    data: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(status_code=403, detail="Only caregivers can create reminders")
    if not _patient_authorized(current_user, data.patient_id, db):
        raise HTTPException(status_code=403, detail="Not authorized for this patient")
    reminder = Reminder(
        patient_id=data.patient_id,
        caregiver_id=current_user.id,
        title=data.title,
        description=data.description,
        scheduled_time=data.scheduled_time,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return ReminderResponse.model_validate(reminder)


@router.put("/{reminder_id}", response_model=ReminderResponse)
def update_reminder(
    reminder_id: int,
    data: ReminderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if current_user.id not in (reminder.patient_id, reminder.caregiver_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    if data.completed is not None:
        reminder.completed = data.completed
    if data.title is not None:
        reminder.title = data.title
    if data.description is not None:
        reminder.description = data.description
    if data.scheduled_time is not None:
        reminder.scheduled_time = data.scheduled_time
    db.commit()
    db.refresh(reminder)
    return ReminderResponse.model_validate(reminder)


@router.delete("/{reminder_id}", response_model=ReminderResponse)
def delete_reminder(
    reminder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if current_user.id not in (reminder.patient_id, reminder.caregiver_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(reminder)
    db.commit()
    return ReminderResponse.model_validate(reminder)

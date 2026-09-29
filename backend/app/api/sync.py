from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole
from app.auth.security import get_current_user
from app.schemas.schemas import SyncRequest, SyncResponse, SessionResponse
from app.services.session_service import sync_sessions

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/sessions", response_model=SyncResponse)
def sync_pending_sessions(
    data: SyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can sync sessions")
    synced, duplicates, failed = sync_sessions(db, current_user.id, data.sessions)
    return SyncResponse(
        synced=[SessionResponse.model_validate(s) for s in synced],
        duplicates=duplicates,
        failed=failed,
    )

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole
from app.auth.security import get_current_user
from app.schemas.schemas import UserResponse

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

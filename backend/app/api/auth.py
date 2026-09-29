from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.db import get_db
from app.models.models import User, UserRole
from app.auth.security import (
    hash_password, verify_password, create_access_token, get_current_user,
)
from app.auth.google_auth import google_configured, verify_id_token
from app.schemas.schemas import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    GoogleLoginRequest, AuthConfigResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

#: Password logins for Google-only accounts fail here instead of crashing in
#: passlib: a NULL hash is not a string passlib can verify.
_UNUSABLE_PASSWORD_HASH = "!"



@router.post("/register", response_model=TokenResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    role = UserRole(data.role)
    if role == UserRole.CAREGIVER:
        # A caregiver must provide some linkage later; for prototype, self-registration is allowed.
        pass

    user = User(
        name=data.name,
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        role=role,
        language=data.language,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    stored_hash = user.password_hash if user else None
    if not user or not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/config", response_model=AuthConfigResponse)
def auth_config():
    """Tell the Login page which buttons to show — no secrets included."""
    return AuthConfigResponse(
        google_enabled=google_configured(),
        demo_enabled=True,
    )


@router.post("/google", response_model=TokenResponse)
def login_with_google(data: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Sign in (or first-time sign up) with a Google ID token.

    The browser obtains the one-time `id_token` via Google Identity Services;
    the backend verifies it against Google, then finds-or-creates the matching
    row in `users` and mints the app's own JWT — so Google users get the same
    token, roles and offline sync as email users.
    """
    try:
        claims = verify_id_token(data.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        )

    user = None
    if claims["sub"]:
        user = db.query(User).filter(User.google_sub == claims["sub"]).first()
    if user is None:
        user = db.query(User).filter(User.email == claims["email"]).first()

    requested_role = (data.role or "").strip().lower()
    if user is None:
        role = (
            UserRole(requested_role)
            if requested_role in ("patient", "caregiver")
            else UserRole.PATIENT
        )
        user = User(
            name=claims["name"],
            email=claims["email"],
            password_hash=None,  # Google-only: password login stays disabled
            role=role,
            language="en",
            google_sub=claims["sub"] or None,
            auth_provider="google",
            avatar_url=claims["picture"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Link a pre-existing email account to this Google identity (and keep
        # any local password working), so signing in with Google never orphans
        # game sessions already stored under the email login.
        changed = False
        if claims["sub"] and user.google_sub != claims["sub"]:
            user.google_sub = claims["sub"]
            changed = True
        if user.auth_provider != "google":
            user.auth_provider = "google"
            changed = True
        if claims["picture"] and not user.avatar_url:
            user.avatar_url = claims["picture"]
            changed = True
        # A first-time Google user picks patient/caregiver on the Login page;
        # honour it when the stored role is still the default.
        if requested_role in ("patient", "caregiver") and user.role == UserRole.PATIENT:
            user.role = UserRole(requested_role)
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

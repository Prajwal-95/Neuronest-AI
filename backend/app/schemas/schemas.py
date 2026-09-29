from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(patient|caregiver)$")
    language: str = "en"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    """One-time Google ID token from GIS + the role a new user picked."""

    id_token: str = Field(min_length=10)
    role: str = Field(default="patient", pattern="^(patient|caregiver)$")


class AuthConfigResponse(BaseModel):
    """Which login buttons the frontend should render (no secrets)."""

    google_enabled: bool = False
    demo_enabled: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    language: str
    created_at: datetime
    auth_provider: str = "local"
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


# ---------- Sessions ----------
class SessionCreate(BaseModel):
    game_type: str = Field(
        pattern="^(memory_match|sequence_recall|attention|quick_math|word_recall)$"
    )
    difficulty: int = Field(ge=1, le=10, default=1)
    score: float = Field(ge=0, le=100)
    accuracy: float = Field(ge=0, le=1)
    response_time: float = Field(ge=0)
    mistakes: int = Field(ge=0)
    attempts: int = Field(ge=0)
    completed: bool = True
    offline_created: bool = False
    client_id: Optional[str] = None
    created_at: Optional[datetime] = None


class SessionResponse(BaseModel):
    id: int
    patient_id: int
    game_type: str
    difficulty: int
    score: float
    accuracy: float
    response_time: float
    mistakes: int
    attempts: int
    completed: bool
    offline_created: bool
    created_at: datetime
    synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Sync ----------
class SyncRequest(BaseModel):
    sessions: List[SessionCreate]


class SyncResponse(BaseModel):
    synced: List[SessionResponse]
    duplicates: int = 0
    failed: int = 0


# ---------- Analytics ----------
class DomainAnalytics(BaseModel):
    domain: str
    score: float
    accuracy: float
    sessions: int


class WeeklyPoint(BaseModel):
    date: str
    score: float
    sessions: int


class DifficultyTrend(BaseModel):
    game_type: str
    difficulty: int
    created_at: datetime


class PatientAnalytics(BaseModel):
    overall_score: float
    sessions_completed: int
    current_streak: int
    weekly_activity: int
    domains: List[DomainAnalytics]
    weekly_trend: List[WeeklyPoint]
    recent_sessions: List[SessionResponse]
    difficulty_progression: List[DifficultyTrend]


# ---------- Recommendations ----------
class AdaptiveRequest(BaseModel):
    accuracy: float
    response_time: float
    mistakes: int
    current_difficulty: int = Field(ge=1, le=10)
    recent_scores: List[float] = []
    # Optional so the returned reason can name the game ("memory accuracy")
    # instead of the generic "cognitive accuracy".
    game_type: Optional[str] = None


class AdaptiveResponse(BaseModel):
    recommended_difficulty: int
    reason: str
    confidence: float


class PatientCreate(BaseModel):
    """Caregiver action: add a patient and link them to this caregiver."""
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=6, max_length=128)
    language: str = "en"

    # If the email already exists, link the existing account instead of failing.
    link_existing: bool = True


class PatientDeleteResponse(BaseModel):
    deleted: bool
    patient_id: int
    unlinked_only: bool
    removed_user: bool


class ReportFinding(BaseModel):
    severity: str          # "good" | "info" | "warning"
    title: str
    detail: str


class PatientReport(BaseModel):
    patient_id: int
    patient_name: str
    generated_at: datetime
    summary: str
    overall_score: float
    sessions_completed: int
    current_streak: int
    weekly_activity: int
    engagement: str
    strongest_area: str
    weakest_area: str
    trend: str
    findings: list[ReportFinding]
    recent_days: list[dict]
    disclaimer: str


class RecommendationResponse(BaseModel):
    id: int
    patient_id: int
    game_type: str
    difficulty: int
    reason: str
    confidence: float
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateRecommendationsRequest(BaseModel):
    patient_id: int
    force: bool = False


# ---------- Reminders ----------
class ReminderCreate(BaseModel):
    patient_id: int
    title: str = Field(min_length=1)
    description: str = ""
    scheduled_time: datetime


class ReminderUpdate(BaseModel):
    completed: Optional[bool] = None
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_time: Optional[datetime] = None


class ReminderResponse(BaseModel):
    id: int
    patient_id: int
    caregiver_id: int
    title: str
    description: str
    scheduled_time: datetime
    completed: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Caregiver ----------
class PatientSummary(BaseModel):
    id: int
    name: str
    email: str
    language: str
    last_activity: Optional[datetime]
    weekly_sessions: int
    overall_performance: float
    sync_status: str


class CaregiverDashboard(BaseModel):
    patients: List[PatientSummary]
    sessions_this_week: int
    average_engagement: float


SessionCreate.model_rebuild()
TokenResponse.model_rebuild()

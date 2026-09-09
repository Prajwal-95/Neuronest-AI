from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum,
)
from sqlalchemy.orm import relationship
from app.database.db import Base
import enum


class UserRole(str, enum.Enum):
    PATIENT = "patient"
    CAREGIVER = "caregiver"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    language = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    caregiver_links = relationship(
        "CaregiverPatient",
        foreign_keys="CaregiverPatient.caregiver_id",
        back_populates="caregiver",
    )
    patient_links = relationship(
        "CaregiverPatient",
        foreign_keys="CaregiverPatient.patient_id",
        back_populates="patient",
    )
    sessions = relationship("GameSession", back_populates="patient")


class CaregiverPatient(Base):
    __tablename__ = "caregiver_patient"

    id = Column(Integer, primary_key=True, index=True)
    caregiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    caregiver = relationship(
        "User", foreign_keys=[caregiver_id], back_populates="caregiver_links"
    )
    patient = relationship(
        "User", foreign_keys=[patient_id], back_populates="patient_links"
    )


class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True, nullable=True, default=None)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_type = Column(String, nullable=False)
    difficulty = Column(Integer, default=1)
    score = Column(Float, default=0.0)
    accuracy = Column(Float, default=0.0)
    response_time = Column(Float, default=0.0)
    mistakes = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    completed = Column(Boolean, default=True)
    offline_created = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at = Column(DateTime, nullable=True)

    patient = relationship("User", back_populates="sessions")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_type = Column(String, nullable=False)
    difficulty = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    caregiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, default="")
    scheduled_time = Column(DateTime, nullable=False)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

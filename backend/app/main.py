from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database.db import Base, engine
from app.api import api_router
import app.models.models  # ensure models are registered

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NeuroNest AI API",
    description=(
        "Personalized cognitive care, one interaction at a time. "
        "Assistive cognitive engagement platform - not a medical diagnostic tool."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"message": "NeuroNest AI API is running", "docs": "/docs"}

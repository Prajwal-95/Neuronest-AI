from fastapi import APIRouter
from app.api import auth, users, games, patients, recommendations, reminders, sync, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(games.router)
api_router.include_router(patients.router)
api_router.include_router(recommendations.router)
api_router.include_router(reminders.router)
api_router.include_router(sync.router)

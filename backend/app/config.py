from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./neuronest.db"
    JWT_SECRET_KEY: str = "neuronest-dev-secret-key-2024"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"


settings = Settings()

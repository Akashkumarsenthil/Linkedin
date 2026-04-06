"""
LinkedIn Platform — Configuration
Centralized configuration using environment variables with sensible defaults.
"""

import os
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ─── App ────────────────────────────────────────
    APP_NAME: str = "LinkedIn Agentic AI Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # ─── MySQL ──────────────────────────────────────
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "localhost")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER: str = os.getenv("MYSQL_USER", "linkedin_user")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "linkedin_pass")
    MYSQL_DATABASE: str = os.getenv("MYSQL_DATABASE", "linkedin")

    @property
    def MYSQL_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    # ─── MongoDB ────────────────────────────────────
    MONGO_HOST: str = os.getenv("MONGO_HOST", "localhost")
    # Default 27018 matches docker-compose (published port) to avoid local mongod on 27017.
    MONGO_PORT: int = int(os.getenv("MONGO_PORT", "27018"))
    MONGO_USER: str = os.getenv("MONGO_USER", "mongo_user")
    MONGO_PASSWORD: str = os.getenv("MONGO_PASSWORD", "mongo_pass")
    MONGO_DATABASE: str = os.getenv("MONGO_DATABASE", "linkedin")
    MONGO_AUTH_SOURCE: str = os.getenv("MONGO_AUTH_SOURCE", "admin")

    @property
    def MONGO_URL(self) -> str:
        user = quote_plus(self.MONGO_USER)
        password = quote_plus(self.MONGO_PASSWORD)
        return (
            f"mongodb://{user}:{password}@{self.MONGO_HOST}:{self.MONGO_PORT}"
            f"/?authSource={quote_plus(self.MONGO_AUTH_SOURCE)}"
        )

    # ─── Redis ──────────────────────────────────────
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = 0
    REDIS_CACHE_TTL: int = 300  # seconds

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ─── Kafka ──────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9094")

    # ─── Ollama (Local LLM) ─────────────────────────
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")

    # ─── Auth / JWT ─────────────────────────────────────────────────
    JWT_SECRET: str = os.getenv("JWT_SECRET", "linkedin-demo-secret-change-in-prod")
    JWT_EXPIRE_HOURS: int = 24

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

"""Application settings loaded from environment variables (and an optional ``.env`` file)."""

from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_SECRET_KEY = "dev-insecure-secret-key-change-me"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    """Typed runtime configuration for the SlotEase API."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "SlotEase"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "sqlite:///./slotease.db"

    # Auth
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30

    # Web
    FRONTEND_URL: str = "http://localhost:5173"
    # NoDecode: accept a plain comma-separated string from the environment instead of JSON.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    RATE_LIMIT_ENABLED: bool = True
    # Where rate-limit counters live. "memory://" is per process; production uses Redis
    # (redis://redis:6379/0) so every gunicorn worker shares one counter per client.
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # Plan
    TRIAL_DAYS: int = 14
    PLAN_PRICE_INR: int = 499

    # Email
    EMAIL_FROM: str = "SlotEase <no-reply@slotease.local>"
    RESEND_API_KEY: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_PLAN_ID: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: Any) -> Any:
        """Accept ``"a,b"``, a JSON-style list string, or a real list."""
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                parsed = json.loads(raw)
                return [str(item).strip().rstrip("/") for item in parsed if str(item).strip()]
            return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
        return value

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def _normalise_environment(cls, value: Any) -> Any:
        """Lower-case the environment name so ``Production`` works too."""
        return value.strip().lower() if isinstance(value, str) else value

    @model_validator(mode="after")
    def _check_production_secret(self) -> Settings:
        """Refuse to start in production with the default or a short SECRET_KEY."""
        if self.is_production and (
            self.SECRET_KEY == DEFAULT_SECRET_KEY or len(self.SECRET_KEY) < MIN_PRODUCTION_SECRET_LENGTH
        ):
            raise ValueError(
                "SECRET_KEY must be set to a random string of at least "
                f"{MIN_PRODUCTION_SECRET_LENGTH} characters in production."
            )
        return self

    @property
    def is_production(self) -> bool:
        """True when running with ENVIRONMENT=production."""
        return self.ENVIRONMENT == "production"

    @property
    def billing_configured(self) -> bool:
        """True when the Razorpay key id, key secret and plan id are all set."""
        return bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET and self.RAZORPAY_PLAN_ID)


settings = Settings()

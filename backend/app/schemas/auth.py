"""Auth request/response schemas (register, login, tokens, profile, password flows)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.business import BusinessOut, validate_timezone_name
from app.schemas.common import ORMModel
from app.services.time_utils import DEFAULT_TIMEZONE
from app.services.validators import normalize_phone, validate_password_strength, validate_slug


def _lower_email(value: Any) -> Any:
    """Strip and lower-case an e-mail address before format validation."""
    return value.strip().lower() if isinstance(value, str) else value


class UserOut(ORMModel):
    """Public view of a user account."""

    id: int
    email: str
    full_name: str
    role: str
    business_id: int
    created_at: datetime


class RegisterIn(BaseModel):
    """Owner sign-up: creates the business (tenant), its owner and default working hours."""

    business_name: str = Field(min_length=2, max_length=120)
    slug: str | None = None
    phone: str
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=255)
    password: str
    timezone: str = DEFAULT_TIMEZONE

    @field_validator("business_name", "full_name")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("This field is required.")
        return stripped

    @field_validator("slug", mode="before")
    @classmethod
    def _check_slug(cls, value: Any) -> Any:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return validate_slug(value)

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, value: Any) -> Any:
        return _lower_email(value)

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("timezone", mode="before")
    @classmethod
    def _check_timezone(cls, value: Any) -> Any:
        if value is None or (isinstance(value, str) and not value.strip()):
            return DEFAULT_TIMEZONE
        if not isinstance(value, str):
            raise ValueError("Timezone must be a string.")
        return validate_timezone_name(value)


class LoginIn(BaseModel):
    """Email + password login."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, value: Any) -> Any:
        return _lower_email(value)


class RefreshIn(BaseModel):
    """A refresh token to rotate or revoke."""

    refresh_token: str = Field(min_length=1, max_length=512)


class AuthOut(BaseModel):
    """Tokens plus the signed-in user and business."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    business: BusinessOut


class MeOut(BaseModel):
    """Current user and business."""

    user: UserOut
    business: BusinessOut
    # Set when a SlotEase admin is viewing this account read-only ("view as owner").
    viewed_by_admin: str | None = None


class UpdateMeIn(BaseModel):
    """Profile update for the current user."""

    full_name: str = Field(min_length=1, max_length=120)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Full name is required.")
        return stripped


class ChangePasswordIn(BaseModel):
    """Change password (requires the current one)."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ForgotPasswordIn(BaseModel):
    """Request a password reset e-mail."""

    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, value: Any) -> Any:
        return _lower_email(value)


class ResetPasswordIn(BaseModel):
    """Set a new password using a reset token from the e-mail link."""

    token: str = Field(min_length=1, max_length=2048)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)

"""Business (tenant) schemas: ``BusinessOut`` response and ``BusinessUpdate`` (PATCH /business)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import SLOT_INTERVALS
from app.schemas.common import ORMModel
from app.services.time_utils import get_tz, is_valid_timezone, to_local
from app.services.validators import normalize_phone, validate_slug

# Fields of BusinessUpdate that map to NOT NULL columns: an explicit ``null`` is rejected.
_NON_NULLABLE_UPDATE_FIELDS: tuple[str, ...] = (
    "name",
    "slug",
    "phone",
    "timezone",
    "slot_interval_min",
    "booking_window_days",
    "min_notice_minutes",
)


def validate_timezone_name(value: str) -> str:
    """Validate an IANA timezone name (raises ``ValueError`` for unknown zones)."""
    name = value.strip()
    if not is_valid_timezone(name):
        raise ValueError("Unknown timezone. Use an IANA name such as Asia/Kolkata.")
    return name


class BusinessOut(ORMModel):
    """Owner-facing business profile. Timestamps are rendered in the business timezone."""

    id: int
    name: str
    slug: str
    phone: str
    email: str | None = None
    address: str | None = None
    timezone: str
    currency: str
    slot_interval_min: int
    booking_window_days: int
    min_notice_minutes: int
    plan: str
    subscription_status: str
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    is_bookable: bool
    created_at: datetime

    @model_validator(mode="after")
    def _localise_datetimes(self) -> BusinessOut:
        """Express timestamps in the business timezone (ISO 8601 with offset)."""
        if not is_valid_timezone(self.timezone):
            return self
        tz = get_tz(self.timezone)
        self.created_at = to_local(self.created_at, tz)
        if self.trial_ends_at is not None:
            self.trial_ends_at = to_local(self.trial_ends_at, tz)
        if self.current_period_end is not None:
            self.current_period_end = to_local(self.current_period_end, tz)
        return self


class BusinessUpdate(ORMModel):
    """Partial update of the business profile and booking rules (PATCH /business)."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=255)
    timezone: str | None = None
    slot_interval_min: int | None = None
    booking_window_days: int | None = Field(default=None, ge=1, le=365)
    min_notice_minutes: int | None = Field(default=None, ge=0, le=10080)

    @model_validator(mode="before")
    @classmethod
    def _reject_null_for_required(cls, data: Any) -> Any:
        """Reject explicit ``null`` for fields whose columns are NOT NULL."""
        if isinstance(data, dict):
            for field in _NON_NULLABLE_UPDATE_FIELDS:
                if field in data and data[field] is None:
                    raise ValueError(f"{field} cannot be null.")
        return data

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return value

    @field_validator("slug")
    @classmethod
    def _check_slug(cls, value: str | None) -> str | None:
        return None if value is None else validate_slug(value)

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, value: str | None) -> str | None:
        return None if value is None else normalize_phone(value)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email_is_null(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip().lower()
            return value or None
        return value

    @field_validator("address")
    @classmethod
    def _strip_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("timezone")
    @classmethod
    def _check_timezone(cls, value: str | None) -> str | None:
        return None if value is None else validate_timezone_name(value)

    @field_validator("slot_interval_min")
    @classmethod
    def _check_interval(cls, value: int | None) -> int | None:
        if value is not None and value not in SLOT_INTERVALS:
            allowed = ", ".join(str(v) for v in SLOT_INTERVALS)
            raise ValueError(f"Slot interval must be one of {allowed} minutes.")
        return value


class BusinessDeleteIn(BaseModel):
    """Confirmation for permanently deleting the business and all of its data."""

    password: str = Field(min_length=1, max_length=128)
    # The business's booking-page slug, typed by the owner to confirm.
    confirm: str = Field(min_length=1, max_length=100)

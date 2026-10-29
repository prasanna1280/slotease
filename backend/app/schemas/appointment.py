"""Owner-side appointment schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.service import Money

AppointmentStatus = Literal["booked", "completed", "cancelled", "no_show"]


class AppointmentOut(BaseModel):
    """An appointment; every datetime is in the business timezone (ISO 8601 with offset)."""

    id: int
    reference: str | None
    service_id: int
    service_name: str
    duration_min: int
    customer_id: int
    customer_name: str
    customer_phone: str
    customer_email: str | None
    start_time: datetime
    end_time: datetime
    status: AppointmentStatus
    price: Money
    notes: str | None
    source: Literal["online", "owner"]
    created_at: datetime


class AppointmentUpdate(BaseModel):
    """``PATCH /appointments/{id}`` body. ``notes: null`` clears the notes; omitted fields are kept."""

    model_config = ConfigDict(extra="forbid")

    status: AppointmentStatus | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def _status_not_null(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Status cannot be null.")
        return value

    @field_validator("notes")
    @classmethod
    def _strip_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

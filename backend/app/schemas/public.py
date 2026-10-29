"""Public booking-page schemas (no auth). ``BookingCreate`` is also the owner booking body."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.service import Money
from app.services.time_utils import MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR, is_supported_year
from app.services.validators import normalize_phone


class PublicBusinessOut(BaseModel):
    """Business card shown on the public booking page."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    slug: str
    phone: str
    address: str | None
    timezone: str
    currency: str
    booking_window_days: int
    is_bookable: bool


class PublicServiceOut(BaseModel):
    """An active service on the public booking page."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    duration_min: int
    price: Money


class SlotOut(BaseModel):
    """One free slot, times in the business timezone; ``label`` is local ``HH:MM``."""

    start_time: datetime
    end_time: datetime
    label: str


class SlotsOut(BaseModel):
    """Free slots of one service on one local day."""

    date: date
    timezone: str
    service_id: int
    duration_min: int
    slots: list[SlotOut]


class BookingCreate(BaseModel):
    """Booking request (public page and owner ``POST /appointments``).

    ``start_time`` must carry a UTC offset; naive datetimes are rejected with 422.
    """

    model_config = ConfigDict(extra="forbid")

    service_id: int = Field(gt=0)
    start_time: AwareDatetime
    customer_name: str = Field(min_length=1, max_length=120)
    customer_phone: str = Field(max_length=32)
    customer_email: EmailStr | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("start_time")
    @classmethod
    def _start_in_range(cls, value: datetime) -> datetime:
        if not is_supported_year(value.year):
            raise ValueError(f"Start time must be between {MIN_SUPPORTED_YEAR} and {MAX_SUPPORTED_YEAR}.")
        return value

    @field_validator("customer_name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name is required.")
        return value

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("customer_email", mode="before")
    @classmethod
    def _email_blank(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip().lower()
            return value or None
        return value

    @field_validator("notes")
    @classmethod
    def _notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class BookingConfirmationOut(BaseModel):
    """201 response of ``POST /public/{slug}/bookings`` (Sample Output A)."""

    booking_id: str
    service: str
    start_time: datetime
    end_time: datetime
    status: str
    message: str
    business_name: str
    customer_name: str
    price: Money

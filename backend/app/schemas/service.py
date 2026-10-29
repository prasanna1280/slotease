"""Service catalogue schemas (owner CRUD) and the shared ``Money`` type."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

TWO_PLACES = Decimal("0.01")


def money_str(value: Decimal | int | float | str | None) -> str:
    """Render a money amount as a fixed two-decimal string (``Decimal("450") -> "450.00"``)."""
    return str(Decimal(str(value if value is not None else 0)).quantize(TWO_PLACES))


# Decimal internally, always serialised as a ``"450.00"`` string in JSON responses.
Money = Annotated[Decimal, PlainSerializer(money_str, return_type=str, when_used="json")]

PriceIn = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]
DurationIn = Annotated[int, Field(ge=5, le=480)]


def _clean_name(value: str) -> str:
    """Strip a name and reject blank values."""
    value = value.strip()
    if not value:
        raise ValueError("Name is required.")
    return value


def _clean_description(value: str | None) -> str | None:
    """Strip a description; blank becomes ``None``."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class ServiceCreate(BaseModel):
    """``POST /services`` body."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    duration_min: DurationIn
    price: PriceIn = Decimal("0")
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean_description(value)


class ServiceUpdate(BaseModel):
    """``PATCH /services/{id}`` body - every field optional; only sent fields change."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    duration_min: DurationIn | None = None
    price: PriceIn | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Name cannot be null.")
        return _clean_name(value)

    @field_validator("duration_min", "price", "is_active")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field cannot be null.")
        return value

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean_description(value)


class ServiceOut(BaseModel):
    """A service as returned to the owner (``created_at`` in the business timezone)."""

    id: int
    name: str
    description: str | None
    duration_min: int
    price: Money
    is_active: bool
    created_at: datetime

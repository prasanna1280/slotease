"""Schemas shared across modules: error body, simple message, pagination, ORM base."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base for response schemas built from SQLAlchemy objects (``model_validate(obj)``)."""

    model_config = ConfigDict(from_attributes=True)


class ErrorDetail(BaseModel):
    """One field-level validation problem."""

    field: str
    message: str


class ErrorOut(BaseModel):
    """Standard error body: ``{"error": "CODE", "message": "...", "details"?: [...]}``."""

    error: str
    message: str
    details: list[Any] | None = None


class MessageOut(BaseModel):
    """Simple ``{"message": "..."}`` response."""

    message: str


class Page(BaseModel, Generic[T]):  # noqa: UP046 - explicit Generic per PRP contract
    """Paginated list response."""

    items: list[T]
    total: int
    page: int
    page_size: int

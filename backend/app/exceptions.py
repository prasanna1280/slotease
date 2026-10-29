"""Application error hierarchy.

Raise these from services/routers; handlers in ``app.main`` turn them into
``{"error": code, "message": message, "details"?: [...]}`` JSON responses.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for all expected API errors."""

    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "Bad request."

    def __init__(
        self,
        message: str | None = None,
        code: str | None = None,
        details: list[Any] | None = None,
    ) -> None:
        """Override the class-level message/code per instance and optionally attach details."""
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        self.details = details
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        """Return the JSON error body for this error."""
        body: dict[str, Any] = {"error": self.code, "message": self.message}
        if self.details:
            body["details"] = self.details
        return body


class UnauthorizedError(AppError):
    """401 - missing/invalid credentials."""

    status_code = 401
    code = "UNAUTHORIZED"
    message = "Not authenticated."


class ForbiddenError(AppError):
    """403 - authenticated but not allowed."""

    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to do this."


class NotFoundError(AppError):
    """404 - resource missing (or belongs to another tenant)."""

    status_code = 404
    code = "NOT_FOUND"
    message = "Not found."


class ConflictError(AppError):
    """409 - state conflict (duplicate, already taken, ...)."""

    status_code = 409
    code = "CONFLICT"
    message = "Conflict."


class ValidationAppError(AppError):
    """422 - business-rule validation failure raised from service code."""

    status_code = 422
    code = "VALIDATION_ERROR"
    message = "Invalid input."


class ServiceUnavailableError(AppError):
    """503 - a dependency (payment provider, ...) is unavailable or not configured."""

    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "Service temporarily unavailable."


class SlotTakenError(ConflictError):
    """409 SLOT_TAKEN - the requested slot overlaps an existing booking."""

    code = "SLOT_TAKEN"
    message = "This slot was just booked. Please pick another time."


class BusinessInactiveError(ForbiddenError):
    """403 BUSINESS_INACTIVE - trial expired and no active subscription."""

    code = "BUSINESS_INACTIVE"
    message = "This business is not accepting online bookings right now."

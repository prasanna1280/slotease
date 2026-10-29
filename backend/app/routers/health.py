"""Health check with database connectivity (``GET /api/v1/health``)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import DbSession
from app.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Health check (API + database)")
def health(db: DbSession) -> dict[str, Any]:
    """Return ``{"status": "ok", "database": "ok"}`` or 503 ``DATABASE_UNAVAILABLE``."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Database health check failed")
        raise ServiceUnavailableError("Database is unavailable.", code="DATABASE_UNAVAILABLE") from exc
    return {"status": "ok", "database": "ok"}

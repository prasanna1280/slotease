"""Health check with dependency status (``GET /api/v1/health``)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import DbSession
from app.exceptions import ServiceUnavailableError
from app.services.health_service import redis_status

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Health check (API + database + redis)")
def health(db: DbSession) -> dict[str, Any]:
    """Return 200 with each dependency's status, or 503 ``DATABASE_UNAVAILABLE``.

    A Redis outage only degrades rate limiting, so it yields 200 with ``status: "degraded"``
    (uptime monitors can alert on that keyword without treating it as downtime).
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Database health check failed")
        raise ServiceUnavailableError("Database is unavailable.", code="DATABASE_UNAVAILABLE") from exc
    cache = redis_status()
    return {"status": "degraded" if cache == "degraded" else "ok", "database": "ok", "redis": cache}

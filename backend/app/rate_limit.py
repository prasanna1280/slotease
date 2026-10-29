"""Shared slowapi rate limiter.

Usage in routers::

    from fastapi import Request
    from app.rate_limit import limiter

    @router.post("/login")
    @limiter.limit("10/minute")
    def login(request: Request, ...): ...

The decorated endpoint must accept a ``request: Request`` parameter.

Counters are stored at ``settings.RATE_LIMIT_STORAGE_URI`` (Redis in production, so all workers share
them). If that storage is unreachable the limiter falls back to per-process memory counters instead of
failing requests, and switches back once the storage is healthy again.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.RATE_LIMIT_ENABLED,
    default_limits=[],
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    in_memory_fallback_enabled=True,
    key_prefix="slotease",
)

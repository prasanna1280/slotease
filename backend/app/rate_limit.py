"""Shared slowapi rate limiter.

Usage in routers::

    from fastapi import Request
    from app.rate_limit import limiter

    @router.post("/login")
    @limiter.limit("10/minute")
    def login(request: Request, ...): ...

The decorated endpoint must accept a ``request: Request`` parameter.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address, enabled=settings.RATE_LIMIT_ENABLED, default_limits=[])

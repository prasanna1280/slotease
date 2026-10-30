"""Dependency checks for the health endpoint.

Redis only holds rate-limit counters and the limiter falls back to per-process memory when it is
unreachable, so a Redis outage is reported as ``degraded`` rather than failing the health check.
"""

from __future__ import annotations

import logging
from typing import Literal

import redis

from app.config import settings

logger = logging.getLogger(__name__)

RedisStatus = Literal["ok", "degraded", "disabled"]

# Keep the probe well under the Docker healthcheck / uptime-monitor timeouts.
_REDIS_TIMEOUT_SECONDS = 1.0


def redis_status() -> RedisStatus:
    """Return ``ok`` if the rate-limit Redis answers PING, ``degraded`` if not, ``disabled`` if unused."""
    uri = settings.RATE_LIMIT_STORAGE_URI
    if not uri.startswith(("redis://", "rediss://")):
        return "disabled"
    client = redis.Redis.from_url(
        uri,
        socket_connect_timeout=_REDIS_TIMEOUT_SECONDS,
        socket_timeout=_REDIS_TIMEOUT_SECONDS,
    )
    try:
        client.ping()
    except redis.RedisError:
        logger.warning("Redis health check failed; rate limiting is using per-process counters")
        return "degraded"
    finally:
        client.close()
    return "ok"

"""Rate limiting (disabled for the rest of the suite; enabled only here, then reset)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.config import settings
from app.rate_limit import limiter
from tests.factories import Tenant, booking_body, local, make_service


@pytest.fixture
def limits_on() -> Iterator[None]:
    limiter.reset()
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = False
        limiter.reset()


def test_disabled_by_default(client: TestClient) -> None:
    assert limiter.enabled is False
    for _ in range(15):
        assert (
            client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "nope"}).status_code
            == 401
        )


def test_login_limited_to_10_per_minute(client: TestClient, limits_on: None) -> None:
    for _ in range(10):
        assert (
            client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "nope"}).status_code
            == 401
        )
    response = client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "nope"})
    assert response.status_code == 429
    assert response.json() == {
        "error": "RATE_LIMITED",
        "message": "Too many requests. Please try again shortly.",
    }
    assert response.headers["retry-after"] == "60"


def test_forgot_password_limited_to_5_per_minute(client: TestClient, limits_on: None) -> None:
    statuses = [
        client.post("/api/v1/auth/forgot-password", json={"email": "x@example.com"}).status_code
        for _ in range(6)
    ]
    assert statuses == [202] * 5 + [429]


def test_public_booking_limited_to_10_per_minute(
    client: TestClient, db: Session, tenant: Tenant, limits_on: None
) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    url = "/api/v1/public/glow-salon/bookings"
    statuses = [
        client.post(
            url,
            json=booking_body(
                service.id,
                local(date(2026, 10, 9), f"{9 + i // 2:02d}:{(i % 2) * 30:02d}"),
                phone=f"+9198000000{i:02d}",
            ),
        ).status_code
        for i in range(11)
    ]
    assert statuses == [201] * 10 + [429]


def test_refresh_limited_to_30_per_minute(client: TestClient, limits_on: None) -> None:
    statuses = [
        client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 64}).status_code for _ in range(31)
    ]
    assert statuses == [401] * 30 + [429]


def test_reset_password_limited_to_5_per_minute(client: TestClient, limits_on: None) -> None:
    body = {"token": "not-a-valid-token", "new_password": "Passw0rd!new"}
    statuses = [client.post("/api/v1/auth/reset-password", json=body).status_code for _ in range(6)]
    assert statuses == [400] * 5 + [429]


def test_limiter_uses_configured_storage_with_memory_fallback() -> None:
    assert settings.RATE_LIMIT_STORAGE_URI == "memory://"
    assert limiter._in_memory_fallback_enabled is True


def test_unreachable_redis_falls_back_to_memory_counters() -> None:
    """A Redis outage must not fail requests: counting continues per process until Redis is back."""
    broken = Limiter(
        key_func=get_remote_address,
        storage_uri="redis://127.0.0.1:1/0",
        in_memory_fallback_enabled=True,
    )
    app = FastAPI()
    app.state.limiter = broken
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    @app.get("/ping")
    @broken.limit("2/minute")
    def ping(request: Request) -> dict[str, str]:
        return {"ok": "yes"}

    with TestClient(app) as test_client:
        statuses = [test_client.get("/ping").status_code for _ in range(3)]
    assert statuses == [200, 200, 429]

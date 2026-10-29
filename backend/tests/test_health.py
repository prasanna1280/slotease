"""Health endpoints and OpenAPI wiring."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app


def test_root_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_health_checks_database(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_api_health_database_down_returns_503(client: TestClient) -> None:
    class BrokenSession:
        def execute(self, *_args: object, **_kwargs: object) -> None:
            raise RuntimeError("db down")

    def broken_db() -> Iterator[BrokenSession]:
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json() == {"error": "DATABASE_UNAVAILABLE", "message": "Database is unavailable."}


def test_openapi_lists_every_module() -> None:
    paths = app.openapi()["paths"]
    expected = {
        "/health",
        "/api/v1/health",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
        "/api/v1/auth/change-password",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/business",
        "/api/v1/services",
        "/api/v1/services/{service_id}",
        "/api/v1/working-hours",
        "/api/v1/public/{slug}",
        "/api/v1/public/{slug}/services",
        "/api/v1/public/{slug}/slots",
        "/api/v1/public/{slug}/bookings",
        "/api/v1/appointments",
        "/api/v1/appointments/{appointment_id}",
        "/api/v1/customers",
        "/api/v1/customers/{customer_id}",
        "/api/v1/stats",
        "/api/v1/stats/summary",
        "/api/v1/billing",
        "/api/v1/billing/subscribe",
        "/api/v1/billing/verify",
        "/api/v1/billing/cancel",
        "/api/v1/billing/webhook",
    }
    assert expected <= set(paths)

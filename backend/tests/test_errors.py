"""Error body shape, security headers, CORS, config validation."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import DEFAULT_SECRET_KEY, Settings
from app.database import get_db
from app.main import app


def test_validation_error_shape(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert body["message"] == "Invalid input."
    fields = {d["field"] for d in body["details"]}
    assert {"body.email", "body.password"} <= fields
    assert all(set(d) == {"field", "message"} for d in body["details"])


def test_value_error_prefix_is_stripped(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Glow",
            "phone": "+919876543210",
            "full_name": "A",
            "email": "a@example.com",
            "password": "lettersonly",
        },
    )
    assert response.status_code == 422
    messages = [d["message"] for d in response.json()["details"]]
    assert "Password must contain at least one letter and one number." in messages


def test_unknown_route_404_shape(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {"error": "NOT_FOUND", "message": "Not found."}


def test_method_not_allowed_shape(client: TestClient) -> None:
    response = client.delete("/api/v1/health")
    assert response.status_code == 405
    assert response.json()["error"] == "METHOD_NOT_ALLOWED"


def test_security_headers_present(client: TestClient) -> None:
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    # Error responses carry them too.
    response = client.get("/nope")
    assert response.headers["x-frame-options"] == "DENY"


def test_cors_allows_configured_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_unauthenticated_has_www_authenticate(client: TestClient) -> None:
    response = client.get("/api/v1/business")
    assert response.status_code == 401
    assert response.json() == {"error": "UNAUTHORIZED", "message": "Not authenticated."}
    assert response.headers["www-authenticate"] == "Bearer"


def test_unhandled_error_returns_500_without_stack(session_factory: object) -> None:
    def exploding_db() -> Iterator[None]:
        raise RuntimeError("boom secret detail")
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = exploding_db
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/v1/health")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 500
    assert response.json() == {"error": "INTERNAL_ERROR", "message": "Something went wrong."}
    assert "boom" not in response.text


def test_settings_reject_default_secret_in_production() -> None:
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(ENVIRONMENT="Production", SECRET_KEY=DEFAULT_SECRET_KEY)
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(ENVIRONMENT="production", SECRET_KEY="short")
    ok = Settings(ENVIRONMENT="production", SECRET_KEY="x" * 40)
    assert ok.is_production


def test_settings_cors_parsing_and_billing_flag() -> None:
    assert Settings(CORS_ORIGINS="http://a.com/, http://b.com").CORS_ORIGINS == [
        "http://a.com",
        "http://b.com",
    ]
    assert Settings(CORS_ORIGINS='["http://c.com/"]').CORS_ORIGINS == ["http://c.com"]
    assert Settings(CORS_ORIGINS=["http://d.com"]).CORS_ORIGINS == ["http://d.com"]
    s = Settings(RAZORPAY_KEY_ID="k", RAZORPAY_KEY_SECRET="s", RAZORPAY_PLAN_ID="")
    assert s.billing_configured is False
    s = Settings(RAZORPAY_KEY_ID="k", RAZORPAY_KEY_SECRET="s", RAZORPAY_PLAN_ID="p")
    assert s.billing_configured is True

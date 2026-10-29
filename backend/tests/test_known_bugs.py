"""Regression tests for bugs found by the test agent (extreme dates, malformed signed webhooks).

Each used to return 500; they must now be rejected cleanly with 4xx.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.database import get_db
from app.main import app
from tests.conftest import override_db
from tests.factories import Tenant, booking_body, make_service


@pytest.fixture
def lenient_client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    """Client that returns 500 responses instead of re-raising server exceptions."""
    app.dependency_overrides[get_db] = override_db(session_factory)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.parametrize("start", ["0001-01-01T00:00:00+05:30", "9999-12-31T23:59:00-05:00"])
def test_public_booking_extreme_year_is_422(
    lenient_client: TestClient, db: Session, tenant: Tenant, start: str
) -> None:
    service = make_service(db, tenant.business)
    response = lenient_client.post("/api/v1/public/glow-salon/bookings", json=booking_body(service.id, start))
    assert response.status_code == 422


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/appointments?date=0001-01-01",
        "/api/v1/appointments?date=9999-12-31",
        "/api/v1/stats/summary?date=9999-12-31",
    ],
)
def test_owner_day_queries_extreme_dates_are_422(
    lenient_client: TestClient, tenant: Tenant, path: str
) -> None:
    assert lenient_client.get(path, headers=tenant.headers).status_code == 422


@pytest.mark.parametrize("month", ["9999-12", "0001-01"])
def test_month_stats_extreme_months_are_422(lenient_client: TestClient, tenant: Tenant, month: str) -> None:
    response = lenient_client.get("/api/v1/stats", headers=tenant.headers, params={"month": month})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "raw", [b'{"event": "subscription.activated", "payload": [1]}', b'{"event": "x", "payload": "s"}']
)
def test_webhook_non_dict_payload_is_handled(
    lenient_client: TestClient, monkeypatch: pytest.MonkeyPatch, raw: bytes
) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_test")
    signature = hmac.new(b"whsec_test", raw, hashlib.sha256).hexdigest()
    response = lenient_client.post(
        "/api/v1/billing/webhook", content=raw, headers={"X-Razorpay-Signature": signature}
    )
    assert response.status_code in (200, 400)

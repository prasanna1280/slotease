"""GET/PATCH /business."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Business
from tests.factories import Tenant

URL = "/api/v1/business"


def test_get_business(client: TestClient, tenant: Tenant) -> None:
    response = client.get(URL, headers=tenant.headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "id",
        "name",
        "slug",
        "phone",
        "email",
        "address",
        "timezone",
        "currency",
        "slot_interval_min",
        "booking_window_days",
        "min_notice_minutes",
        "plan",
        "subscription_status",
        "trial_ends_at",
        "current_period_end",
        "is_bookable",
        "is_suspended",
        "created_at",
    }
    assert body["name"] == "Glow Salon"
    assert body["currency"] == "INR"
    assert body["slot_interval_min"] == 15
    assert body["booking_window_days"] == 60
    assert body["min_notice_minutes"] == 60
    assert body["created_at"].endswith("+05:30")
    assert body["current_period_end"] is None


def test_patch_business_fields(client: TestClient, tenant: Tenant) -> None:
    response = client.patch(
        URL,
        headers=tenant.headers,
        json={
            "name": "  Glow Studio ",
            "slug": "Glow-Studio",
            "phone": "+1 (212) 555-0100",
            "email": "HI@Example.com",
            "address": " 12 MG Road ",
            "timezone": "America/New_York",
            "slot_interval_min": 30,
            "booking_window_days": 30,
            "min_notice_minutes": 0,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Glow Studio"
    assert body["slug"] == "glow-studio"
    assert body["phone"] == "+12125550100"
    assert body["email"] == "hi@example.com"
    assert body["address"] == "12 MG Road"
    assert body["timezone"] == "America/New_York"
    assert body["created_at"][-6:] in ("-04:00", "-05:00")
    assert (body["slot_interval_min"], body["booking_window_days"], body["min_notice_minutes"]) == (30, 30, 0)


def test_patch_business_clear_optional_fields(client: TestClient, tenant: Tenant) -> None:
    client.patch(URL, headers=tenant.headers, json={"email": "a@example.com", "address": "x"})
    response = client.patch(URL, headers=tenant.headers, json={"email": "", "address": "  "})
    assert response.status_code == 200
    assert response.json()["email"] is None
    assert response.json()["address"] is None


def test_patch_same_slug_is_noop(client: TestClient, tenant: Tenant) -> None:
    response = client.patch(URL, headers=tenant.headers, json={"slug": "glow-salon"})
    assert response.status_code == 200
    assert response.json()["slug"] == "glow-salon"


def test_patch_slug_taken_and_reserved(client: TestClient, tenant: Tenant, other_tenant: Tenant) -> None:
    taken = client.patch(URL, headers=tenant.headers, json={"slug": "other-clinic"})
    assert taken.status_code == 409
    assert taken.json()["error"] == "SLUG_TAKEN"
    reserved = client.patch(URL, headers=tenant.headers, json={"slug": "dashboard"})
    assert reserved.status_code == 422
    assert reserved.json()["error"] == "SLUG_RESERVED"


@pytest.mark.parametrize(
    "payload",
    [
        {"timezone": "Not/AZone"},
        {"slot_interval_min": 7},
        {"booking_window_days": 0},
        {"booking_window_days": 366},
        {"min_notice_minutes": -1},
        {"min_notice_minutes": 10081},
        {"name": None},
        {"slug": None},
        {"name": " a "},
        {"phone": "abc"},
        {"email": "bad"},
    ],
)
def test_patch_business_validation(client: TestClient, tenant: Tenant, payload: dict[str, object]) -> None:
    response = client.patch(URL, headers=tenant.headers, json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_is_bookable_rules(db: Session) -> None:
    now = datetime.now(UTC)
    future, past = now + timedelta(days=1), now - timedelta(days=1)
    cases = [
        ("active", None, None, True),
        ("trialing", future, None, True),
        ("trialing", past, None, False),
        ("trialing", None, None, False),
        ("past_due", None, future, True),
        ("past_due", None, past, False),
        ("cancelled", None, future, True),
        ("cancelled", None, None, False),
        ("expired", future, future, False),
    ]
    for status, trial_end, period_end, expected in cases:
        business = Business(
            name="x", slug="x", phone="1234567", subscription_status=status, trial_ends_at=trial_end
        )
        business.current_period_end = period_end
        assert business.is_bookable is expected, (status, trial_end, period_end)
    naive = Business(
        name="x",
        slug="x",
        phone="1234567",
        subscription_status="trialing",
        trial_ends_at=future.replace(tzinfo=None),
    )
    assert naive.is_bookable is True

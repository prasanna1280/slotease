"""DELETE /business: owner deletes the business and all of its data."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import ServiceUnavailableError
from app.models import (
    Appointment,
    Business,
    Customer,
    PaymentEvent,
    RefreshToken,
    Service,
    User,
    WorkingHours,
)
from app.services import razorpay_client
from tests.factories import DEFAULT_PASSWORD, Tenant, local, make_appointment, make_customer, make_service

URL = "/api/v1/business"


def delete_account(
    client: TestClient, tenant: Tenant, password: str = DEFAULT_PASSWORD, confirm: str = "glow-salon"
) -> Any:
    return client.request(
        "DELETE", URL, headers=tenant.headers, json={"password": password, "confirm": confirm}
    )


def count(db: Session, model: Any, business_id: int) -> int:
    db.expire_all()
    if model is Business:
        return db.scalar(select(func.count()).select_from(Business).where(Business.id == business_id)) or 0
    return db.scalar(select(func.count()).select_from(model).where(model.business_id == business_id)) or 0


def populate(client: TestClient, db: Session, tenant: Tenant) -> None:
    """Give the tenant one of everything: service, customer, appointment, session and payment event."""
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    make_appointment(db, tenant.business, service, customer, local(date(2026, 10, 9), "10:00"))
    db.add(
        PaymentEvent(
            business_id=tenant.business.id,
            provider="razorpay",
            event_id=f"evt_{tenant.business.id}",
            event_type="t",
            payload={},
        )
    )
    db.commit()
    login = client.post("/api/v1/auth/login", json={"email": tenant.user.email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 200


def test_owner_deletes_business_and_all_data(
    client: TestClient, db: Session, tenant: Tenant, other_tenant: Tenant
) -> None:
    populate(client, db, tenant)
    populate(client, db, other_tenant)
    bid, uid, email = tenant.business.id, tenant.user.id, tenant.user.email

    response = delete_account(client, tenant)
    assert response.status_code == 204
    assert response.content == b""

    for model in (Appointment, Customer, Service, WorkingHours, PaymentEvent, User, Business):
        assert count(db, model, bid) == 0, model.__name__
    assert db.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == uid)) == 0

    # The other business is untouched.
    for model in (Appointment, Customer, Service, PaymentEvent, User, Business):
        assert count(db, model, other_tenant.business.id) == 1, model.__name__
    assert count(db, WorkingHours, other_tenant.business.id) > 0

    # The old token no longer works, the booking page is gone and the email can register again.
    assert client.get("/api/v1/auth/me", headers=tenant.headers).status_code == 401
    assert client.get("/api/v1/public/glow-salon").status_code == 404
    login = client.post("/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 401


def test_wrong_password_keeps_everything(client: TestClient, db: Session, tenant: Tenant) -> None:
    response = delete_account(client, tenant, password="not-my-password")
    assert response.status_code == 400
    assert response.json() == {"error": "INVALID_PASSWORD", "message": "Password is incorrect."}
    assert count(db, Business, tenant.business.id) == 1


@pytest.mark.parametrize("confirm", ["glow", "other-clinic", "Glow Salon"])
def test_confirmation_must_match_slug(client: TestClient, db: Session, tenant: Tenant, confirm: str) -> None:
    response = delete_account(client, tenant, confirm=confirm)
    assert response.status_code == 400
    assert response.json()["error"] == "CONFIRMATION_MISMATCH"
    assert count(db, Business, tenant.business.id) == 1


def test_confirmation_ignores_case_and_spaces(client: TestClient, tenant: Tenant) -> None:
    assert delete_account(client, tenant, confirm="  Glow-Salon ").status_code == 204


def test_staff_cannot_delete(client: TestClient, db: Session, tenant: Tenant) -> None:
    tenant.user.role = "staff"
    db.commit()
    response = delete_account(client, tenant)
    assert response.status_code == 403
    assert count(db, Business, tenant.business.id) == 1


def test_requires_authentication_and_body(client: TestClient, tenant: Tenant) -> None:
    assert client.request("DELETE", URL, json={"password": "x", "confirm": "glow-salon"}).status_code == 401
    assert client.request("DELETE", URL, headers=tenant.headers, json={}).status_code == 422


@pytest.fixture
def billing(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, bool]]:
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_test_key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "secret")
    monkeypatch.setattr(settings, "RAZORPAY_PLAN_ID", "plan_test")
    calls: list[tuple[str, bool]] = []

    def fake_cancel(sub_id: str, cancel_at_cycle_end: bool = True) -> dict[str, Any]:
        calls.append((sub_id, cancel_at_cycle_end))
        return {"id": sub_id, "status": "cancelled"}

    monkeypatch.setattr(razorpay_client, "cancel_subscription", fake_cancel)
    return calls


@pytest.mark.parametrize("status", ["active", "past_due"])
def test_live_subscription_is_cancelled_immediately(
    client: TestClient, db: Session, tenant: Tenant, billing: list[tuple[str, bool]], status: str
) -> None:
    tenant.business.subscription_status = status
    tenant.business.razorpay_subscription_id = "sub_live"
    db.commit()
    assert delete_account(client, tenant).status_code == 204
    assert billing == [("sub_live", False)]


def test_ended_subscription_is_not_cancelled_again(
    client: TestClient, db: Session, tenant: Tenant, billing: list[tuple[str, bool]]
) -> None:
    tenant.business.subscription_status = "cancelled"
    tenant.business.razorpay_subscription_id = "sub_old"
    db.commit()
    assert delete_account(client, tenant).status_code == 204
    assert billing == []


def test_razorpay_failure_aborts_deletion(
    client: TestClient,
    db: Session,
    tenant: Tenant,
    billing: list[tuple[str, bool]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant.business.subscription_status = "active"
    tenant.business.razorpay_subscription_id = "sub_live"
    db.commit()

    def boom(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise ServiceUnavailableError("Payment provider unavailable.", code="PAYMENT_PROVIDER_ERROR")

    monkeypatch.setattr(razorpay_client, "cancel_subscription", boom)
    response = delete_account(client, tenant)
    assert response.status_code == 503
    assert response.json()["error"] == "PAYMENT_PROVIDER_ERROR"
    assert count(db, Business, tenant.business.id) == 1


def test_live_subscription_without_billing_config_still_deletes(
    client: TestClient, db: Session, tenant: Tenant
) -> None:
    tenant.business.subscription_status = "active"
    tenant.business.razorpay_subscription_id = "sub_live"
    db.commit()
    assert delete_account(client, tenant).status_code == 204
    assert count(db, Business, tenant.business.id) == 0

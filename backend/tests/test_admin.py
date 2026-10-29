"""Platform admin: 2FA sign-in, reports, business management, bookings, payments, audit log, CLI."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import cli
from app.auth import totp
from app.auth.security import create_admin_token, hash_password
from app.config import settings
from app.models import AdminAuditLog, AdminUser, Appointment, Business, Payment, RefreshToken
from app.services import admin_reports, admin_service
from tests.factories import Tenant, local, make_appointment, make_customer, make_service, make_tenant

ADMIN_EMAIL = "ops@slotease-admin.example.com"
ADMIN_PASSWORD = "Admin-Passw0rd-2026"
NOW = datetime(2026, 10, 29, 6, 0, tzinfo=UTC)  # 11:30 IST, Thu 29 Oct 2026


@dataclass
class Admin:
    user: AdminUser
    secret: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_admin_token(self.user.id, self.user.session_version)}"}


def make_admin(db: Session, *, enrolled: bool = True, email: str = ADMIN_EMAIL) -> Admin:
    secret = totp.generate_secret()
    user = AdminUser(
        email=email,
        full_name="Ops Admin",
        password_hash=hash_password(ADMIN_PASSWORD),
        totp_secret=secret if enrolled else None,
    )
    db.add(user)
    db.commit()
    return Admin(user=user, secret=secret)


@pytest.fixture
def admin(db: Session) -> Admin:
    return make_admin(db)


@pytest.fixture
def at_now(monkeypatch: pytest.MonkeyPatch) -> Callable[[datetime], None]:
    """Pin the admin modules' clock (they are not part of the suite-wide freeze)."""

    def set_now(value: datetime) -> None:
        monkeypatch.setattr(admin_service, "now_utc", lambda: value)
        monkeypatch.setattr(admin_reports, "now_utc", lambda: value)

    set_now(NOW)
    return set_now


def pay(
    db: Session, business: Business | None, amount: str, paid_at: datetime, source: str = "razorpay"
) -> Payment:
    payment = Payment(
        business_id=business.id if business else None,
        business_name=business.name if business else "Gone Ltd",
        source=source,
        amount=Decimal(amount),
        paid_at=paid_at,
    )
    db.add(payment)
    db.commit()
    return payment


def audit_actions(db: Session) -> list[str]:
    db.expire_all()
    return list(db.scalars(select(AdminAuditLog.action).order_by(AdminAuditLog.id)).all())


# --------------------------------------------------------------------------- TOTP


def test_totp_matches_rfc_6238_vectors() -> None:
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert totp.code_at(secret, 59 // 30) == "287082"
    assert totp.code_at(secret, 1111111109 // 30) == "081804"
    assert totp.code_at(secret, 20000000000 // 30) == "353130"


def test_totp_verify_drift_replay_and_format() -> None:
    secret = totp.generate_secret()
    now = 1_800_000_000.0
    step = totp.current_step(now)
    assert totp.verify(secret, totp.code_at(secret, step), now=now) == step
    assert totp.verify(secret, totp.code_at(secret, step - 1), now=now) == step - 1
    assert totp.verify(secret, totp.code_at(secret, step - 2), now=now) is None
    assert totp.verify(secret, totp.code_at(secret, step), last_step=step, now=now) is None
    code = totp.code_at(secret, step)
    assert totp.verify(secret, f"{code[:3]} {code[3:]}", now=now) == step
    assert totp.verify(secret, "12345", now=now) is None
    assert totp.verify(secret, "abcdef", now=now) is None
    uri = totp.provisioning_uri(secret, "a@b.c")
    assert uri.startswith("otpauth://totp/SlotEase%20Admin%3Aa%40b.c?") and f"secret={secret}" in uri


# --------------------------------------------------------------------------- sign-in


def login(client: TestClient, password: str = ADMIN_PASSWORD, email: str = ADMIN_EMAIL) -> Any:
    return client.post("/api/v1/admin/auth/login", json={"email": email, "password": password})


def verify(client: TestClient, challenge: str, code: str) -> Any:
    return client.post("/api/v1/admin/auth/verify", json={"challenge_token": challenge, "code": code})


def test_first_sign_in_enrols_2fa_then_requires_codes(client: TestClient, db: Session) -> None:
    make_admin(db, enrolled=False)
    first = login(client)
    assert first.status_code == 200
    body = first.json()
    assert body["step"] == "setup" and body["secret"] and body["otpauth_uri"].startswith("otpauth://totp/")
    secret = body["secret"]

    assert verify(client, body["challenge_token"], "000000").json()["error"] == "INVALID_CODE"
    session = verify(client, body["challenge_token"], totp.code_at(secret, totp.current_step()))
    assert session.status_code == 200
    token = session.json()["access_token"]
    assert session.json()["admin"]["email"] == ADMIN_EMAIL
    assert session.json()["expires_in"] == settings.ADMIN_TOKEN_EXPIRE_MINUTES * 60
    me = client.get("/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200

    # The setup challenge cannot be reused, and later sign-ins ask for a code only.
    assert (
        verify(client, body["challenge_token"], totp.code_at(secret, totp.current_step())).status_code == 401
    )
    second = login(client).json()
    assert second == {
        "step": "totp",
        "challenge_token": second["challenge_token"],
        "secret": None,
        "otpauth_uri": None,
    }
    # The code used at enrolment cannot be replayed.
    replay = verify(client, second["challenge_token"], totp.code_at(secret, totp.current_step()))
    assert replay.status_code == 401
    assert audit_actions(db) == ["admin.2fa_enrolled", "admin.sign_in"]


def test_sign_in_with_code(client: TestClient, db: Session, admin: Admin) -> None:
    challenge = login(client).json()["challenge_token"]
    response = verify(client, challenge, totp.code_at(admin.secret, totp.current_step()))
    assert response.status_code == 200
    db.expire_all()
    assert db.get(AdminUser, admin.user.id).last_login_at is not None  # type: ignore[union-attr]


@pytest.mark.parametrize(
    ("email", "password"), [(ADMIN_EMAIL, "wrong-password"), ("nobody@example.com", ADMIN_PASSWORD)]
)
def test_bad_credentials(client: TestClient, admin: Admin, email: str, password: str) -> None:
    response = login(client, password=password, email=email)
    assert response.status_code == 401
    assert response.json() == {"error": "INVALID_CREDENTIALS", "message": "Invalid email or password."}


def test_inactive_admin_cannot_sign_in(client: TestClient, db: Session, admin: Admin) -> None:
    admin.user.is_active = False
    db.commit()
    assert login(client).status_code == 401
    assert client.get("/api/v1/admin/overview", headers=admin.headers).status_code == 401


def test_tokens_do_not_cross_between_owner_and_admin(
    client: TestClient, admin: Admin, tenant: Tenant
) -> None:
    assert client.get("/api/v1/admin/overview", headers=tenant.headers).status_code == 401
    assert client.get("/api/v1/business", headers=admin.headers).status_code == 401
    assert client.get("/api/v1/admin/overview").status_code == 401
    challenge = login(client).json()["challenge_token"]
    assert (
        client.get("/api/v1/admin/overview", headers={"Authorization": f"Bearer {challenge}"}).status_code
        == 401
    )


def test_session_version_bump_signs_admin_out(client: TestClient, db: Session, admin: Admin) -> None:
    headers = admin.headers
    assert client.get("/api/v1/admin/auth/me", headers=headers).status_code == 200
    admin.user.session_version += 1
    db.commit()
    assert client.get("/api/v1/admin/auth/me", headers=headers).status_code == 401


def test_admin_login_is_rate_limited(client: TestClient, admin: Admin) -> None:
    from app.rate_limit import limiter

    limiter.enabled = True
    try:
        statuses = [login(client, password="bad").status_code for _ in range(6)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert statuses == [401] * 5 + [429]


# --------------------------------------------------------------------------- reports


def test_period_helpers_calendar_and_fiscal() -> None:
    def label(day: date, granularity: str, basis: str) -> tuple[str, date, date]:
        p = admin_reports.period_for_index(
            admin_reports.period_index(day, granularity, basis), granularity, basis
        )
        return p.label, p.start, p.end

    day = date(2026, 2, 14)
    assert label(day, "month", "calendar") == ("Feb 2026", date(2026, 2, 1), date(2026, 2, 28))
    assert label(day, "quarter", "calendar") == ("Q1 2026", date(2026, 1, 1), date(2026, 3, 31))
    assert label(day, "quarter", "fiscal") == ("Q4 FY25-26", date(2026, 1, 1), date(2026, 3, 31))
    assert label(day, "half_year", "calendar") == ("H1 2026", date(2026, 1, 1), date(2026, 6, 30))
    assert label(day, "half_year", "fiscal") == ("H2 FY25-26", date(2025, 10, 1), date(2026, 3, 31))
    assert label(day, "year", "calendar") == ("2026", date(2026, 1, 1), date(2026, 12, 31))
    assert label(day, "year", "fiscal") == ("FY25-26", date(2025, 4, 1), date(2026, 3, 31))
    assert label(date(2026, 4, 1), "quarter", "fiscal") == ("Q1 FY26-27", date(2026, 4, 1), date(2026, 6, 30))
    assert label(date(2026, 12, 31), "month", "fiscal") == ("Dec 2026", date(2026, 12, 1), date(2026, 12, 31))


def test_revenue_by_month_quarter_and_fiscal_year(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant, other_tenant: Tenant, at_now: Any
) -> None:
    pay(db, tenant.business, "499.00", datetime(2026, 9, 10, 5, tzinfo=UTC))
    pay(db, tenant.business, "499.00", datetime(2026, 10, 10, 5, tzinfo=UTC))
    pay(db, other_tenant.business, "1000.00", datetime(2026, 10, 20, 5, tzinfo=UTC), source="manual")
    # 31 Mar 2026 20:00 UTC is 1 Apr 01:30 IST: belongs to April / the new financial year.
    pay(db, other_tenant.business, "100.00", datetime(2026, 3, 31, 20, tzinfo=UTC))

    month = client.get("/api/v1/admin/reports/revenue", headers=admin.headers).json()
    assert month["granularity"] == "month" and len(month["periods"]) == 12
    assert month["periods"][-1]["label"] == "Oct 2026"
    oct_, sep = month["periods"][-1], month["periods"][-2]
    assert (oct_["revenue"], oct_["payments"], oct_["paying_businesses"]) == ("1499.00", 2, 2)
    assert oct_["new_paying_businesses"] == 0  # both businesses first paid earlier
    assert sep["revenue"] == "499.00" and sep["new_paying_businesses"] == 1
    assert oct_["change_pct"] == pytest.approx(200.4)
    april = next(p for p in month["periods"] if p["label"] == "Apr 2026")
    assert april["revenue"] == "100.00" and april["new_paying_businesses"] == 1
    assert month["total_revenue"] == "2098.00"

    quarter = client.get(
        "/api/v1/admin/reports/revenue", params={"granularity": "quarter"}, headers=admin.headers
    ).json()
    assert [p["label"] for p in quarter["periods"][-2:]] == ["Q3 2026", "Q4 2026"]
    assert quarter["periods"][-1]["revenue"] == "1499.00"

    fiscal = client.get(
        "/api/v1/admin/reports/revenue",
        params={"granularity": "year", "basis": "fiscal"},
        headers=admin.headers,
    ).json()
    assert fiscal["periods"][-1]["label"] == "FY26-27"
    assert fiscal["periods"][-1]["revenue"] == "2098.00"
    assert len(fiscal["periods"]) == 5

    half = client.get(
        "/api/v1/admin/reports/revenue", params={"granularity": "half_year"}, headers=admin.headers
    ).json()
    assert half["periods"][-1]["label"] == "H2 2026" and half["periods"][-1]["revenue"] == "1998.00"
    assert (
        client.get(
            "/api/v1/admin/reports/revenue", params={"granularity": "week"}, headers=admin.headers
        ).status_code
        == 422
    )


def test_overview(client: TestClient, db: Session, admin: Admin, tenant: Tenant, at_now: Any) -> None:
    active = make_tenant(db, name="Active Clinic", slug="active-clinic", phone="+919811111112")
    active.business.subscription_status = "active"
    active.business.plan = "pro"
    expired = make_tenant(db, name="Old Trial", slug="old-trial", phone="+919811111113")
    expired.business.trial_ends_at = NOW - timedelta(days=3)
    suspended = make_tenant(db, name="Paused", slug="paused", phone="+919811111114")
    suspended.business.is_suspended = True
    db.commit()
    pay(db, active.business, "499.00", NOW - timedelta(days=1))
    pay(db, active.business, "499.00", datetime(2026, 9, 1, 5, tzinfo=UTC))
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    make_appointment(db, tenant.business, service, customer, local(date(2026, 11, 2), "10:00"))

    body = client.get("/api/v1/admin/overview", headers=admin.headers).json()
    assert body["businesses_total"] == 4
    assert body["status_counts"] == {
        "trialing": 1,
        "trial_expired": 1,
        "active": 1,
        "past_due": 0,
        "cancelled": 0,
        "expired": 0,
        "suspended": 1,
    }
    assert body["paying_businesses"] == 1
    assert (body["mrr"], body["arr"]) == ("499.00", "5988.00")
    assert body["revenue_this_month"] == "499.00"
    assert body["revenue_last_month"] == "499.00"
    assert body["revenue_this_quarter"] == "499.00"
    assert body["revenue_lifetime"] == "998.00"
    assert body["trial_conversion_rate"] == 0.0  # the only finished trial never paid
    assert body["bookings_total"] == 1 and body["end_customers_total"] == 1
    assert len(body["signups_by_month"]) == 12 and body["signups_by_month"][-1]["month"] == "2026-10"
    assert len(body["recent_businesses"]) == 4
    assert body["recent_payments"][0]["amount"] == "499.00"


def test_subscriptions_lists(client: TestClient, db: Session, admin: Admin, at_now: Any) -> None:
    ending = make_tenant(db, name="Ending", slug="ending", phone="+919811111115")
    ending.business.trial_ends_at = NOW + timedelta(days=2)
    renewing = make_tenant(db, name="Renewing", slug="renewing", phone="+919811111116")
    renewing.business.subscription_status = "active"
    renewing.business.current_period_end = NOW + timedelta(days=3)
    late = make_tenant(db, name="Late", slug="late", phone="+919811111117")
    late.business.subscription_status = "past_due"
    gone = make_tenant(db, name="Gone", slug="gone-biz", phone="+919811111118")
    gone.business.subscription_status = "cancelled"
    make_tenant(db, name="Far Trial", slug="far-trial", phone="+919811111119")  # trial ends in 14 real days
    db.commit()

    body = client.get("/api/v1/admin/subscriptions", headers=admin.headers).json()
    assert [b["slug"] for b in body["trials_ending_soon"]] == ["ending"]
    assert [b["slug"] for b in body["renewals_due"]] == ["renewing"]
    assert [b["slug"] for b in body["past_due"]] == ["late"]
    assert [b["slug"] for b in body["recently_cancelled"]] == ["gone-biz"]
    assert body["mrr"] == "499.00"


# --------------------------------------------------------------------------- businesses


def test_list_search_filter_and_paginate(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant, other_tenant: Tenant
) -> None:
    url = "/api/v1/admin/businesses"
    body = client.get(url, headers=admin.headers).json()
    assert body["total"] == 2
    row = next(r for r in body["items"] if r["slug"] == "glow-salon")
    assert row["owner_email"] == tenant.user.email and row["status"] == "trialing"
    assert row["revenue_total"] == "0.00" and row["appointments_count"] == 0

    for q in ("glow", "GLOW-SAL", tenant.user.email.upper(), "9876543210"):
        found = client.get(url, params={"q": q}, headers=admin.headers).json()
        assert [r["slug"] for r in found["items"]] == ["glow-salon"], q
    assert client.get(url, params={"q": "%"}, headers=admin.headers).json()["total"] == 0

    other_tenant.business.is_suspended = True
    db.commit()
    suspended = client.get(url, params={"status": "suspended"}, headers=admin.headers).json()
    assert [r["slug"] for r in suspended["items"]] == ["other-clinic"]
    page = client.get(url, params={"page_size": 1, "page": 2, "sort": "name"}, headers=admin.headers).json()
    assert page["total"] == 2 and [r["slug"] for r in page["items"]] == ["other-clinic"]
    assert client.get(url, params={"status": "nope"}, headers=admin.headers).status_code == 422


def test_business_detail(client: TestClient, db: Session, admin: Admin, tenant: Tenant) -> None:
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    make_appointment(
        db, tenant.business, service, customer, local(date(2026, 10, 9), "10:00"), status="no_show"
    )
    pay(db, tenant.business, "499.00", NOW)
    client.post("/api/v1/auth/login", json={"email": tenant.user.email, "password": "Passw0rd123"})

    body = client.get(f"/api/v1/admin/businesses/{tenant.business.id}", headers=admin.headers).json()
    assert body["slug"] == "glow-salon" and body["is_bookable"] is True
    assert body["owners"][0]["email"] == tenant.user.email and body["owners"][0]["active_sessions"] == 1
    assert body["stats"]["no_shows"] == 1 and body["stats"]["revenue_total"] == "499.00"
    assert body["recent_appointments"][0]["start_time"].endswith("+05:30")
    assert body["payments"][0]["amount"] == "499.00"
    assert client.get("/api/v1/admin/businesses/999", headers=admin.headers).status_code == 404


def test_suspend_blocks_public_booking_and_is_audited(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant
) -> None:
    url = f"/api/v1/admin/businesses/{tenant.business.id}"
    response = client.patch(url, json={"is_suspended": True}, headers=admin.headers)
    assert response.status_code == 200 and response.json()["status"] == "suspended"
    assert client.get("/api/v1/public/glow-salon").json()["is_bookable"] is False
    service = make_service(db, tenant.business)
    booking = client.post(
        "/api/v1/public/glow-salon/bookings",
        json={
            "service_id": service.id,
            "start_time": "2026-10-09T10:00:00+05:30",
            "customer_name": "A",
            "customer_phone": "9876500001",
        },
    )
    assert booking.status_code == 403 and booking.json()["error"] == "BUSINESS_INACTIVE"

    client.patch(url, json={"is_suspended": False}, headers=admin.headers)
    assert client.get("/api/v1/public/glow-salon").json()["is_bookable"] is True
    entries = client.get("/api/v1/admin/audit", headers=admin.headers).json()["items"]
    assert [e["action"] for e in entries] == ["business.unsuspended", "business.suspended"]
    assert entries[1]["details"] == {"is_suspended": {"from": False, "to": True}}
    assert entries[1]["admin_email"] == ADMIN_EMAIL


def test_update_business_fields(client: TestClient, db: Session, admin: Admin, tenant: Tenant) -> None:
    url = f"/api/v1/admin/businesses/{tenant.business.id}"
    end = "2026-12-31T23:59:00+05:30"
    response = client.patch(
        url,
        json={
            "name": "Glow Salon & Spa",
            "phone": "98765 00000",
            "plan": "pro",
            "subscription_status": "active",
            "current_period_end": end,
        },
        headers=admin.headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["phone"], body["status"]) == ("Glow Salon & Spa", "9876500000", "active")
    entry = client.get("/api/v1/admin/audit", headers=admin.headers).json()["items"][0]
    assert entry["action"] == "business.updated"
    assert set(entry["details"]) == {"name", "phone", "plan", "subscription_status", "current_period_end"}

    # Saving the same values again changes nothing and logs nothing.
    client.patch(url, json={"name": "Glow Salon & Spa"}, headers=admin.headers)
    assert client.get("/api/v1/admin/audit", headers=admin.headers).json()["total"] == 1
    for bad in (
        {"subscription_status": "free"},
        {"plan": "gold"},
        {"name": None},
        {"trial_ends_at": "2026-12-01T00:00:00"},
    ):
        assert client.patch(url, json=bad, headers=admin.headers).status_code in (400, 422), bad


def test_extend_trial(client: TestClient, db: Session, admin: Admin, tenant: Tenant, at_now: Any) -> None:
    tenant.business.trial_ends_at = NOW - timedelta(days=5)
    tenant.business.subscription_status = "expired"
    db.commit()
    url = f"/api/v1/admin/businesses/{tenant.business.id}/extend-trial"
    body = client.post(url, json={"days": 7}, headers=admin.headers).json()
    assert body["subscription_status"] == "trialing"
    assert datetime.fromisoformat(body["trial_ends_at"]) == NOW + timedelta(days=7)
    # Extending a running trial adds to its current end.
    body = client.post(url, json={"days": 3}, headers=admin.headers).json()
    assert datetime.fromisoformat(body["trial_ends_at"]) == NOW + timedelta(days=10)
    assert client.post(url, json={"days": 0}, headers=admin.headers).status_code == 422
    assert audit_actions(db) == ["business.trial_extended", "business.trial_extended"]


def test_manual_payments(client: TestClient, db: Session, admin: Admin, tenant: Tenant) -> None:
    url = f"/api/v1/admin/businesses/{tenant.business.id}/payments"
    created = client.post(
        url,
        json={"amount": "1497", "paid_at": "2026-10-01T12:00:00+05:30", "note": "UPI for 3 months"},
        headers=admin.headers,
    )
    assert created.status_code == 201
    payment = created.json()
    assert (payment["amount"], payment["source"], payment["business_name"]) == (
        "1497.00",
        "manual",
        "Glow Salon",
    )

    listing = client.get(
        "/api/v1/admin/payments", params={"from": "2026-10-01", "to": "2026-10-01"}, headers=admin.headers
    )
    assert listing.json()["total"] == 1 and listing.json()["total_amount"] == "1497.00"
    assert (
        client.get("/api/v1/admin/payments", params={"from": "2026-10-02"}, headers=admin.headers).json()[
            "total"
        ]
        == 0
    )
    for bad in ({"amount": "0"}, {"amount": "-5"}, {"amount": "10.123"}):
        assert client.post(url, json=bad, headers=admin.headers).status_code == 422, bad

    razorpay = pay(db, tenant.business, "499.00", NOW)
    assert (
        client.delete(f"/api/v1/admin/payments/{razorpay.id}", headers=admin.headers).json()["error"]
        == "PAYMENT_NOT_MANUAL"
    )
    assert client.delete(f"/api/v1/admin/payments/{payment['id']}", headers=admin.headers).status_code == 204
    assert client.delete("/api/v1/admin/payments/9999", headers=admin.headers).status_code == 404
    assert audit_actions(db) == ["payment.recorded", "payment.removed"]


def test_owner_reset_link_and_sign_out(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant, other_tenant: Tenant, outbox: Any
) -> None:
    client.post("/api/v1/auth/login", json={"email": tenant.user.email, "password": "Passw0rd123"})
    base = f"/api/v1/admin/businesses/{tenant.business.id}/users/{tenant.user.id}"

    link = client.post(f"{base}/reset-link", headers=admin.headers)
    assert link.status_code == 200
    url = link.json()["reset_url"]
    assert "/reset-password?token=" in url
    assert outbox.emails[-1]["to"] == tenant.user.email
    token = url.split("token=", 1)[1]
    reset = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "N3w-passw0rd"})
    assert reset.status_code == 204

    client.post("/api/v1/auth/login", json={"email": tenant.user.email, "password": "N3w-passw0rd"})
    assert client.post(f"{base}/sign-out", headers=admin.headers).status_code == 204
    db.expire_all()
    live = db.scalar(
        select(func.count(RefreshToken.id)).where(
            RefreshToken.user_id == tenant.user.id, RefreshToken.revoked_at.is_(None)
        )
    )
    assert live == 0
    # A user of another business cannot be reached through this business.
    wrong = f"/api/v1/admin/businesses/{tenant.business.id}/users/{other_tenant.user.id}/sign-out"
    assert client.post(wrong, headers=admin.headers).status_code == 404
    assert audit_actions(db) == ["owner.reset_link", "owner.signed_out"]


def test_admin_deletes_business_keeping_revenue_and_audit(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant
) -> None:
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    make_appointment(db, tenant.business, service, customer, local(date(2026, 10, 9), "10:00"))
    payment = pay(db, tenant.business, "499.00", NOW)
    url = f"/api/v1/admin/businesses/{tenant.business.id}"
    client.patch(url, json={"is_suspended": True}, headers=admin.headers)

    mismatch = client.request("DELETE", url, json={"confirm": "glow"}, headers=admin.headers)
    assert mismatch.status_code == 400 and mismatch.json()["error"] == "CONFIRMATION_MISMATCH"
    assert (
        client.request("DELETE", url, json={"confirm": "glow-salon"}, headers=admin.headers).status_code
        == 204
    )

    db.expire_all()
    assert db.scalar(select(func.count(Business.id))) == 0
    assert db.scalar(select(func.count(Appointment.id))) == 0
    kept = db.get(Payment, payment.id)
    assert kept is not None and kept.business_id is None and kept.business_name == "Glow Salon"
    entries = client.get("/api/v1/admin/audit", headers=admin.headers).json()["items"]
    assert [e["action"] for e in entries] == ["business.deleted", "business.suspended"]
    assert entries[0]["details"] == {"name": "Glow Salon", "slug": "glow-salon"}
    assert all(e["business_id"] is None for e in entries)
    assert (
        client.get("/api/v1/admin/reports/revenue", headers=admin.headers).json()["total_revenue"] == "499.00"
    )


# --------------------------------------------------------------------------- bookings


def test_search_and_update_bookings(
    client: TestClient, db: Session, admin: Admin, tenant: Tenant, other_tenant: Tenant
) -> None:
    service = make_service(db, tenant.business)
    karthik = make_customer(db, tenant.business, name="Karthik S", phone="+919800000001")
    first = make_appointment(db, tenant.business, service, karthik, local(date(2026, 10, 9), "10:00"))
    other_service = make_service(db, other_tenant.business)
    priya = make_customer(db, other_tenant.business, name="Priya R", phone="+919811122233")
    make_appointment(db, other_tenant.business, other_service, priya, local(date(2026, 10, 9), "11:00"))

    url = "/api/v1/admin/appointments"
    assert len(client.get(url, headers=admin.headers).json()) == 2
    by_ref = client.get(url, params={"q": first.reference}, headers=admin.headers).json()
    assert [a["id"] for a in by_ref] == [first.id]
    assert (
        by_ref[0]["business_name"] == "Glow Salon" and by_ref[0]["start_time"] == "2026-10-09T10:00:00+05:30"
    )
    by_phone = client.get(url, params={"q": "98111 22233"}, headers=admin.headers).json()
    assert [a["customer_name"] for a in by_phone] == ["Priya R"]
    by_name = client.get(url, params={"q": "karth"}, headers=admin.headers).json()
    assert [a["id"] for a in by_name] == [first.id]

    patched = client.patch(f"{url}/{first.id}", json={"status": "cancelled"}, headers=admin.headers)
    assert patched.status_code == 200 and patched.json()["status"] == "cancelled"
    assert (
        client.patch(f"{url}/{first.id}", json={"status": "gone"}, headers=admin.headers).status_code == 422
    )
    assert client.patch(f"{url}/999", json={"status": "booked"}, headers=admin.headers).status_code == 404
    cancelled = client.get(url, params={"status": "cancelled"}, headers=admin.headers).json()
    assert [a["id"] for a in cancelled] == [first.id]

    # Re-activating a cancelled booking whose slot was taken meanwhile -> 409.
    make_appointment(
        db,
        tenant.business,
        service,
        make_customer(db, tenant.business, phone="+919800000002"),
        local(date(2026, 10, 9), "10:00"),
    )
    conflict = client.patch(f"{url}/{first.id}", json={"status": "booked"}, headers=admin.headers)
    assert conflict.status_code == 409 and conflict.json()["error"] == "SLOT_TAKEN"
    assert audit_actions(db) == ["appointment.status_changed"]


# --------------------------------------------------------------------------- Razorpay charges -> payments


def test_subscription_charged_webhook_records_one_payment(
    client: TestClient, db: Session, tenant: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_test")
    tenant.business.razorpay_subscription_id = "sub_1"
    db.commit()

    def send(event_id: str, payment: dict[str, Any] | None) -> int:
        payload: dict[str, Any] = {"subscription": {"entity": {"id": "sub_1", "current_end": 1_893_456_000}}}
        if payment is not None:
            payload["payment"] = {"entity": payment}
        raw = json.dumps({"event": "subscription.charged", "payload": payload}).encode()
        signature = hmac.new(b"whsec_test", raw, hashlib.sha256).hexdigest()
        headers = {
            "X-Razorpay-Signature": signature,
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        }
        return client.post("/api/v1/billing/webhook", content=raw, headers=headers).status_code

    charge = {"id": "pay_1", "amount": 49900, "currency": "INR", "created_at": 1_793_000_000}
    assert send("evt_1", charge) == 200
    assert send("evt_2", charge) == 200  # same payment in another event: recorded once
    assert send("evt_3", {"id": "pay_2", "amount": "bad"}) == 200
    assert send("evt_4", None) == 200
    db.expire_all()
    payments = db.scalars(select(Payment)).all()
    assert len(payments) == 1
    p = payments[0]
    assert (p.amount, p.source, p.provider_payment_id, p.provider_subscription_id) == (
        Decimal("499.00"),
        "razorpay",
        "pay_1",
        "sub_1",
    )
    assert p.paid_at == datetime.fromtimestamp(1_793_000_000, tz=UTC)


# --------------------------------------------------------------------------- CLI


def test_cli_create_reset_deactivate(
    db: Session, session_factory: Any, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import io

    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    monkeypatch.setattr("sys.stdin", io.StringIO("Very-strong-pass-1\n"))
    assert (
        cli.main(["create-admin", "--email", "Boss@Example.com", "--name", "Boss", "--password-stdin"]) == 0
    )
    assert "Created admin boss@example.com" in capsys.readouterr().out

    monkeypatch.setattr("sys.stdin", io.StringIO("Very-strong-pass-1\n"))
    assert (
        cli.main(["create-admin", "--email", "boss@example.com", "--name", "Boss", "--password-stdin"]) == 1
    )
    monkeypatch.setattr("sys.stdin", io.StringIO("short\n"))
    assert cli.main(["create-admin", "--email", "x@example.com", "--name", "X", "--password-stdin"]) == 1
    assert "at least 12" in capsys.readouterr().err

    db.expire_all()
    admin = db.scalars(select(AdminUser).where(AdminUser.email == "boss@example.com")).one()
    admin.totp_secret = "JBSWY3DPEHPK3PXP"
    db.commit()
    assert cli.main(["reset-admin", "--email", "boss@example.com", "--2fa"]) == 0
    db.expire_all()
    admin = db.scalars(select(AdminUser).where(AdminUser.email == "boss@example.com")).one()
    assert admin.totp_secret is None and admin.session_version == 2
    assert cli.main(["reset-admin", "--email", "boss@example.com"]) == 1
    assert cli.main(["deactivate-admin", "--email", "boss@example.com"]) == 0
    assert cli.main(["deactivate-admin", "--email", "nobody@example.com"]) == 1
    capsys.readouterr()
    assert cli.main(["list-admins"]) == 0
    assert "boss@example.com\tBoss\tdeactivated\t2FA not set up" in capsys.readouterr().out

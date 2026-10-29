"""Notifications: provider selection (Resend / SMTP / console), booking + reset e-mails, escaping."""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import User
from app.services import email_templates, notification_service
from tests.conftest import REAL_SEND_BOOKING_CONFIRMATION, REAL_SEND_EMAIL, Outbox
from tests.factories import (
    Tenant,
    booking_body,
    local,
    make_appointment,
    make_customer,
    make_service,
    make_tenant,
)

SATURDAY = date(2026, 10, 10)


@pytest.fixture
def real_confirmation(monkeypatch: pytest.MonkeyPatch, session_factory: sessionmaker[Session]) -> None:
    """Run the real ``send_booking_confirmation`` against the test DB (e-mails still go to the outbox)."""
    monkeypatch.setattr(notification_service, "SessionLocal", session_factory)
    monkeypatch.setattr(notification_service, "send_booking_confirmation", REAL_SEND_BOOKING_CONFIRMATION)


# --------------------------------------------------------------------------- booking confirmation


def test_booking_confirmation_content_and_escaping(
    db: Session, real_confirmation: None, outbox: Outbox
) -> None:
    tenant = make_tenant(
        db,
        name="Glow & <Co>",
        slug="glow-co",
        address="12 <MG> Road",
        email="owner@example.com",
        hours=[(5, "09:00", "20:00")],
    )
    service = make_service(db, tenant.business, name="Cut <b>Pro</b>", duration_min=45, price="450")
    customer = make_customer(db, tenant.business, name="<script>alert(1)</script>", email="cust@example.com")
    appt = make_appointment(
        db,
        tenant.business,
        service,
        customer,
        local(SATURDAY, "17:30"),
        notes='"><img src=x onerror=alert(1)>',
    )

    notification_service.send_booking_confirmation(appt.id)

    assert [m["to"] for m in outbox.emails] == ["cust@example.com", "owner@example.com"]
    customer_mail, owner_mail = outbox.emails
    assert customer_mail["subject"] == "Booking confirmed: Cut <b>Pro</b> at Glow & <Co>"
    assert owner_mail["subject"] == "New booking: <script>alert(1)</script>, Sat 10 Oct, 5:30 PM"
    for mail in outbox.emails:
        html = mail["html"]
        assert "<script>" not in html
        assert "<img" not in html
        assert "<b>Pro</b>" not in html
        assert "<MG>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in owner_mail["html"]
    assert "&lt;img src=x onerror=alert(1)&gt;" in owner_mail["html"]
    assert "Glow &amp; &lt;Co&gt;" in customer_mail["html"]
    assert "12 &lt;MG&gt; Road" in customer_mail["html"]
    assert f"APT-20261010-{appt.id:04d}" in customer_mail["text"]
    assert "Sat 10 Oct, 5:30 PM" in customer_mail["text"]
    assert "450" in customer_mail["text"]
    assert "http://localhost:5173/app" in owner_mail["text"]
    # No gradients / images in templates.
    assert "gradient" not in customer_mail["html"].lower()


def test_booking_confirmation_owner_only_when_no_customer_email(
    db: Session, tenant: Tenant, real_confirmation: None, outbox: Outbox
) -> None:
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business, email=None)
    # An inactive second owner and a staff user get nothing.
    db.add(
        User(
            business_id=tenant.business.id,
            email="old@example.com",
            password_hash="x",
            full_name="Old",
            is_active=False,
        )
    )
    db.add(
        User(
            business_id=tenant.business.id,
            email="staff@example.com",
            password_hash="x",
            full_name="S",
            role="staff",
        )
    )
    db.commit()
    appt = make_appointment(db, tenant.business, service, customer, local(SATURDAY, "10:00"))
    notification_service.send_booking_confirmation(appt.id)
    assert [m["to"] for m in outbox.emails] == [tenant.user.email]


def test_booking_confirmation_only_notifies_own_tenant(
    db: Session, tenant: Tenant, other_tenant: Tenant, real_confirmation: None, outbox: Outbox
) -> None:
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    appt = make_appointment(db, tenant.business, service, customer, local(SATURDAY, "10:00"))
    notification_service.send_booking_confirmation(appt.id)
    assert other_tenant.user.email not in [m["to"] for m in outbox.emails]


def test_booking_confirmation_missing_appointment_and_errors(
    db: Session, tenant: Tenant, real_confirmation: None, outbox: Outbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_service.send_booking_confirmation(12345)
    assert outbox.emails == []

    def broken_session() -> Any:
        raise RuntimeError("db down")

    monkeypatch.setattr(notification_service, "SessionLocal", broken_session)
    notification_service.send_booking_confirmation(1)  # never raises
    assert outbox.emails == []


def test_booking_confirmation_invalid_timezone_falls_back(
    db: Session, tenant: Tenant, real_confirmation: None, outbox: Outbox
) -> None:
    service = make_service(db, tenant.business)
    customer = make_customer(db, tenant.business)
    appt = make_appointment(db, tenant.business, service, customer, local(SATURDAY, "10:00"))
    tenant.business.timezone = "Invalid/Zone"
    db.commit()
    notification_service.send_booking_confirmation(appt.id)
    assert "Sat 10 Oct, 4:30 AM" in outbox.emails[0]["text"]  # rendered in UTC


def test_public_booking_sends_emails_in_background(
    client: TestClient, db: Session, tenant: Tenant, real_confirmation: None, outbox: Outbox
) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    response = client.post(
        "/api/v1/public/glow-salon/bookings", json=booking_body(service.id, local(date(2026, 10, 9), "10:00"))
    )
    assert response.status_code == 201
    assert sorted(m["to"] for m in outbox.emails) == sorted(["k@example.com", tenant.user.email])


# --------------------------------------------------------------------------- password reset


def test_send_password_reset(outbox: Outbox, monkeypatch: pytest.MonkeyPatch) -> None:
    notification_service.send_password_reset("a@example.com", "http://x/reset-password?token=a&b=<c>")
    mail = outbox.emails[0]
    assert mail["to"] == "a@example.com"
    assert "token=a&amp;b=&lt;c&gt;" in mail["html"]
    assert "expires in 30 minutes" in mail["text"]

    def boom(*_a: object) -> None:
        raise RuntimeError("template broke")

    monkeypatch.setattr(email_templates, "password_reset", boom)
    notification_service.send_password_reset("a@example.com", "http://x")  # never raises
    assert len(outbox.emails) == 1


# --------------------------------------------------------------------------- send_email providers


class FakeHttpResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        self.text = "body"


def test_send_email_uses_resend(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")  # Resend wins
    calls: list[dict[str, Any]] = []

    def fake_post(url: str, **kwargs: Any) -> FakeHttpResponse:
        calls.append({"url": url, **kwargs})
        return FakeHttpResponse(200)

    monkeypatch.setattr(notification_service.httpx, "post", fake_post)
    monkeypatch.setattr(notification_service.smtplib, "SMTP", _no_smtp)
    assert REAL_SEND_EMAIL("to@example.com", "Hi", "<p>Hi</p>", "Hi") is True
    assert calls[0]["url"] == "https://api.resend.com/emails"
    assert calls[0]["headers"] == {"Authorization": "Bearer re_test"}
    assert calls[0]["json"]["to"] == ["to@example.com"]
    assert calls[0]["json"]["from"] == settings.EMAIL_FROM

    monkeypatch.setattr(notification_service.httpx, "post", lambda *_a, **_k: FakeHttpResponse(422))
    assert REAL_SEND_EMAIL("to@example.com", "Hi", "<p>Hi</p>", "Hi") is False

    def raising(*_a: object, **_k: object) -> None:
        raise httpx.ConnectError("down")

    monkeypatch.setattr(notification_service.httpx, "post", raising)
    assert REAL_SEND_EMAIL("to@example.com", "Hi", "<p>Hi</p>", "Hi") is False


def _no_smtp(*_a: object, **_k: object) -> None:
    raise AssertionError("SMTP must not be used")


class FakeSMTP:
    instances: list[FakeSMTP] = []

    def __init__(self, host: str, port: int, timeout: float) -> None:
        self.host, self.port, self.timeout = host, port, timeout
        self.actions: list[Any] = []
        FakeSMTP.instances.append(self)

    def __enter__(self) -> FakeSMTP:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.actions.append("quit")

    def starttls(self) -> None:
        self.actions.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.actions.append(("login", user, password))

    def send_message(self, message: Any) -> None:
        self.actions.append(("send", message))


def test_send_email_uses_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSMTP.instances = []
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 2525)
    monkeypatch.setattr(settings, "SMTP_USER", "mailer")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "pw")
    monkeypatch.setattr(settings, "EMAIL_FROM", "SlotEase <bookings@example.com>")
    monkeypatch.setattr(notification_service.smtplib, "SMTP", FakeSMTP)
    assert REAL_SEND_EMAIL("to@example.com", "Subject", "<p>Body</p>", "Body") is True
    smtp = FakeSMTP.instances[0]
    assert (smtp.host, smtp.port) == ("smtp.example.com", 2525)
    assert smtp.actions[0] == "starttls"
    assert smtp.actions[1] == ("login", "mailer", "pw")
    message = smtp.actions[2][1]
    assert message["To"] == "to@example.com"
    assert message["Subject"] == "Subject"
    assert message["From"] == "SlotEase <bookings@example.com>"
    assert message.get_body(("plain",)).get_content().strip() == "Body"
    assert "<p>Body</p>" in message.get_body(("html",)).get_content()

    # No TLS, no login.
    monkeypatch.setattr(settings, "SMTP_USE_TLS", False)
    monkeypatch.setattr(settings, "SMTP_USER", "")
    assert REAL_SEND_EMAIL("to@example.com", "S", "<p>B</p>", "B") is True
    assert [a for a in FakeSMTP.instances[1].actions if not isinstance(a, tuple)] == ["quit"]


def test_send_email_smtp_failure_returns_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")

    def refuse(*_a: object, **_k: object) -> None:
        raise OSError("connection refused")

    monkeypatch.setattr(notification_service.smtplib, "SMTP", refuse)
    assert REAL_SEND_EMAIL("to@example.com", "S", "<p>B</p>", "B") is False


def test_send_email_console_fallback(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(notification_service.httpx, "post", _no_smtp)
    monkeypatch.setattr(notification_service.smtplib, "SMTP", _no_smtp)
    with caplog.at_level("INFO", logger="app.services.notification_service"):
        assert REAL_SEND_EMAIL("to@example.com", "Console", "<p>x</p>", "plain body") is True
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        assert REAL_SEND_EMAIL("to@example.com", "Prod", "<p>x</p>", "secret body") is True
    assert "email (console)" in caplog.text
    assert "plain body" in caplog.text
    assert "secret body" not in caplog.text  # bodies (reset links) are not logged in production
    assert REAL_SEND_EMAIL("", "S", "h", "t") is False


def test_format_price() -> None:
    assert email_templates.format_price("450", "INR") == "Rs 450.00"
    assert email_templates.format_price(1234.5, "usd") == "USD 1,234.50"

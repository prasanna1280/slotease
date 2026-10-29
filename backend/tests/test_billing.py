"""Billing: status, subscribe, checkout verification, cancel, webhooks, Razorpay client."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import ServiceUnavailableError
from app.models import Business, PaymentEvent
from app.services import billing_service, razorpay_client
from tests.factories import Tenant, booking_body, local, make_service

KEY_ID = "rzp_test_key"
KEY_SECRET = "rzp_test_secret"
PLAN_ID = "plan_test"
WEBHOOK_SECRET = "whsec_test"
PERIOD_END = 1_893_456_000  # 2030-01-01T00:00:00Z


def sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    """Configure Razorpay settings and replace the REST client with recorders."""
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", KEY_ID)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", KEY_SECRET)
    monkeypatch.setattr(settings, "RAZORPAY_PLAN_ID", PLAN_ID)
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    calls: dict[str, list[Any]] = {"create": [], "cancel": []}

    def fake_create(
        plan_id: str, total_count: int = 120, notes: dict[str, str] | None = None
    ) -> dict[str, Any]:
        calls["create"].append((plan_id, total_count, notes))
        return {"id": "sub_123", "short_url": "https://rzp.io/i/abc", "status": "created"}

    def fake_cancel(sub_id: str, cancel_at_cycle_end: bool = True) -> dict[str, Any]:
        calls["cancel"].append((sub_id, cancel_at_cycle_end))
        return {"id": sub_id, "status": "active", "current_end": PERIOD_END}

    monkeypatch.setattr(razorpay_client, "create_subscription", fake_create)
    monkeypatch.setattr(razorpay_client, "cancel_subscription", fake_cancel)
    return calls


def webhook(
    client: TestClient,
    event: str,
    sub_id: str = "sub_123",
    *,
    event_id: str | None = "evt_1",
    notes: dict[str, str] | None = None,
    current_end: int | None = PERIOD_END,
    secret: str = WEBHOOK_SECRET,
) -> httpx.Response:
    entity: dict[str, Any] = {"id": sub_id, "notes": notes or {}}
    if current_end is not None:
        entity["current_end"] = current_end
    raw = json.dumps({"event": event, "payload": {"subscription": {"entity": entity}}}).encode()
    headers = {"X-Razorpay-Signature": sign(secret, raw), "Content-Type": "application/json"}
    if event_id is not None:
        headers["X-Razorpay-Event-Id"] = event_id
    return client.post("/api/v1/billing/webhook", content=raw, headers=headers)


def refreshed(db: Session, business: Business) -> Business:
    db.expire_all()
    fresh = db.get(Business, business.id)
    assert fresh is not None
    return fresh


# --------------------------------------------------------------------------- GET / subscribe


def test_get_billing_not_configured(client: TestClient, tenant: Tenant) -> None:
    body = client.get("/api/v1/billing", headers=tenant.headers).json()
    assert body["plan"] == "trial"
    assert body["subscription_status"] == "trialing"
    assert body["is_bookable"] is True
    assert body["price_inr"] == 499
    assert body["billing_configured"] is False
    assert body["razorpay_key_id"] is None
    assert body["razorpay_subscription_id"] is None
    assert body["current_period_end"] is None
    assert body["trial_ends_at"].endswith("+05:30")


def test_get_billing_configured_shows_key(
    client: TestClient, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    body = client.get("/api/v1/billing", headers=tenant.headers).json()
    assert body["billing_configured"] is True
    assert body["razorpay_key_id"] == KEY_ID


def test_subscribe_not_configured_503(client: TestClient, tenant: Tenant) -> None:
    response = client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    assert response.status_code == 503
    assert response.json() == {
        "error": "BILLING_NOT_CONFIGURED",
        "message": "Billing is not configured on this server.",
    }
    for path in ("/api/v1/billing/cancel",):
        assert client.post(path, headers=tenant.headers).status_code == 503
    verify = client.post(
        "/api/v1/billing/verify",
        headers=tenant.headers,
        json={"razorpay_payment_id": "p", "razorpay_subscription_id": "s", "razorpay_signature": "x"},
    )
    assert verify.status_code == 503


def test_subscribe_mocked(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    response = client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    assert response.status_code == 200
    assert response.json() == {
        "subscription_id": "sub_123",
        "key_id": KEY_ID,
        "short_url": "https://rzp.io/i/abc",
        "amount": 49900,
        "currency": "INR",
        "name": "Glow Salon",
        "email": tenant.user.email,
        "contact": "+919876543210",
    }
    assert configured["create"] == [
        (PLAN_ID, 120, {"business_id": str(tenant.business.id), "business_slug": "glow-salon"})
    ]
    assert refreshed(db, tenant.business).razorpay_subscription_id == "sub_123"


def test_subscribe_already_active_409(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    tenant.business.subscription_status = "active"
    db.commit()
    response = client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    assert response.status_code == 409
    assert response.json()["error"] == "ALREADY_SUBSCRIBED"
    assert configured["create"] == []


def test_subscribe_provider_returns_no_id_503(
    client: TestClient, tenant: Tenant, configured: dict[str, list[Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(razorpay_client, "create_subscription", lambda *_a, **_k: {"status": "weird"})
    response = client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    assert response.status_code == 503
    assert response.json()["error"] == "PAYMENT_PROVIDER_ERROR"


# --------------------------------------------------------------------------- verify


def _verify(client: TestClient, tenant: Tenant, payment: str, sub: str, signature: str) -> httpx.Response:
    return client.post(
        "/api/v1/billing/verify",
        headers=tenant.headers,
        json={
            "razorpay_payment_id": payment,
            "razorpay_subscription_id": sub,
            "razorpay_signature": signature,
        },
    )


def test_verify_good_signature_activates(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    response = _verify(client, tenant, "pay_1", "sub_123", sign(KEY_SECRET, b"pay_1|sub_123"))
    assert response.status_code == 200
    body = response.json()
    assert body["subscription_status"] == "active"
    assert body["plan"] == "pro"
    assert body["is_bookable"] is True
    assert body["razorpay_subscription_id"] == "sub_123"
    period_end = datetime.fromisoformat(body["current_period_end"])
    assert period_end > datetime.now(UTC) + timedelta(days=29)


def test_verify_bad_signature_400(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    for signature in ("deadbeef", sign("wrong-secret", b"pay_1|sub_123"), sign(KEY_SECRET, b"pay_2|sub_123")):
        response = _verify(client, tenant, "pay_1", "sub_123", signature)
        assert response.status_code == 400
        assert response.json() == {
            "error": "INVALID_SIGNATURE",
            "message": "Payment signature verification failed.",
        }
    assert refreshed(db, tenant.business).subscription_status == "trialing"


def test_verify_mismatched_subscription_id_400(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    # Correctly signed, but for a subscription that is not this business's.
    response = _verify(client, tenant, "pay_1", "sub_other", sign(KEY_SECRET, b"pay_1|sub_other"))
    assert response.status_code == 400
    assert response.json()["error"] == "INVALID_SIGNATURE"
    assert refreshed(db, tenant.business).subscription_status == "trialing"


# --------------------------------------------------------------------------- cancel


def test_cancel(client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]) -> None:
    no_sub = client.post("/api/v1/billing/cancel", headers=tenant.headers)
    assert no_sub.status_code == 409
    assert no_sub.json()["error"] == "NO_ACTIVE_SUBSCRIPTION"

    client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    _verify(client, tenant, "pay_1", "sub_123", sign(KEY_SECRET, b"pay_1|sub_123"))
    response = client.post("/api/v1/billing/cancel", headers=tenant.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["subscription_status"] == "cancelled"
    assert body["is_bookable"] is True  # paid until period end
    assert datetime.fromisoformat(body["current_period_end"]) == datetime.fromtimestamp(PERIOD_END, tz=UTC)
    assert configured["cancel"] == [("sub_123", True)]
    again = client.post("/api/v1/billing/cancel", headers=tenant.headers)
    assert again.status_code == 409


# --------------------------------------------------------------------------- webhook


def test_webhook_not_configured_503(client: TestClient) -> None:
    response = client.post("/api/v1/billing/webhook", content=b"{}", headers={"X-Razorpay-Signature": "x"})
    assert response.status_code == 503


def test_webhook_bad_or_missing_signature_400(
    client: TestClient, db: Session, configured: dict[str, list[Any]]
) -> None:
    raw = b'{"event": "subscription.activated"}'
    for headers in ({"X-Razorpay-Signature": "bad"}, {}, {"X-Razorpay-Signature": sign("other", raw)}):
        response = client.post("/api/v1/billing/webhook", content=raw, headers=headers)
        assert response.status_code == 400
        assert response.json()["error"] == "INVALID_SIGNATURE"
    assert db.scalars(select(PaymentEvent)).all() == []


@pytest.mark.parametrize("raw", [b"not json", b"[1, 2]", b"\xff\xfe"])
def test_webhook_non_object_body_400(
    client: TestClient, configured: dict[str, list[Any]], raw: bytes
) -> None:
    response = client.post(
        "/api/v1/billing/webhook", content=raw, headers={"X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw)}
    )
    assert response.status_code == 400
    assert response.json()["error"] == "BAD_REQUEST"


@pytest.mark.parametrize(
    ("event", "status", "plan"),
    [
        ("subscription.activated", "active", "pro"),
        ("subscription.charged", "active", "pro"),
        ("subscription.pending", "past_due", "trial"),
        ("subscription.halted", "past_due", "trial"),
        ("subscription.cancelled", "cancelled", "trial"),
        ("subscription.completed", "cancelled", "trial"),
    ],
)
def test_webhook_events_map_to_statuses(
    client: TestClient,
    db: Session,
    tenant: Tenant,
    configured: dict[str, list[Any]],
    event: str,
    status: str,
    plan: str,
) -> None:
    tenant.business.razorpay_subscription_id = "sub_123"
    db.commit()
    response = webhook(client, event)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    fresh = refreshed(db, tenant.business)
    assert fresh.subscription_status == status
    assert fresh.plan == plan
    if status != "past_due":
        assert fresh.current_period_end == datetime.fromtimestamp(PERIOD_END, tz=UTC)
    event_row = db.scalars(select(PaymentEvent)).one()
    assert (event_row.event_id, event_row.event_type, event_row.business_id) == (
        "evt_1",
        event,
        tenant.business.id,
    )
    assert event_row.payload["event"] == event


def test_webhook_idempotent(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    tenant.business.razorpay_subscription_id = "sub_123"
    db.commit()
    assert webhook(client, "subscription.halted", event_id="evt_A").status_code == 200
    # Same event id again (even with different content) is ignored.
    assert webhook(client, "subscription.activated", event_id="evt_A").status_code == 200
    assert refreshed(db, tenant.business).subscription_status == "past_due"
    assert len(db.scalars(select(PaymentEvent)).all()) == 1
    # A new event id is processed.
    assert webhook(client, "subscription.activated", event_id="evt_B").status_code == 200
    assert refreshed(db, tenant.business).subscription_status == "active"


def test_webhook_event_id_fallback_is_body_hash(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    tenant.business.razorpay_subscription_id = "sub_123"
    db.commit()
    first = webhook(client, "subscription.charged", event_id=None)
    second = webhook(client, "subscription.charged", event_id=None)
    assert first.status_code == second.status_code == 200
    rows = db.scalars(select(PaymentEvent)).all()
    assert len(rows) == 1
    assert len(rows[0].event_id) == 64


def test_webhook_lookup_by_notes_business_id(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    response = webhook(
        client, "subscription.activated", "sub_new", notes={"business_id": str(tenant.business.id)}
    )
    assert response.status_code == 200
    fresh = refreshed(db, tenant.business)
    assert fresh.subscription_status == "active"
    assert fresh.razorpay_subscription_id == "sub_new"


def test_webhook_unmatched_business_is_logged(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    for i, notes in enumerate(({}, {"business_id": "not-a-number"}, {"business_id": "9999"})):
        assert (
            webhook(
                client, "subscription.activated", "sub_unknown", event_id=f"e{i}", notes=notes
            ).status_code
            == 200
        )
    raw = json.dumps({"event": "payment.captured", "payload": {}}).encode()
    response = client.post(
        "/api/v1/billing/webhook", content=raw, headers={"X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw)}
    )
    assert response.status_code == 200
    rows = db.scalars(select(PaymentEvent)).all()
    assert len(rows) == 4
    assert all(r.business_id is None for r in rows)
    assert refreshed(db, tenant.business).subscription_status == "trialing"


def test_webhook_bad_current_end_ignored(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    tenant.business.razorpay_subscription_id = "sub_123"
    db.commit()
    raw = json.dumps(
        {
            "event": "subscription.charged",
            "payload": {"subscription": {"entity": {"id": "sub_123", "current_end": "soon"}}},
        }
    ).encode()
    response = client.post(
        "/api/v1/billing/webhook", content=raw, headers={"X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw)}
    )
    assert response.status_code == 200
    fresh = refreshed(db, tenant.business)
    assert fresh.subscription_status == "active"
    assert fresh.current_period_end is None


def test_helpers() -> None:
    assert billing_service._from_unix(None) is None
    assert billing_service._from_unix(True) is None
    assert billing_service._from_unix("0") == datetime(1970, 1, 1, tzinfo=UTC)
    assert billing_service._from_unix(10**20) is None
    assert billing_service.signature_matches("", b"x", "sig") is False
    assert billing_service.signature_matches("s", b"x", None) is False
    good = sign("s", b"x")
    assert billing_service.signature_matches("s", b"x", f"  {good} ")


# --------------------------------------------------------------------------- bookability


def test_trial_expired_blocks_public_booking_until_subscribed(
    client: TestClient, db: Session, tenant: Tenant, configured: dict[str, list[Any]]
) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    tenant.business.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
    db.commit()
    body = booking_body(service.id, local(datetime(2026, 10, 9).date(), "10:00"))
    blocked = client.post("/api/v1/public/glow-salon/bookings", json=body)
    assert blocked.status_code == 403
    assert blocked.json()["error"] == "BUSINESS_INACTIVE"
    assert client.get("/api/v1/billing", headers=tenant.headers).json()["is_bookable"] is False
    # Owner bookings are not blocked by the plan.
    assert client.post("/api/v1/appointments", headers=tenant.headers, json=body).status_code == 201

    client.post("/api/v1/billing/subscribe", headers=tenant.headers)
    _verify(client, tenant, "pay_1", "sub_123", sign(KEY_SECRET, b"pay_1|sub_123"))
    body2 = booking_body(service.id, local(datetime(2026, 10, 9).date(), "11:00"))
    assert client.post("/api/v1/public/glow-salon/bookings", json=body2).status_code == 201


# --------------------------------------------------------------------------- Razorpay REST client


class FakeResponse:
    def __init__(self, status_code: int, payload: Any = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> Any:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def test_razorpay_client_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", KEY_ID)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", KEY_SECRET)
    seen: list[dict[str, Any]] = []

    def fake_post(url: str, **kwargs: Any) -> FakeResponse:
        seen.append({"url": url, **kwargs})
        return FakeResponse(200, {"id": "sub_9"})

    monkeypatch.setattr(razorpay_client.httpx, "post", fake_post)
    assert razorpay_client.create_subscription("plan_x", notes={"a": "b"}) == {"id": "sub_9"}
    assert razorpay_client.cancel_subscription("sub_9") == {"id": "sub_9"}
    razorpay_client.cancel_subscription("sub_9", cancel_at_cycle_end=False)
    assert seen[0]["url"] == "https://api.razorpay.com/v1/subscriptions"
    assert seen[0]["json"] == {
        "plan_id": "plan_x",
        "total_count": 120,
        "customer_notify": 1,
        "notes": {"a": "b"},
    }
    assert seen[0]["auth"] == (KEY_ID, KEY_SECRET)
    assert seen[0]["timeout"] == 15.0
    assert seen[1]["url"] == "https://api.razorpay.com/v1/subscriptions/sub_9/cancel"
    assert seen[1]["json"] == {"cancel_at_cycle_end": 1}
    assert seen[2]["json"] == {"cancel_at_cycle_end": 0}


@pytest.mark.parametrize(
    "behaviour",
    [
        httpx.ConnectError("down"),
        FakeResponse(500, text="oops"),
        FakeResponse(400, {"error": {}}),
        FakeResponse(200, ValueError("not json")),
        FakeResponse(200, ["list"]),
    ],
)
def test_razorpay_client_errors(monkeypatch: pytest.MonkeyPatch, behaviour: Any) -> None:
    def fake_post(url: str, **kwargs: Any) -> FakeResponse:
        if isinstance(behaviour, Exception):
            raise behaviour
        return behaviour

    monkeypatch.setattr(razorpay_client.httpx, "post", fake_post)
    with pytest.raises(ServiceUnavailableError) as excinfo:
        razorpay_client.create_subscription("plan_x")
    assert excinfo.value.code == "PAYMENT_PROVIDER_ERROR"
    assert excinfo.value.status_code == 503

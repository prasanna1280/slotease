"""Auth: register, login, refresh rotation, logout, me, change/forgot/reset password."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.exceptions import UnauthorizedError
from app.models import Business, RefreshToken, User, WorkingHours
from app.services import auth_service, business_service
from app.services.validators import normalize_phone, slugify, validate_slug
from tests.conftest import Outbox
from tests.factories import DEFAULT_PASSWORD, Tenant

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"


def register_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "business_name": "Glow Salon",
        "phone": "+91 98765-43210",
        "full_name": "Asha K",
        "email": "Owner@Example.com",
        "password": "Secret123",
    }
    body.update(overrides)
    return body


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- register


def test_register_creates_business_owner_hours_and_trial(client: TestClient, db: Session) -> None:
    before = datetime.now(UTC)
    response = client.post(REGISTER, json=register_body())
    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 1800
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["email"] == "owner@example.com"
    assert body["user"]["role"] == "owner"
    biz = body["business"]
    assert biz["slug"] == "glow-salon"
    assert biz["phone"] == "+919876543210"
    assert biz["timezone"] == "Asia/Kolkata"
    assert biz["plan"] == "trial"
    assert biz["subscription_status"] == "trialing"
    assert biz["is_bookable"] is True
    assert biz["trial_ends_at"].endswith("+05:30")
    trial_end = datetime.fromisoformat(biz["trial_ends_at"])
    assert timedelta(days=13, hours=23) < trial_end - before < timedelta(days=14, minutes=5)

    hours = db.scalars(select(WorkingHours).where(WorkingHours.business_id == biz["id"])).all()
    assert sorted(h.weekday for h in hours) == [0, 1, 2, 3, 4, 5]
    assert {(h.open_time.strftime("%H:%M"), h.close_time.strftime("%H:%M")) for h in hours} == {
        ("09:00", "18:00")
    }
    # Token works.
    me = client.get("/api/v1/auth/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["business"]["id"] == biz["id"]


def test_password_is_bcrypt_hashed_not_plain(client: TestClient, db: Session) -> None:
    client.post(REGISTER, json=register_body())
    user = db.scalars(select(User)).one()
    assert user.password_hash != "Secret123"
    assert "Secret123" not in user.password_hash
    assert user.password_hash.startswith("$2b$")
    assert verify_password("Secret123", user.password_hash)
    assert not verify_password("Secret124", user.password_hash)


def test_register_slug_derivation_and_suffixes(client: TestClient) -> None:
    first = client.post(REGISTER, json=register_body())
    second = client.post(REGISTER, json=register_body(email="b@example.com"))
    third = client.post(REGISTER, json=register_body(email="c@example.com"))
    assert first.json()["business"]["slug"] == "glow-salon"
    assert second.json()["business"]["slug"] == "glow-salon-2"
    assert third.json()["business"]["slug"] == "glow-salon-3"


def test_register_derived_slug_skips_reserved(client: TestClient) -> None:
    response = client.post(REGISTER, json=register_body(business_name="Admin"))
    assert response.status_code == 201
    assert response.json()["business"]["slug"] == "admin-2"


def test_register_explicit_slug(client: TestClient) -> None:
    response = client.post(REGISTER, json=register_body(slug="My-Salon"))
    assert response.status_code == 201
    assert response.json()["business"]["slug"] == "my-salon"


def test_register_reserved_slug_422(client: TestClient) -> None:
    response = client.post(REGISTER, json=register_body(slug="login"))
    assert response.status_code == 422
    assert response.json()["error"] == "SLUG_RESERVED"


def test_register_taken_slug_409(client: TestClient, tenant: Tenant) -> None:
    response = client.post(REGISTER, json=register_body(slug="glow-salon"))
    assert response.status_code == 409
    assert response.json()["error"] == "SLUG_TAKEN"


def test_register_email_taken_case_insensitive_409(client: TestClient) -> None:
    assert client.post(REGISTER, json=register_body()).status_code == 201
    response = client.post(REGISTER, json=register_body(email="OWNER@example.COM", slug="another"))
    assert response.status_code == 409
    assert response.json() == {
        "error": "EMAIL_TAKEN",
        "message": "An account with this email already exists.",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("password", "short1"),
        ("password", "12345678"),
        ("phone", "12ab"),
        ("phone", "123"),
        ("timezone", "Mars/Olympus"),
        ("slug", "-bad-"),
        ("business_name", " "),
        ("email", "a@b"),
    ],
)
def test_register_validation_422(client: TestClient, field: str, value: str) -> None:
    response = client.post(REGISTER, json=register_body(**{field: value}))
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_register_custom_timezone_and_blank_slug(client: TestClient) -> None:
    response = client.post(REGISTER, json=register_body(timezone="America/New_York", slug="  "))
    assert response.status_code == 201
    assert response.json()["business"]["timezone"] == "America/New_York"
    assert response.json()["business"]["slug"] == "glow-salon"


# --------------------------------------------------------------------------- login


def test_login_ok(client: TestClient, tenant: Tenant) -> None:
    response = client.post(
        LOGIN, json={"email": "OWNER@glow-salon.example.com", "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == tenant.user.id
    payload = decode_token(body["access_token"], "access")
    assert payload["sub"] == str(tenant.user.id)
    assert payload["bid"] == tenant.business.id


@pytest.mark.parametrize(
    ("email", "password"),
    [("owner@glow-salon.example.com", "WrongPass1"), ("nobody@example.com", DEFAULT_PASSWORD)],
)
def test_login_bad_credentials(client: TestClient, tenant: Tenant, email: str, password: str) -> None:
    response = client.post(LOGIN, json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.json() == {"error": "INVALID_CREDENTIALS", "message": "Incorrect email or password."}


def test_login_inactive_user(client: TestClient, db: Session, tenant: Tenant) -> None:
    tenant.user.is_active = False
    db.commit()
    response = client.post(LOGIN, json={"email": tenant.user.email, "password": DEFAULT_PASSWORD})
    assert response.status_code == 401
    # Existing access tokens stop working too.
    assert client.get("/api/v1/auth/me", headers=tenant.headers).status_code == 401


# --------------------------------------------------------------------------- refresh / logout


def _login(client: TestClient, tenant: Tenant) -> dict[str, object]:
    return client.post(LOGIN, json={"email": tenant.user.email, "password": DEFAULT_PASSWORD}).json()


def test_refresh_rotates_token(client: TestClient, db: Session, tenant: Tenant) -> None:
    first = _login(client, tenant)
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert response.status_code == 200
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    # Only hashes are stored.
    stored = db.scalars(select(RefreshToken.token_hash)).all()
    assert first["refresh_token"] not in stored
    assert all(len(h) == 64 for h in stored)
    # New token works once more.
    third = client.post("/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert third.status_code == 200


def test_refresh_reuse_detection_revokes_family(client: TestClient, tenant: Tenant) -> None:
    first = _login(client, tenant)
    second = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}).json()
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert reuse.status_code == 401
    assert reuse.json()["error"] == "INVALID_TOKEN"
    # The legitimately rotated token was revoked as well.
    after = client.post("/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert after.status_code == 401


def test_refresh_unknown_and_expired(client: TestClient, db: Session, tenant: Tenant) -> None:
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": "nope"}).status_code == 401
    tokens = _login(client, tenant)
    row = db.scalars(select(RefreshToken)).one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401


def test_refresh_inactive_user(client: TestClient, db: Session, tenant: Tenant) -> None:
    tokens = _login(client, tenant)
    tenant.user.is_active = False
    db.commit()
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401


def test_logout_revokes_and_is_idempotent(client: TestClient, tenant: Tenant) -> None:
    tokens = _login(client, tenant)
    assert (
        client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 204
    )
    assert (
        client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 204
    )
    assert client.post("/api/v1/auth/logout", json={"refresh_token": "unknown"}).status_code == 204
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401


# --------------------------------------------------------------------------- me


def test_me_get_and_patch(client: TestClient, tenant: Tenant) -> None:
    response = client.get("/api/v1/auth/me", headers=tenant.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == tenant.user.email
    assert body["business"]["slug"] == "glow-salon"

    response = client.patch("/api/v1/auth/me", headers=tenant.headers, json={"full_name": "  Asha Kumar "})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Asha Kumar"
    response = client.patch("/api/v1/auth/me", headers=tenant.headers, json={"full_name": "   "})
    assert response.status_code == 422


def test_me_requires_valid_access_token(client: TestClient, tenant: Tenant) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401
    bad = client.get("/api/v1/auth/me", headers=bearer("garbage"))
    assert bad.status_code == 401
    assert bad.json()["error"] == "INVALID_TOKEN"
    # A reset token is not an access token.
    reset = create_password_reset_token(tenant.user)
    assert client.get("/api/v1/auth/me", headers=bearer(reset)).status_code == 401
    # Expired token.
    expired = jwt.encode(
        {
            "sub": str(tenant.user.id),
            "bid": 1,
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    assert client.get("/api/v1/auth/me", headers=bearer(expired)).status_code == 401
    # Unknown user / malformed sub.
    assert client.get("/api/v1/auth/me", headers=bearer(create_access_token(9999, 1))).status_code == 401
    odd = jwt.encode(
        {"sub": "abc", "type": "access", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    assert client.get("/api/v1/auth/me", headers=bearer(odd)).status_code == 401
    # Wrong signing key.
    forged = jwt.encode(
        {"sub": str(tenant.user.id), "type": "access", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        "another-secret-key-that-is-long-enough",
        algorithm="HS256",
    )
    assert client.get("/api/v1/auth/me", headers=bearer(forged)).status_code == 401


# --------------------------------------------------------------------------- change password


def test_change_password(client: TestClient, tenant: Tenant) -> None:
    tokens = _login(client, tenant)
    wrong = client.post(
        "/api/v1/auth/change-password",
        headers=tenant.headers,
        json={"current_password": "WrongPass1", "new_password": "NewSecret99"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["error"] == "INVALID_PASSWORD"

    weak = client.post(
        "/api/v1/auth/change-password",
        headers=tenant.headers,
        json={"current_password": DEFAULT_PASSWORD, "new_password": "weak"},
    )
    assert weak.status_code == 422

    ok = client.post(
        "/api/v1/auth/change-password",
        headers=tenant.headers,
        json={"current_password": DEFAULT_PASSWORD, "new_password": "NewSecret99"},
    )
    assert ok.status_code == 204
    # All refresh tokens revoked.
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )
    assert (
        client.post(LOGIN, json={"email": tenant.user.email, "password": DEFAULT_PASSWORD}).status_code == 401
    )
    assert client.post(LOGIN, json={"email": tenant.user.email, "password": "NewSecret99"}).status_code == 200


# --------------------------------------------------------------------------- forgot / reset


def _reset_token_from_outbox(outbox: Outbox) -> str:
    assert len(outbox.emails) == 1
    mail = outbox.emails[0]
    url = next(word for word in mail["text"].split() if word.startswith("http"))
    parsed = urlparse(url)
    assert parsed.path == "/reset-password"
    assert url.startswith("http://localhost:5173/reset-password?token=")
    return parse_qs(parsed.query)["token"][0]


def test_forgot_password_sends_email(client: TestClient, tenant: Tenant, outbox: Outbox) -> None:
    response = client.post("/api/v1/auth/forgot-password", json={"email": "OWNER@glow-salon.example.com"})
    assert response.status_code == 202
    assert response.json() == {"message": "If an account exists, a reset link has been sent."}
    assert outbox.emails[0]["to"] == tenant.user.email
    assert outbox.emails[0]["subject"] == "Reset your SlotEase password"
    token = _reset_token_from_outbox(outbox)
    assert decode_token(token, "reset")["sub"] == str(tenant.user.id)


def test_forgot_password_unknown_email_still_202(client: TestClient, outbox: Outbox) -> None:
    response = client.post("/api/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    assert response.status_code == 202
    assert response.json() == {"message": "If an account exists, a reset link has been sent."}
    assert outbox.emails == []


def test_forgot_password_inactive_user_no_email(
    client: TestClient, db: Session, tenant: Tenant, outbox: Outbox
) -> None:
    tenant.user.is_active = False
    db.commit()
    assert client.post("/api/v1/auth/forgot-password", json={"email": tenant.user.email}).status_code == 202
    assert outbox.emails == []


def test_reset_password_valid_then_reused(client: TestClient, tenant: Tenant, outbox: Outbox) -> None:
    tokens = _login(client, tenant)
    client.post("/api/v1/auth/forgot-password", json={"email": tenant.user.email})
    token = _reset_token_from_outbox(outbox)

    ok = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Brandnew123"})
    assert ok.status_code == 204
    assert client.post(LOGIN, json={"email": tenant.user.email, "password": "Brandnew123"}).status_code == 200
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )

    reused = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Another123"})
    assert reused.status_code == 400
    assert reused.json() == {
        "error": "INVALID_TOKEN",
        "message": "This reset link is invalid or has expired.",
    }


def test_reset_password_wrong_token_type_and_garbage(client: TestClient, tenant: Tenant) -> None:
    for token in (tenant.token, "not-a-jwt"):
        response = client.post(
            "/api/v1/auth/reset-password", json={"token": token, "new_password": "Brandnew123"}
        )
        assert response.status_code == 400
        assert response.json()["error"] == "INVALID_TOKEN"


def test_reset_password_unknown_or_inactive_user(client: TestClient, db: Session, tenant: Tenant) -> None:
    class Ghost:
        id = 4242
        password_hash = "x"

    ghost_token = create_password_reset_token(Ghost())
    response = client.post(
        "/api/v1/auth/reset-password", json={"token": ghost_token, "new_password": "Brandnew123"}
    )
    assert response.status_code == 400

    token = create_password_reset_token(tenant.user)
    tenant.user.is_active = False
    db.commit()
    response = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "Brandnew123"}
    )
    assert response.status_code == 400


def test_reset_token_without_fingerprint_rejected(client: TestClient, tenant: Tenant) -> None:
    token = jwt.encode(
        {"sub": str(tenant.user.id), "type": "reset", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    response = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "new_password": "Brandnew123"}
    )
    assert response.status_code == 400


# --------------------------------------------------------------------------- helpers / units


def test_security_helpers() -> None:
    long_pw = "a1" * 60  # 120 chars > 72 bytes: truncated consistently
    hashed = hash_password(long_pw)
    assert verify_password(long_pw, hashed)
    assert verify_password("x", "not-a-bcrypt-hash") is False
    with pytest.raises(UnauthorizedError):
        decode_token(create_access_token(1, 1), "reset")


def test_validators() -> None:
    assert normalize_phone("+91 (98765) 43-210") == "+919876543210"
    assert normalize_phone("044.2345.6789") == "04423456789"
    for bad in ("12345", "1" * 16, "+91-abc-1234", "", "١٢٣٤٥٦٧٨"):
        with pytest.raises(ValueError):
            normalize_phone(bad)
    with pytest.raises(ValueError):
        normalize_phone(None)  # type: ignore[arg-type]
    assert validate_slug(" Glow-Salon ") == "glow-salon"
    for bad in ("ab", "-abc", "abc-", "a_b_c", "x" * 41):
        with pytest.raises(ValueError):
            validate_slug(bad)
    assert slugify("Glow Salon & Spa!") == "glow-salon-spa"
    assert slugify("Café Ünïcode") == "cafe-unicode"
    assert slugify("!!!") == "business"
    assert slugify("A") == "a-1"
    assert len(slugify("x" * 100)) == 40


def test_generate_unique_slug_exhaustion(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(business_service, "slug_exists", lambda *_a, **_k: True)
    from app.exceptions import ConflictError

    with pytest.raises(ConflictError):
        business_service.generate_unique_slug(db, "Glow")


def test_register_race_integrity_error_maps_to_conflict(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simulate losing the race: the pre-checks pass but the INSERT hits the unique constraint."""
    client.post(REGISTER, json=register_body(slug="taken-slug", email="first@example.com"))
    monkeypatch.setattr(business_service, "ensure_slug_available", lambda *_a, **_k: None)
    response = client.post(REGISTER, json=register_body(slug="taken-slug", email="second@example.com"))
    assert response.status_code == 409
    assert response.json()["error"] == "SLUG_TAKEN"

    monkeypatch.setattr(auth_service, "get_user_by_email", _get_user_after_first_call())
    response = client.post(REGISTER, json=register_body(slug="fresh-slug", email="first@example.com"))
    assert response.status_code == 409
    assert response.json()["error"] == "EMAIL_TAKEN"
    assert db.scalar(select(Business).where(Business.slug == "fresh-slug")) is None


def _get_user_after_first_call():  # type: ignore[no-untyped-def]
    """First call (pre-check) sees no user; later calls use the real lookup."""
    real = auth_service.get_user_by_email
    calls = {"n": 0}

    def fake(db: Session, email: str) -> User | None:
        calls["n"] += 1
        return None if calls["n"] == 1 else real(db, email)

    return fake

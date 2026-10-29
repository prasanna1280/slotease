"""Password hashing (bcrypt), JWT access/reset tokens (PyJWT) and opaque refresh tokens."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import bcrypt
import jwt

from app.config import settings
from app.exceptions import UnauthorizedError

ALGORITHM = "HS256"
BCRYPT_MAX_BYTES = 72
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_RESET = "reset"
TOKEN_TYPE_ADMIN = "admin"
TOKEN_TYPE_ADMIN_CHALLENGE = "admin_challenge"
# The password step of an admin sign-in is valid this long; the TOTP code must follow within it.
ADMIN_CHALLENGE_MINUTES = 5
# A read-only "view as owner" session lasts this long and cannot be refreshed.
VIEW_AS_MINUTES = 15
INVALID_TOKEN_CODE = "INVALID_TOKEN"
INVALID_TOKEN_MESSAGE = "Invalid or expired token."


class _ResettableUser(Protocol):
    """Structural type for objects passed to :func:`create_password_reset_token`."""

    id: int
    password_hash: str


def _password_bytes(password: str) -> bytes:
    """Encode a password as UTF-8 and truncate to bcrypt's 72-byte limit.

    bcrypt>=4.1 raises on inputs longer than 72 bytes, so truncate explicitly
    (cutting on a byte boundary is fine: both hash and verify use the same bytes).
    """
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    """Return a bcrypt hash (utf-8 string) of ``password``."""
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if ``password`` matches the stored bcrypt ``password_hash``."""
    try:
        return bcrypt.checkpw(_password_bytes(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _now() -> datetime:
    return datetime.now(UTC)


def create_access_token(user_id: int, business_id: int) -> str:
    """Create a short-lived HS256 access token with claims ``sub``, ``bid``, ``type``, ``iat``, ``exp``."""
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "bid": business_id,
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Decode and validate a JWT, checking signature, expiry and the ``type`` claim.

    Raises:
        UnauthorizedError: code ``INVALID_TOKEN`` for any invalid, expired or wrong-type token.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError(INVALID_TOKEN_MESSAGE, code=INVALID_TOKEN_CODE) from exc
    if payload.get("type") != expected_type:
        raise UnauthorizedError(INVALID_TOKEN_MESSAGE, code=INVALID_TOKEN_CODE)
    return payload


def hash_token(raw: str) -> str:
    """Return the SHA-256 hex digest of an opaque token (what is stored in the DB)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_refresh_token() -> tuple[str, str]:
    """Generate a random refresh token. Returns ``(raw_token, sha256_hex)``; store only the hash."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def password_fingerprint(password_hash: str) -> str:
    """Return the first 16 hex chars of sha256(password_hash).

    Embedded in reset tokens so a token stops working once the password changes (single use).
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_password_reset_token(user: _ResettableUser) -> str:
    """Create a ``type=reset`` JWT bound to the user's current password hash fingerprint (``fp``)."""
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "type": TOKEN_TYPE_RESET,
        "fp": password_fingerprint(user.password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_admin_challenge_token(admin_id: int, session_version: int, *, setup: bool) -> str:
    """Short-lived token proving the admin passed the password step (``setup`` = enrolling 2FA)."""
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(admin_id),
        "type": TOKEN_TYPE_ADMIN_CHALLENGE,
        "sv": session_version,
        "setup": setup,
        "iat": now,
        "exp": now + timedelta(minutes=ADMIN_CHALLENGE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_admin_token(admin_id: int, session_version: int) -> str:
    """Admin session token (``type=admin``). It is never accepted by owner endpoints, and vice versa."""
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(admin_id),
        "type": TOKEN_TYPE_ADMIN,
        "sv": session_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ADMIN_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_view_as_token(user_id: int, business_id: int, admin_id: int, admin_session_version: int) -> str:
    """Owner access token for an admin's read-only "view as owner" session.

    It is a normal ``type=access`` token plus ``imp`` (the admin id) and ``isv`` (the admin's session
    version). :func:`app.dependencies.get_current_user` rejects every non-read request made with it, and
    stops accepting it once the admin is deactivated or signed out everywhere.
    """
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "bid": business_id,
        "type": TOKEN_TYPE_ACCESS,
        "imp": admin_id,
        "isv": admin_session_version,
        "iat": now,
        "exp": now + timedelta(minutes=VIEW_AS_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)

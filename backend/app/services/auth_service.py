"""Authentication business logic: sign-up, login, refresh-token rotation and password flows."""

from __future__ import annotations

import logging
from datetime import time, timedelta
from functools import lru_cache
from urllib.parse import urlencode

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import (
    TOKEN_TYPE_RESET,
    create_access_token,
    create_password_reset_token,
    decode_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    password_fingerprint,
    verify_password,
)
from app.config import settings
from app.exceptions import AppError, ConflictError, UnauthorizedError
from app.models import Business, RefreshToken, User, WorkingHours
from app.schemas.auth import AuthOut, ChangePasswordIn, MeOut, RegisterIn, UserOut
from app.schemas.business import BusinessOut
from app.services import business_service
from app.services.time_utils import now_utc

logger = logging.getLogger(__name__)

# Default schedule created at sign-up: Monday (0) .. Saturday (5), 09:00-18:00.
DEFAULT_OPEN = time(9, 0)
DEFAULT_CLOSE = time(18, 0)
DEFAULT_WEEKDAYS: tuple[int, ...] = (0, 1, 2, 3, 4, 5)

INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password."
INVALID_TOKEN_MESSAGE = "Invalid or expired token."


class InvalidCredentialsError(UnauthorizedError):
    """401 INVALID_CREDENTIALS - wrong email/password or inactive account."""

    code = "INVALID_CREDENTIALS"
    message = INVALID_CREDENTIALS_MESSAGE


class InvalidRefreshTokenError(UnauthorizedError):
    """401 INVALID_TOKEN - unknown, expired or revoked refresh token."""

    code = "INVALID_TOKEN"
    message = INVALID_TOKEN_MESSAGE


@lru_cache(maxsize=1)
def _dummy_password_hash() -> str:
    """A bcrypt hash used to spend comparable time when the user does not exist."""
    return hash_password("dummy-password-for-timing-1")


# ---------------------------------------------------------------------------
# Lookups / responses
# ---------------------------------------------------------------------------


def get_user_by_email(db: Session, email: str) -> User | None:
    """Return the user with this (lower-cased) e-mail, or None."""
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def build_me(user: User, business: Business) -> MeOut:
    """Return the ``{user, business}`` payload for ``GET /auth/me``."""
    return MeOut(user=UserOut.model_validate(user), business=BusinessOut.model_validate(business))


def issue_tokens(db: Session, user: User) -> AuthOut:
    """Create an access token and a new stored refresh token for ``user``; commits the session."""
    raw_refresh, refresh_hash = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=now_utc() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.commit()
    business = db.get(Business, user.business_id)
    if business is None:  # pragma: no cover - FK guarantees it
        raise UnauthorizedError("Not authenticated.")
    return AuthOut(
        access_token=create_access_token(user.id, user.business_id),
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.model_validate(user),
        business=BusinessOut.model_validate(business),
    )


def revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    """Mark every still-valid refresh token of ``user_id`` as revoked (caller commits)."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now_utc())
    )


# ---------------------------------------------------------------------------
# Register / login
# ---------------------------------------------------------------------------


def register(db: Session, data: RegisterIn) -> AuthOut:
    """Create a business (14-day trial), its owner and default working hours; return tokens.

    Raises:
        ValidationAppError: 422 ``SLUG_RESERVED`` for a reserved slug.
        ConflictError: 409 ``EMAIL_TAKEN`` / ``SLUG_TAKEN``.
    """
    if get_user_by_email(db, data.email) is not None:
        raise ConflictError("An account with this email already exists.", code="EMAIL_TAKEN")

    if data.slug is not None:
        business_service.ensure_slug_available(db, data.slug)
        slug = data.slug
    else:
        slug = business_service.generate_unique_slug(db, data.business_name)

    now = now_utc()
    business = Business(
        name=data.business_name,
        slug=slug,
        phone=data.phone,
        email=data.email,
        timezone=data.timezone,
        plan="trial",
        subscription_status="trialing",
        trial_ends_at=now + timedelta(days=settings.TRIAL_DAYS),
    )
    db.add(business)
    try:
        db.flush()
        user = User(
            business_id=business.id,
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            role="owner",
            is_active=True,
        )
        db.add(user)
        for weekday in DEFAULT_WEEKDAYS:
            db.add(
                WorkingHours(
                    business_id=business.id,
                    weekday=weekday,
                    open_time=DEFAULT_OPEN,
                    close_time=DEFAULT_CLOSE,
                )
            )
        db.flush()
    except IntegrityError as exc:
        # Lost a race against a concurrent sign-up with the same email/slug.
        db.rollback()
        if get_user_by_email(db, data.email) is not None:
            raise ConflictError("An account with this email already exists.", code="EMAIL_TAKEN") from exc
        raise ConflictError("This booking link is already taken.", code="SLUG_TAKEN") from exc

    logger.info("Registered business id=%s slug=%s", business.id, business.slug)
    return issue_tokens(db, user)


def authenticate(db: Session, email: str, password: str) -> User:
    """Return the active user for valid credentials.

    Always runs one bcrypt verification (against a dummy hash when the user is unknown) so the
    response time does not reveal whether the e-mail is registered.

    Raises:
        InvalidCredentialsError: 401 ``INVALID_CREDENTIALS``.
    """
    user = get_user_by_email(db, email)
    if user is None:
        verify_password(password, _dummy_password_hash())
        raise InvalidCredentialsError()
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise InvalidCredentialsError()
    return user


def login(db: Session, email: str, password: str) -> AuthOut:
    """Authenticate and issue a fresh token pair."""
    user = authenticate(db, email, password)
    return issue_tokens(db, user)


# ---------------------------------------------------------------------------
# Refresh / logout
# ---------------------------------------------------------------------------


def refresh(db: Session, raw_token: str) -> AuthOut:
    """Rotate a refresh token: revoke the presented one and issue a new pair.

    Presenting an already-revoked token is treated as token theft: every refresh token of that
    user is revoked.

    Raises:
        InvalidRefreshTokenError: 401 ``INVALID_TOKEN``.
    """
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if token is None:
        raise InvalidRefreshTokenError()

    if token.revoked_at is not None:
        logger.warning("Refresh token reuse detected for user id=%s; revoking all sessions", token.user_id)
        revoke_all_refresh_tokens(db, token.user_id)
        db.commit()
        raise InvalidRefreshTokenError()

    now = now_utc()
    if token.expires_at <= now:
        raise InvalidRefreshTokenError()

    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise InvalidRefreshTokenError()

    # Atomically claim the token so two concurrent refreshes cannot both succeed.
    claimed = db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == token.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    if getattr(claimed, "rowcount", 0) != 1:
        db.rollback()
        revoke_all_refresh_tokens(db, user.id)
        db.commit()
        raise InvalidRefreshTokenError()

    return issue_tokens(db, user)


def logout(db: Session, raw_token: str) -> None:
    """Revoke a refresh token. Unknown or already revoked tokens are ignored (idempotent)."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now_utc())
    )
    db.commit()


# ---------------------------------------------------------------------------
# Profile / passwords
# ---------------------------------------------------------------------------


def update_me(db: Session, user: User, full_name: str) -> User:
    """Update the current user's display name."""
    user.full_name = full_name
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, data: ChangePasswordIn) -> None:
    """Change the password after verifying the current one; revokes all refresh tokens.

    Raises:
        AppError: 400 ``INVALID_PASSWORD`` if the current password is wrong.
    """
    if not verify_password(data.current_password, user.password_hash):
        raise AppError("Current password is incorrect.", code="INVALID_PASSWORD")
    user.password_hash = hash_password(data.new_password)
    revoke_all_refresh_tokens(db, user.id)
    db.commit()


def build_reset_url(token: str) -> str:
    """Return the frontend reset-password link for ``token``."""
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?{urlencode({'token': token})}"


def create_password_reset(db: Session, email: str) -> tuple[str, str] | None:
    """Return ``(email, reset_url)`` for an active user, or None if there is no such account."""
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        logger.info("Password reset requested for unknown/inactive account")
        return None
    return user.email, build_reset_url(create_password_reset_token(user))


def reset_password(db: Session, token: str, new_password: str) -> None:
    """Set a new password from a reset token (single use via the password fingerprint).

    Raises:
        AppError: 400 ``INVALID_TOKEN`` for an invalid, expired or already used token.
    """
    invalid = AppError("This reset link is invalid or has expired.", code="INVALID_TOKEN")
    try:
        payload = decode_token(token, TOKEN_TYPE_RESET)
        user_id = int(payload["sub"])
    except (UnauthorizedError, KeyError, TypeError, ValueError) as exc:
        raise invalid from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise invalid
    fingerprint = payload.get("fp")
    if not isinstance(fingerprint, str) or fingerprint != password_fingerprint(user.password_hash):
        raise invalid

    user.password_hash = hash_password(new_password)
    revoke_all_refresh_tokens(db, user.id)
    db.commit()

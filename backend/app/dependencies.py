"""Shared FastAPI dependencies: DB session, authenticated user and tenant business."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import TOKEN_TYPE_ACCESS, TOKEN_TYPE_ADMIN, decode_token
from app.database import get_db
from app.exceptions import ForbiddenError, UnauthorizedError
from app.models import AdminUser, Business, User

DbSession = Annotated[Session, Depends(get_db)]

bearer_scheme = HTTPBearer(auto_error=False)

# Methods an admin may use while viewing as an owner (read-only).
READ_ONLY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class ReadOnlyViewError(ForbiddenError):
    """403 READ_ONLY_VIEW - an admin viewing as the owner cannot change anything."""

    code = "READ_ONLY_VIEW"
    message = "You are viewing this account as SlotEase support. It is read-only, so changes are not saved."


def get_current_user(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """Resolve the authenticated, active user from the ``Authorization: Bearer <access token>`` header.

    Raises:
        UnauthorizedError: ``UNAUTHORIZED`` when the header is missing or the user is unknown/inactive,
            ``INVALID_TOKEN`` when the token is invalid or expired.
    """
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise UnauthorizedError("Not authenticated.")
    payload = decode_token(credentials.credentials, TOKEN_TYPE_ACCESS)
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Not authenticated.") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Not authenticated.")
    if "imp" in payload:
        _check_view_as(request, db, payload)
    return user


def _check_view_as(request: Request, db: Session, payload: dict[str, object]) -> None:
    """Validate an admin "view as owner" token: admin still signed in, and the request only reads."""
    admin_id = payload.get("imp")
    admin = db.get(AdminUser, admin_id) if isinstance(admin_id, int) else None
    if admin is None or not admin.is_active or payload.get("isv") != admin.session_version:
        raise UnauthorizedError("Not authenticated.")
    if request.method not in READ_ONLY_METHODS:
        raise ReadOnlyViewError()
    request.state.viewed_by = admin.email


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_business(user: CurrentUser, db: DbSession) -> Business:
    """Return the tenant business of the authenticated user (the only source of ``business_id``)."""
    business = db.get(Business, user.business_id)
    if business is None:
        raise UnauthorizedError("Not authenticated.")
    return business


CurrentBusiness = Annotated[Business, Depends(get_current_business)]


def get_current_admin(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AdminUser:
    """Resolve the signed-in platform admin from an ``admin`` token.

    Raises:
        UnauthorizedError: when the token is missing, invalid, expired, of another type, issued before
            the admin's last password/2FA reset, or the admin is inactive.
    """
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise UnauthorizedError("Not authenticated.")
    payload = decode_token(credentials.credentials, TOKEN_TYPE_ADMIN)
    try:
        admin_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Not authenticated.") from exc
    admin = db.get(AdminUser, admin_id)
    if admin is None or not admin.is_active or payload.get("sv") != admin.session_version:
        raise UnauthorizedError("Not authenticated.")
    return admin


CurrentAdmin = Annotated[AdminUser, Depends(get_current_admin)]

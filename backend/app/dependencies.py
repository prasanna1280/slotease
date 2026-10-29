"""Shared FastAPI dependencies: DB session, authenticated user and tenant business."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import TOKEN_TYPE_ACCESS, decode_token
from app.database import get_db
from app.exceptions import UnauthorizedError
from app.models import Business, User

DbSession = Annotated[Session, Depends(get_db)]

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
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
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_business(user: CurrentUser, db: DbSession) -> Business:
    """Return the tenant business of the authenticated user (the only source of ``business_id``)."""
    business = db.get(Business, user.business_id)
    if business is None:
        raise UnauthorizedError("Not authenticated.")
    return business


CurrentBusiness = Annotated[Business, Depends(get_current_business)]

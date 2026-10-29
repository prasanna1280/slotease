"""Auth endpoints: register, login, refresh, logout, me, change/forgot/reset password.

Mounted by ``app.main`` under ``/api/v1`` -> ``/api/v1/auth``.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from app.dependencies import CurrentBusiness, CurrentUser, DbSession
from app.rate_limit import limiter
from app.schemas.auth import (
    AuthOut,
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    UpdateMeIn,
    UserOut,
)
from app.schemas.common import ErrorOut, MessageOut
from app.services import auth_service, notification_service

router = APIRouter(prefix="/auth", tags=["Auth"])

FORGOT_PASSWORD_MESSAGE = "If an account exists, a reset link has been sent."


@router.post(
    "/register",
    response_model=AuthOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorOut}, 422: {"model": ErrorOut}},
)
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, db: DbSession) -> AuthOut:
    """Create a business with a 14-day trial and its owner account; returns tokens."""
    return auth_service.register(db, data)


@router.post("/login", response_model=AuthOut, responses={401: {"model": ErrorOut}})
@limiter.limit("10/minute")
def login(request: Request, data: LoginIn, db: DbSession) -> AuthOut:
    """Log in with email and password."""
    return auth_service.login(db, data.email, data.password)


@router.post("/refresh", response_model=AuthOut, responses={401: {"model": ErrorOut}})
@limiter.limit("30/minute")
def refresh(request: Request, data: RefreshIn, db: DbSession) -> AuthOut:
    """Rotate a refresh token: the presented token is revoked and a new pair is issued."""
    return auth_service.refresh(db, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(data: RefreshIn, db: DbSession) -> Response:
    """Revoke a refresh token (idempotent)."""
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeOut, responses={401: {"model": ErrorOut}})
def get_me(request: Request, user: CurrentUser, business: CurrentBusiness) -> MeOut:
    """Return the signed-in user and their business (and the admin, in a read-only view-as session)."""
    me = auth_service.build_me(user, business)
    me.viewed_by_admin = getattr(request.state, "viewed_by", None)
    return me


@router.patch("/me", response_model=UserOut, responses={401: {"model": ErrorOut}})
def update_me(data: UpdateMeIn, user: CurrentUser, db: DbSession) -> UserOut:
    """Update the signed-in user's profile."""
    return UserOut.model_validate(auth_service.update_me(db, user, data.full_name))


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={400: {"model": ErrorOut}, 401: {"model": ErrorOut}},
)
def change_password(data: ChangePasswordIn, user: CurrentUser, db: DbSession) -> Response:
    """Change the password (requires the current one). Signs out all other sessions."""
    auth_service.change_password(db, user, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/forgot-password", response_model=MessageOut, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def forgot_password(
    request: Request, data: ForgotPasswordIn, background_tasks: BackgroundTasks, db: DbSession
) -> MessageOut:
    """E-mail a reset link if the account exists. Always answers 202 (no account enumeration)."""
    result = auth_service.create_password_reset(db, data.email)
    if result is not None:
        email, reset_url = result
        background_tasks.add_task(notification_service.send_password_reset, email, reset_url)
    return MessageOut(message=FORGOT_PASSWORD_MESSAGE)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={400: {"model": ErrorOut}},
)
@limiter.limit("5/minute")
def reset_password(request: Request, data: ResetPasswordIn, db: DbSession) -> Response:
    """Set a new password using the token from the reset e-mail. Signs out all sessions."""
    auth_service.reset_password(db, data.token, data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

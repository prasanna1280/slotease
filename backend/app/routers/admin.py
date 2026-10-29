"""Platform admin API (``/api/v1/admin``): SlotEase staff only, separate sign-in with 2FA.

Admin tokens (``type=admin``) are never accepted by owner endpoints, and owner tokens never work here.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response, status

from app.dependencies import CurrentAdmin, DbSession
from app.models import PAYMENT_SOURCES
from app.rate_limit import limiter
from app.schemas.admin import (
    AdminAppointmentOut,
    AdminAppointmentUpdate,
    AdminBusinessDetail,
    AdminBusinessPage,
    AdminBusinessUpdate,
    AdminDeleteBusinessIn,
    AdminLoginIn,
    AdminLoginOut,
    AdminOut,
    AdminSessionOut,
    AdminStatus,
    AdminVerifyIn,
    AuditPage,
    Basis,
    ExtendTrialIn,
    Granularity,
    ManualPaymentIn,
    OverviewOut,
    PaymentOut,
    PaymentPage,
    ResetLinkOut,
    RevenueOut,
    SubscriptionsOut,
    ViewAsOut,
)
from app.schemas.common import ErrorOut
from app.services import admin_reports, admin_service, notification_service

router = APIRouter(prefix="/admin", tags=["Admin"])

AUTH_ERRORS: dict[int | str, dict[str, object]] = {401: {"model": ErrorOut}}
Page = Annotated[int, Query(ge=1, le=100_000)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


# --------------------------------------------------------------------------- sign-in


@router.post("/auth/login", response_model=AdminLoginOut, responses=AUTH_ERRORS)
@limiter.limit("5/minute")
def login(request: Request, data: AdminLoginIn, db: DbSession) -> AdminLoginOut:
    """Step 1: email and password. Returns a challenge for the authenticator code (or 2FA setup)."""
    return admin_service.login(db, data.email, data.password)


@router.post("/auth/verify", response_model=AdminSessionOut, responses=AUTH_ERRORS)
@limiter.limit("10/minute")
def verify(request: Request, data: AdminVerifyIn, db: DbSession) -> AdminSessionOut:
    """Step 2: the 6-digit authenticator code. Returns the admin session token."""
    return admin_service.verify(db, data.challenge_token, data.code, _ip(request))


@router.get("/auth/me", response_model=AdminOut, responses=AUTH_ERRORS)
def me(admin: CurrentAdmin) -> AdminOut:
    """The signed-in admin."""
    return AdminOut.model_validate(admin)


# --------------------------------------------------------------------------- reports


@router.get("/overview", response_model=OverviewOut, responses=AUTH_ERRORS)
def overview(admin: CurrentAdmin, db: DbSession) -> OverviewOut:
    """Dashboard summary across all businesses."""
    return admin_reports.overview(db)


@router.get("/reports/revenue", response_model=RevenueOut, responses=AUTH_ERRORS)
def revenue(
    admin: CurrentAdmin,
    db: DbSession,
    granularity: Granularity = "month",
    basis: Basis = "calendar",
) -> RevenueOut:
    """Revenue by month, quarter, half-year or year (calendar, or financial year April-March)."""
    return admin_reports.revenue_report(db, granularity, basis)


@router.get("/subscriptions", response_model=SubscriptionsOut, responses=AUTH_ERRORS)
def subscriptions(admin: CurrentAdmin, db: DbSession) -> SubscriptionsOut:
    """Subscription counts, MRR and businesses that need attention."""
    return admin_reports.subscriptions(db)


# --------------------------------------------------------------------------- businesses


@router.get("/businesses", response_model=AdminBusinessPage, responses=AUTH_ERRORS)
def list_businesses(
    admin: CurrentAdmin,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_: Annotated[AdminStatus | None, Query(alias="status")] = None,
    sort: Annotated[str, Query(pattern="^(newest|oldest|name)$")] = "newest",
    page: Page = 1,
    page_size: PageSize = 25,
) -> AdminBusinessPage:
    """Search (name, booking page, phone, owner email) and filter all businesses."""
    return admin_service.list_businesses(db, q=q, status=status_, sort=sort, page=page, page_size=page_size)


@router.get(
    "/businesses/{business_id}",
    response_model=AdminBusinessDetail,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def get_business(business_id: int, admin: CurrentAdmin, db: DbSession) -> AdminBusinessDetail:
    """Everything about one business: owners, activity, bookings, payments and admin history."""
    return admin_service.get_business_detail(db, admin_service.get_business_or_404(db, business_id))


@router.patch(
    "/businesses/{business_id}",
    response_model=AdminBusinessDetail,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def update_business(
    business_id: int, data: AdminBusinessUpdate, request: Request, admin: CurrentAdmin, db: DbSession
) -> AdminBusinessDetail:
    """Edit profile, plan, status, trial/period dates or suspension (audited)."""
    business = admin_service.get_business_or_404(db, business_id)
    admin_service.update_business(db, admin, business, data, _ip(request))
    return admin_service.get_business_detail(db, business)


@router.post(
    "/businesses/{business_id}/extend-trial",
    response_model=AdminBusinessDetail,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def extend_trial(
    business_id: int, data: ExtendTrialIn, request: Request, admin: CurrentAdmin, db: DbSession
) -> AdminBusinessDetail:
    """Add days to the free trial."""
    business = admin_service.get_business_or_404(db, business_id)
    admin_service.extend_trial(db, admin, business, data.days, _ip(request))
    return admin_service.get_business_detail(db, business)


@router.post(
    "/businesses/{business_id}/payments",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def record_payment(
    business_id: int, data: ManualPaymentIn, request: Request, admin: CurrentAdmin, db: DbSession
) -> PaymentOut:
    """Record a payment received outside Razorpay (counts towards revenue)."""
    business = admin_service.get_business_or_404(db, business_id)
    return PaymentOut.model_validate(
        admin_service.record_manual_payment(db, admin, business, data, _ip(request))
    )


@router.post(
    "/businesses/{business_id}/users/{user_id}/reset-link",
    response_model=ResetLinkOut,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def owner_reset_link(
    business_id: int,
    user_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    admin: CurrentAdmin,
    db: DbSession,
) -> ResetLinkOut:
    """Create a password-reset link for an owner, e-mail it to them, and return it to share manually."""
    business = admin_service.get_business_or_404(db, business_id)
    result, email = admin_service.owner_reset_link(db, admin, business, user_id, _ip(request))
    background_tasks.add_task(notification_service.send_password_reset, email, result.reset_url)
    return result


@router.post(
    "/businesses/{business_id}/users/{user_id}/sign-out",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}},
)
def owner_sign_out(
    business_id: int, user_id: int, request: Request, admin: CurrentAdmin, db: DbSession
) -> Response:
    """Sign an owner out of every device."""
    business = admin_service.get_business_or_404(db, business_id)
    admin_service.owner_sign_out(db, admin, business, user_id, _ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/businesses/{business_id}/view-as",
    response_model=ViewAsOut,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}, 409: {"model": ErrorOut}},
)
def view_as_owner(business_id: int, request: Request, admin: CurrentAdmin, db: DbSession) -> ViewAsOut:
    """Open the owner app as this business's owner, read-only, for 15 minutes (audited)."""
    business = admin_service.get_business_or_404(db, business_id)
    return admin_service.view_as_owner(db, admin, business, _ip(request))


@router.delete(
    "/businesses/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={**AUTH_ERRORS, 400: {"model": ErrorOut}, 404: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
def delete_business(
    business_id: int, data: AdminDeleteBusinessIn, request: Request, admin: CurrentAdmin, db: DbSession
) -> Response:
    """Permanently delete a business and all of its data (payments and audit history are kept)."""
    business = admin_service.get_business_or_404(db, business_id)
    admin_service.delete_business(db, admin, business, data.confirm, _ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- payments


@router.get("/payments", response_model=PaymentPage, responses=AUTH_ERRORS)
def list_payments(
    admin: CurrentAdmin,
    db: DbSession,
    business_id: int | None = None,
    source: Annotated[str | None, Query(pattern=f"^({'|'.join(PAYMENT_SOURCES)})$")] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: Page = 1,
    page_size: PageSize = 50,
) -> PaymentPage:
    """All payments (Razorpay and manual), newest first."""
    return admin_service.list_payments(
        db,
        page=page,
        page_size=page_size,
        business_id=business_id,
        source=source,
        date_from=date_from,
        date_to=date_to,
    )


@router.delete(
    "/payments/{payment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={**AUTH_ERRORS, 400: {"model": ErrorOut}, 404: {"model": ErrorOut}},
)
def delete_payment(payment_id: int, request: Request, admin: CurrentAdmin, db: DbSession) -> Response:
    """Remove a manually recorded payment."""
    admin_service.delete_manual_payment(db, admin, payment_id, _ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- bookings


@router.get("/appointments", response_model=list[AdminAppointmentOut], responses=AUTH_ERRORS)
def search_appointments(
    admin: CurrentAdmin,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_: Annotated[
        str | None, Query(alias="status", pattern="^(booked|completed|cancelled|no_show)$")
    ] = None,
    business_id: int | None = None,
) -> list[AdminAppointmentOut]:
    """Find bookings across all businesses by booking ID, customer phone or name."""
    return admin_service.search_appointments(db, q=q, status=status_, business_id=business_id)


@router.patch(
    "/appointments/{appointment_id}",
    response_model=AdminAppointmentOut,
    responses={**AUTH_ERRORS, 404: {"model": ErrorOut}, 409: {"model": ErrorOut}},
)
def update_appointment(
    appointment_id: int, data: AdminAppointmentUpdate, request: Request, admin: CurrentAdmin, db: DbSession
) -> AdminAppointmentOut:
    """Change a booking's status on a business's behalf (audited)."""
    return admin_service.update_appointment_status(db, admin, appointment_id, data.status, _ip(request))


# --------------------------------------------------------------------------- audit


@router.get("/audit", response_model=AuditPage, responses=AUTH_ERRORS)
def audit_log(
    admin: CurrentAdmin,
    db: DbSession,
    business_id: int | None = None,
    action: Annotated[str | None, Query(max_length=60)] = None,
    page: Page = 1,
    page_size: PageSize = 50,
) -> AuditPage:
    """Every admin action, newest first."""
    return admin_service.list_audit(
        db, page=page, page_size=page_size, business_id=business_id, action=action
    )

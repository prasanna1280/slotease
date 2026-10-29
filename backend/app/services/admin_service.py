"""Platform admin: sign-in with 2FA, business management, bookings, payments and the audit log.

Every change an admin makes is written to ``admin_audit_logs`` in the same transaction.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import totp
from app.auth.security import (
    TOKEN_TYPE_ADMIN_CHALLENGE,
    VIEW_AS_MINUTES,
    create_admin_challenge_token,
    create_admin_token,
    create_password_reset_token,
    create_view_as_token,
    decode_token,
    verify_password,
)
from app.config import settings
from app.exceptions import AppError, ConflictError, NotFoundError, SlotTakenError, UnauthorizedError
from app.models import (
    AdminAuditLog,
    AdminUser,
    Appointment,
    Business,
    Customer,
    Payment,
    RefreshToken,
    Service,
    User,
)
from app.schemas.admin import (
    AdminAppointmentOut,
    AdminBusinessDetail,
    AdminBusinessPage,
    AdminBusinessRow,
    AdminBusinessStats,
    AdminBusinessUpdate,
    AdminLoginOut,
    AdminOut,
    AdminOwnerOut,
    AdminSessionOut,
    AdminStatus,
    AuditOut,
    AuditPage,
    ManualPaymentIn,
    PaymentOut,
    PaymentPage,
    ResetLinkOut,
    ViewAsOut,
)
from app.services import business_service
from app.services.auth_service import _dummy_password_hash, build_reset_url, revoke_all_refresh_tokens
from app.services.time_utils import get_tz, local_day_bounds, now_utc, to_local

logger = logging.getLogger(__name__)

MAX_PAGE_SIZE = 100
APPOINTMENT_SEARCH_LIMIT = 50


class InvalidCodeError(UnauthorizedError):
    """401 INVALID_CODE - the authenticator code did not match."""

    code = "INVALID_CODE"
    message = "That code is not valid. Check your authenticator app and try again."


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


def audit(
    db: Session,
    admin: AdminUser,
    action: str,
    summary: str,
    *,
    business_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Add an audit-log entry for ``admin`` (committed by the caller with the change itself)."""
    db.add(
        AdminAuditLog(
            admin_id=admin.id,
            admin_email=admin.email,
            action=action,
            business_id=business_id,
            target_type=target_type,
            target_id=target_id,
            summary=summary[:255],
            details=details or {},
            ip_address=ip,
        )
    )


def _jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def list_audit(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    business_id: int | None = None,
    action: str | None = None,
) -> AuditPage:
    """Newest-first audit entries, optionally for one business or action."""
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    conditions: list[ColumnElement[bool]] = []
    if business_id is not None:
        conditions.append(AdminAuditLog.business_id == business_id)
    if action:
        conditions.append(AdminAuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(AdminAuditLog).where(*conditions)) or 0
    rows = db.scalars(
        select(AdminAuditLog)
        .where(*conditions)
        .order_by(AdminAuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return AuditPage(
        items=[AuditOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size
    )


# ---------------------------------------------------------------------------
# Sign-in (password, then TOTP)
# ---------------------------------------------------------------------------


def login(db: Session, email: str, password: str) -> AdminLoginOut:
    """Check the password; return a challenge for the 2FA step (with a new secret if not enrolled).

    Raises:
        UnauthorizedError: 401 ``INVALID_CREDENTIALS`` for an unknown/inactive admin or wrong password.
    """
    admin = db.scalars(select(AdminUser).where(AdminUser.email == email.strip().lower())).first()
    if admin is None:
        verify_password(password, _dummy_password_hash())  # comparable timing for unknown e-mails
        raise UnauthorizedError("Invalid email or password.", code="INVALID_CREDENTIALS")
    if not verify_password(password, admin.password_hash) or not admin.is_active:
        raise UnauthorizedError("Invalid email or password.", code="INVALID_CREDENTIALS")

    if admin.totp_secret:
        token = create_admin_challenge_token(admin.id, admin.session_version, setup=False)
        return AdminLoginOut(step="totp", challenge_token=token)

    secret = totp.generate_secret()
    admin.totp_pending_secret = secret
    db.commit()
    token = create_admin_challenge_token(admin.id, admin.session_version, setup=True)
    return AdminLoginOut(
        step="setup",
        challenge_token=token,
        secret=secret,
        otpauth_uri=totp.provisioning_uri(secret, admin.email),
    )


def verify(db: Session, challenge_token: str, code: str, ip: str | None) -> AdminSessionOut:
    """Check the 2FA code for a challenge and start an admin session.

    Raises:
        UnauthorizedError: ``INVALID_TOKEN`` for a bad/expired challenge, ``INVALID_CODE`` for a wrong code.
    """
    payload = decode_token(challenge_token, TOKEN_TYPE_ADMIN_CHALLENGE)
    try:
        admin_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid or expired token.", code="INVALID_TOKEN") from exc
    admin = db.get(AdminUser, admin_id)
    if admin is None or not admin.is_active or payload.get("sv") != admin.session_version:
        raise UnauthorizedError("Invalid or expired token.", code="INVALID_TOKEN")

    if payload.get("setup"):
        if not admin.totp_pending_secret:
            raise UnauthorizedError("Invalid or expired token.", code="INVALID_TOKEN")
        step = totp.verify(admin.totp_pending_secret, code)
        if step is None:
            raise InvalidCodeError()
        admin.totp_secret = admin.totp_pending_secret
        admin.totp_pending_secret = None
        audit(db, admin, "admin.2fa_enrolled", "Set up two-step sign-in", ip=ip)
    else:
        if not admin.totp_secret:
            raise UnauthorizedError("Invalid or expired token.", code="INVALID_TOKEN")
        step = totp.verify(admin.totp_secret, code, last_step=admin.totp_last_step)
        if step is None:
            raise InvalidCodeError()

    admin.totp_last_step = step
    admin.last_login_at = now_utc()
    audit(db, admin, "admin.sign_in", "Signed in", ip=ip)
    db.commit()
    db.refresh(admin)
    return AdminSessionOut(
        access_token=create_admin_token(admin.id, admin.session_version),
        expires_in=settings.ADMIN_TOKEN_EXPIRE_MINUTES * 60,
        admin=AdminOut.model_validate(admin),
    )


# ---------------------------------------------------------------------------
# Business status
# ---------------------------------------------------------------------------


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def derive_status(business: Business, now: datetime) -> AdminStatus:
    """One status for admin screens: suspension wins, and an ended trial shows as ``trial_expired``."""
    if business.is_suspended:
        return "suspended"
    status = business.subscription_status
    if status == "trialing":
        trial_end = _aware(business.trial_ends_at)
        return "trialing" if trial_end is not None and trial_end > now else "trial_expired"
    if status in ("active", "past_due", "cancelled", "expired"):
        return status  # type: ignore[return-value]
    return "expired"


def status_filter(status: str, now: datetime) -> ColumnElement[bool]:
    """SQL condition matching :func:`derive_status` == ``status``."""
    not_suspended = Business.is_suspended.is_(False)
    if status == "suspended":
        return Business.is_suspended.is_(True)
    if status == "trialing":
        return and_(not_suspended, Business.subscription_status == "trialing", Business.trial_ends_at > now)
    if status == "trial_expired":
        return and_(
            not_suspended,
            Business.subscription_status == "trialing",
            or_(Business.trial_ends_at.is_(None), Business.trial_ends_at <= now),
        )
    return and_(not_suspended, Business.subscription_status == status)


# ---------------------------------------------------------------------------
# Business lists
# ---------------------------------------------------------------------------


def row_select() -> Select[Any]:
    """Businesses with owner, activity counts and revenue as correlated subqueries."""
    appointments = (
        select(func.count(Appointment.id)).where(Appointment.business_id == Business.id).scalar_subquery()
    )
    customers = select(func.count(Customer.id)).where(Customer.business_id == Business.id).scalar_subquery()
    last_booking = (
        select(func.max(Appointment.created_at))
        .where(Appointment.business_id == Business.id)
        .scalar_subquery()
    )
    revenue = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.business_id == Business.id)
        .scalar_subquery()
    )
    owner_email = (
        select(User.email).where(User.business_id == Business.id).order_by(User.id).limit(1).scalar_subquery()
    )
    owner_name = (
        select(User.full_name)
        .where(User.business_id == Business.id)
        .order_by(User.id)
        .limit(1)
        .scalar_subquery()
    )
    return select(
        Business,
        appointments.label("appointments_count"),
        customers.label("customers_count"),
        last_booking.label("last_booking_at"),
        revenue.label("revenue_total"),
        owner_email.label("owner_email"),
        owner_name.label("owner_name"),
    )


def _to_row(record: Any, now: datetime) -> AdminBusinessRow:
    business: Business = record[0]
    return AdminBusinessRow(
        id=business.id,
        name=business.name,
        slug=business.slug,
        phone=business.phone,
        owner_name=record.owner_name,
        owner_email=record.owner_email,
        plan=business.plan,
        subscription_status=business.subscription_status,
        status=derive_status(business, now),
        is_suspended=business.is_suspended,
        trial_ends_at=business.trial_ends_at,
        current_period_end=business.current_period_end,
        created_at=business.created_at,
        appointments_count=record.appointments_count or 0,
        customers_count=record.customers_count or 0,
        last_booking_at=_aware(record.last_booking_at),
        revenue_total=Decimal(record.revenue_total or 0).quantize(Decimal("0.01")),
    )


def business_rows(db: Session, stmt: Select[Any], now: datetime) -> list[AdminBusinessRow]:
    """Run a statement built on :func:`row_select` and convert the rows."""
    return [_to_row(r, now) for r in db.execute(stmt).all()]


SORTS = {
    "newest": Business.created_at.desc(),
    "oldest": Business.created_at.asc(),
    "name": func.lower(Business.name).asc(),
}


def list_businesses(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 25,
) -> AdminBusinessPage:
    """Search and filter all businesses."""
    now = now_utc()
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    conditions: list[ColumnElement[bool]] = []
    if q and q.strip():
        term = q.strip()
        owner_match = exists().where(
            User.business_id == Business.id, User.email.icontains(term, autoescape=True)
        )
        conditions.append(
            or_(
                Business.name.icontains(term, autoescape=True),
                Business.slug.icontains(term, autoescape=True),
                Business.phone.icontains(term, autoescape=True),
                owner_match,
            )
        )
    if status:
        conditions.append(status_filter(status, now))
    total = db.scalar(select(func.count()).select_from(Business).where(*conditions)) or 0
    stmt = (
        row_select()
        .where(*conditions)
        .order_by(SORTS.get(sort, SORTS["newest"]), Business.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return AdminBusinessPage(items=business_rows(db, stmt, now), total=total, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# Business detail and actions
# ---------------------------------------------------------------------------


def get_business_or_404(db: Session, business_id: int) -> Business:
    """Return the business or raise 404."""
    business = db.get(Business, business_id)
    if business is None:
        raise NotFoundError("Business not found.", code="BUSINESS_NOT_FOUND")
    return business


def appointment_to_admin(appt: Appointment) -> AdminAppointmentOut:
    """Admin view of an appointment (relations must be loaded), times in the business's timezone."""
    tz = get_tz(appt.business.timezone)
    return AdminAppointmentOut(
        id=appt.id,
        reference=appt.reference,
        business_id=appt.business_id,
        business_name=appt.business.name,
        business_slug=appt.business.slug,
        business_timezone=appt.business.timezone,
        service_name=appt.service.name,
        customer_name=appt.customer.name,
        customer_phone=appt.customer.phone,
        customer_email=appt.customer.email,
        start_time=to_local(appt.start_time, tz),
        end_time=to_local(appt.end_time, tz),
        status=appt.status,
        price=appt.price,
        source=appt.source,
        notes=appt.notes,
        created_at=appt.created_at,
    )


def _appointments_query() -> Select[Appointment]:
    return select(Appointment).options(
        joinedload(Appointment.business), joinedload(Appointment.service), joinedload(Appointment.customer)
    )


def get_business_detail(db: Session, business: Business) -> AdminBusinessDetail:
    """Full admin view of one business."""
    now = now_utc()
    bid = business.id

    def count(*conditions: ColumnElement[bool]) -> int:
        return (
            db.scalar(select(func.count(Appointment.id)).where(Appointment.business_id == bid, *conditions))
            or 0
        )

    owners = db.scalars(select(User).where(User.business_id == bid).order_by(User.id)).all()
    owner_out = []
    for user in owners:
        sessions = (
            db.scalar(
                select(func.count(RefreshToken.id)).where(
                    RefreshToken.user_id == user.id,
                    RefreshToken.revoked_at.is_(None),
                    RefreshToken.expires_at > now,
                )
            )
            or 0
        )
        owner_out.append(
            AdminOwnerOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
                active_sessions=sessions,
            )
        )

    revenue = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.business_id == bid))
    stats = AdminBusinessStats(
        services=db.scalar(select(func.count(Service.id)).where(Service.business_id == bid)) or 0,
        customers=db.scalar(select(func.count(Customer.id)).where(Customer.business_id == bid)) or 0,
        appointments_total=count(),
        appointments_upcoming=count(Appointment.status == "booked", Appointment.start_time >= now),
        completed=count(Appointment.status == "completed"),
        no_shows=count(Appointment.status == "no_show"),
        cancelled=count(Appointment.status == "cancelled"),
        last_booking_at=_aware(
            db.scalar(select(func.max(Appointment.created_at)).where(Appointment.business_id == bid))
        ),
        revenue_total=Decimal(revenue or 0).quantize(Decimal("0.01")),
    )
    recent = db.scalars(
        _appointments_query()
        .where(Appointment.business_id == bid)
        .order_by(Appointment.start_time.desc())
        .limit(10)
    ).all()
    payments = db.scalars(
        select(Payment).where(Payment.business_id == bid).order_by(Payment.paid_at.desc()).limit(50)
    ).all()
    audit_rows = db.scalars(
        select(AdminAuditLog)
        .where(AdminAuditLog.business_id == bid)
        .order_by(AdminAuditLog.id.desc())
        .limit(20)
    ).all()
    return AdminBusinessDetail(
        id=business.id,
        name=business.name,
        slug=business.slug,
        phone=business.phone,
        email=business.email,
        address=business.address,
        timezone=business.timezone,
        plan=business.plan,
        subscription_status=business.subscription_status,
        status=derive_status(business, now),
        is_suspended=business.is_suspended,
        is_bookable=business.is_bookable,
        trial_ends_at=business.trial_ends_at,
        current_period_end=business.current_period_end,
        razorpay_subscription_id=business.razorpay_subscription_id,
        created_at=business.created_at,
        owners=owner_out,
        stats=stats,
        recent_appointments=[appointment_to_admin(a) for a in recent],
        payments=[PaymentOut.model_validate(p) for p in payments],
        audit=[AuditOut.model_validate(a) for a in audit_rows],
    )


def update_business(
    db: Session, admin: AdminUser, business: Business, data: AdminBusinessUpdate, ip: str | None
) -> Business:
    """Apply admin edits and record a before/after audit entry. Unchanged fields are not logged."""
    changes: dict[str, dict[str, Any]] = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in ("name", "phone") and value is None:
            raise AppError(f"{field.capitalize()} cannot be empty.", code="VALIDATION_ERROR")
        current = getattr(business, field)
        if field in ("trial_ends_at", "current_period_end"):
            current = _aware(current)
        if current != value:
            changes[field] = {"from": _jsonable(current), "to": _jsonable(value)}
            setattr(business, field, value)
    if not changes:
        return business
    if "is_suspended" in changes:
        action = "business.suspended" if business.is_suspended else "business.unsuspended"
        summary = f"{'Suspended' if business.is_suspended else 'Reactivated'} {business.name}"
    else:
        action = "business.updated"
        summary = f"Updated {business.name}: {', '.join(sorted(changes))}"
    audit(
        db,
        admin,
        action,
        summary,
        business_id=business.id,
        target_type="business",
        target_id=business.id,
        details=changes,
        ip=ip,
    )
    db.commit()
    db.refresh(business)
    return business


def extend_trial(db: Session, admin: AdminUser, business: Business, days: int, ip: str | None) -> Business:
    """Add ``days`` to the trial (counting from now if it already ended) and put it back on trial."""
    now = now_utc()
    current = _aware(business.trial_ends_at)
    base = current if current is not None and current > now else now
    new_end = base + timedelta(days=days)
    details = {
        "trial_ends_at": {"from": _jsonable(current), "to": _jsonable(new_end)},
        "days": days,
    }
    business.trial_ends_at = new_end
    if business.subscription_status == "expired":
        details["subscription_status"] = {"from": "expired", "to": "trialing"}
        business.subscription_status = "trialing"
    audit(
        db,
        admin,
        "business.trial_extended",
        f"Extended {business.name}'s trial by {days} days",
        business_id=business.id,
        target_type="business",
        target_id=business.id,
        details=details,
        ip=ip,
    )
    db.commit()
    db.refresh(business)
    return business


def delete_business(db: Session, admin: AdminUser, business: Business, confirm: str, ip: str | None) -> None:
    """Delete a business and all of its data (``confirm`` must be its slug)."""
    if confirm.strip().lower() != business.slug:
        raise AppError(
            "Type the business's booking page name exactly to confirm.", code="CONFIRMATION_MISMATCH"
        )
    name, slug, business_id = business.name, business.slug, business.id
    audit(
        db,
        admin,
        "business.deleted",
        f"Deleted {name} ({slug}) and all of its data",
        target_type="business",
        target_id=business_id,
        details={"name": name, "slug": slug},
        ip=ip,
    )
    business_service.purge_business(db, business)
    db.commit()
    db.expunge_all()
    logger.info("Admin id=%s deleted business id=%s", admin.id, business_id)


def _owner_or_404(db: Session, business: Business, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.business_id != business.id:
        raise NotFoundError("User not found.", code="USER_NOT_FOUND")
    return user


def owner_reset_link(
    db: Session, admin: AdminUser, business: Business, user_id: int, ip: str | None
) -> tuple[ResetLinkOut, str]:
    """Create a password-reset link for an owner. Returns the response and the e-mail to send it to."""
    user = _owner_or_404(db, business, user_id)
    url = build_reset_url(create_password_reset_token(user))
    audit(
        db,
        admin,
        "owner.reset_link",
        f"Created a password reset link for {user.email}",
        business_id=business.id,
        target_type="user",
        target_id=user.id,
        ip=ip,
    )
    db.commit()
    return ResetLinkOut(reset_url=url, expires_minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES), user.email


def owner_sign_out(db: Session, admin: AdminUser, business: Business, user_id: int, ip: str | None) -> None:
    """Revoke every session (refresh token) of an owner."""
    user = _owner_or_404(db, business, user_id)
    revoke_all_refresh_tokens(db, user.id)
    audit(
        db,
        admin,
        "owner.signed_out",
        f"Signed {user.email} out of all devices",
        business_id=business.id,
        target_type="user",
        target_id=user.id,
        ip=ip,
    )
    db.commit()


def view_as_owner(db: Session, admin: AdminUser, business: Business, ip: str | None) -> ViewAsOut:
    """Start a read-only session as the business's owner (audited).

    Raises:
        ConflictError: 409 ``NO_ACTIVE_OWNER`` when the business has no active owner login.
    """
    owner = db.scalars(
        select(User)
        .where(User.business_id == business.id, User.is_active.is_(True))
        .order_by((User.role == "owner").desc(), User.id)
    ).first()
    if owner is None:
        raise ConflictError("This business has no active owner login to view.", code="NO_ACTIVE_OWNER")
    audit(
        db,
        admin,
        "owner.viewed_as",
        f"Viewed {business.name} as {owner.email} (read-only)",
        business_id=business.id,
        target_type="user",
        target_id=owner.id,
        ip=ip,
    )
    db.commit()
    return ViewAsOut(
        access_token=create_view_as_token(owner.id, business.id, admin.id, admin.session_version),
        expires_in=VIEW_AS_MINUTES * 60,
        business_name=business.name,
        owner_email=owner.email,
    )


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------


def record_manual_payment(
    db: Session, admin: AdminUser, business: Business, data: ManualPaymentIn, ip: str | None
) -> Payment:
    """Add a payment received outside Razorpay to the revenue ledger."""
    payment = Payment(
        business_id=business.id,
        business_name=business.name,
        source="manual",
        amount=data.amount,
        currency="INR",
        paid_at=data.paid_at or now_utc(),
        note=(data.note or "").strip() or None,
        recorded_by_admin_id=admin.id,
    )
    db.add(payment)
    db.flush()
    audit(
        db,
        admin,
        "payment.recorded",
        f"Recorded a manual payment of Rs {data.amount} from {business.name}",
        business_id=business.id,
        target_type="payment",
        target_id=payment.id,
        details={"amount": str(data.amount), "paid_at": _jsonable(payment.paid_at), "note": payment.note},
        ip=ip,
    )
    db.commit()
    db.refresh(payment)
    return payment


def delete_manual_payment(db: Session, admin: AdminUser, payment_id: int, ip: str | None) -> None:
    """Remove a manually recorded payment (Razorpay payments cannot be removed)."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.", code="PAYMENT_NOT_FOUND")
    if payment.source != "manual":
        raise AppError("Only manually recorded payments can be removed.", code="PAYMENT_NOT_MANUAL")
    audit(
        db,
        admin,
        "payment.removed",
        f"Removed a manual payment of Rs {payment.amount} from {payment.business_name}",
        business_id=payment.business_id,
        target_type="payment",
        target_id=payment.id,
        details={"amount": str(payment.amount), "paid_at": _jsonable(payment.paid_at), "note": payment.note},
        ip=ip,
    )
    db.delete(payment)
    db.commit()


def list_payments(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    business_id: int | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> PaymentPage:
    """Payments, newest first; dates are whole days in the admin report timezone."""
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    tz = get_tz(settings.ADMIN_REPORT_TIMEZONE)
    conditions: list[ColumnElement[bool]] = []
    if business_id is not None:
        conditions.append(Payment.business_id == business_id)
    if source:
        conditions.append(Payment.source == source)
    if date_from is not None:
        conditions.append(Payment.paid_at >= local_day_bounds(date_from, tz)[0])
    if date_to is not None:
        conditions.append(Payment.paid_at < local_day_bounds(date_to, tz)[1])
    total = db.scalar(select(func.count()).select_from(Payment).where(*conditions)) or 0
    amount = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(*conditions))
    rows = db.scalars(
        select(Payment)
        .where(*conditions)
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaymentPage(
        items=[PaymentOut.model_validate(p) for p in rows],
        total=total,
        total_amount=Decimal(amount or 0).quantize(Decimal("0.01")),
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# Bookings (appointments across all businesses)
# ---------------------------------------------------------------------------


def search_appointments(
    db: Session, *, q: str | None = None, status: str | None = None, business_id: int | None = None
) -> list[AdminAppointmentOut]:
    """Find appointments by booking ID, customer phone or name (newest first, at most 50)."""
    stmt = _appointments_query().join(Appointment.customer)
    if q and q.strip():
        term = q.strip()
        digits = "".join(ch for ch in term if ch.isdigit())
        options: list[ColumnElement[bool]] = [
            Appointment.reference.icontains(term, autoescape=True),
            Customer.name.icontains(term, autoescape=True),
        ]
        if len(digits) >= 4:
            options.append(Customer.phone.contains(digits, autoescape=True))
        stmt = stmt.where(or_(*options))
    if status:
        stmt = stmt.where(Appointment.status == status)
    if business_id is not None:
        stmt = stmt.where(Appointment.business_id == business_id)
    rows = (
        db.scalars(stmt.order_by(Appointment.start_time.desc()).limit(APPOINTMENT_SEARCH_LIMIT))
        .unique()
        .all()
    )
    return [appointment_to_admin(a) for a in rows]


def update_appointment_status(
    db: Session, admin: AdminUser, appointment_id: int, status: str, ip: str | None
) -> AdminAppointmentOut:
    """Set an appointment's status on behalf of a business.

    Raises:
        NotFoundError: 404 for an unknown appointment.
        SlotTakenError: 409 when re-activating a cancelled booking whose time is now taken.
    """
    appt = db.scalars(_appointments_query().where(Appointment.id == appointment_id)).first()
    if appt is None:
        raise NotFoundError("Appointment not found.", code="APPOINTMENT_NOT_FOUND")
    previous = appt.status
    if previous == status:
        return appointment_to_admin(appt)
    appt.status = status
    audit(
        db,
        admin,
        "appointment.status_changed",
        f"Changed {appt.reference or appt.id} at {appt.business.name} from {previous} to {status}",
        business_id=appt.business_id,
        target_type="appointment",
        target_id=appt.id,
        details={"status": {"from": previous, "to": status}},
        ip=ip,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise SlotTakenError() from exc
    db.refresh(appt)
    return appointment_to_admin(appt)

"""Business (tenant) profile logic: slug rules and profile/booking-rule updates."""

from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import verify_password
from app.exceptions import AppError, ConflictError, ForbiddenError, ValidationAppError
from app.models import (
    Appointment,
    Business,
    Customer,
    PaymentEvent,
    RefreshToken,
    Service,
    User,
    WorkingHours,
)
from app.schemas.business import BusinessDeleteIn, BusinessUpdate
from app.services import billing_service
from app.services.validators import SLUG_MAX_LENGTH, is_reserved_slug, slugify

logger = logging.getLogger(__name__)

MAX_SLUG_ATTEMPTS = 1000


def slug_exists(db: Session, slug: str, *, exclude_business_id: int | None = None) -> bool:
    """Return True if another business already uses ``slug``."""
    stmt = select(Business.id).where(Business.slug == slug)
    if exclude_business_id is not None:
        stmt = stmt.where(Business.id != exclude_business_id)
    return db.scalar(stmt.limit(1)) is not None


def ensure_slug_available(db: Session, slug: str, *, exclude_business_id: int | None = None) -> None:
    """Check a (format-validated) slug is neither reserved nor taken.

    Raises:
        ValidationAppError: 422 ``SLUG_RESERVED``.
        ConflictError: 409 ``SLUG_TAKEN``.
    """
    if is_reserved_slug(slug):
        raise ValidationAppError(
            "This booking link is reserved. Please choose another.", code="SLUG_RESERVED"
        )
    if slug_exists(db, slug, exclude_business_id=exclude_business_id):
        raise ConflictError("This booking link is already taken.", code="SLUG_TAKEN")


def generate_unique_slug(db: Session, name: str) -> str:
    """Derive a free, non-reserved slug from ``name`` (``glow-salon``, ``glow-salon-2``, ...)."""
    base = slugify(name)
    if not is_reserved_slug(base) and not slug_exists(db, base):
        return base
    for n in range(2, MAX_SLUG_ATTEMPTS):
        suffix = f"-{n}"
        candidate = f"{base[: SLUG_MAX_LENGTH - len(suffix)].rstrip('-')}{suffix}"
        if not is_reserved_slug(candidate) and not slug_exists(db, candidate):
            return candidate
    raise ConflictError("Could not generate a booking link. Please choose one.", code="SLUG_TAKEN")


def update_business(db: Session, business: Business, data: BusinessUpdate) -> Business:
    """Apply a partial update to the current user's business.

    Raises:
        ValidationAppError: 422 ``SLUG_RESERVED``.
        ConflictError: 409 ``SLUG_TAKEN``.
    """
    changes = data.model_dump(exclude_unset=True)
    new_slug = changes.get("slug")
    if new_slug is not None and new_slug != business.slug:
        ensure_slug_available(db, new_slug, exclude_business_id=business.id)
    elif new_slug is not None:
        changes.pop("slug")

    for field, value in changes.items():
        setattr(business, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("This booking link is already taken.", code="SLUG_TAKEN") from exc
    db.refresh(business)
    return business


def delete_business(db: Session, business: Business, user: User, data: BusinessDeleteIn) -> None:
    """Permanently delete the business and everything it owns (owner only).

    Cancels a live Razorpay subscription first, then removes appointments, customers, services,
    working hours, payment events, users and their sessions, and the business, in one transaction.

    Raises:
        ForbiddenError: 403 when the user is not the business owner.
        AppError: 400 ``INVALID_PASSWORD`` for a wrong password, 400 ``CONFIRMATION_MISMATCH`` when
            ``confirm`` is not the business's slug.
        ServiceUnavailableError: 503 if the subscription cannot be cancelled with Razorpay.
    """
    if user.role != "owner":
        raise ForbiddenError("Only the business owner can delete the account.")
    if not verify_password(data.password, user.password_hash):
        raise AppError("Password is incorrect.", code="INVALID_PASSWORD")
    if data.confirm.strip().lower() != business.slug:
        raise AppError("Type your booking page name exactly to confirm.", code="CONFIRMATION_MISMATCH")

    business_id = business.id
    purge_business(db, business)
    db.commit()
    db.expunge_all()
    logger.info("Deleted business id=%s and all of its data at the owner's request", business_id)


def purge_business(db: Session, business: Business) -> None:
    """Cancel a live subscription, then delete the business and all of its data (caller commits).

    Payments and admin audit entries are kept, unlinked from the business (``SET NULL``), so revenue
    history and the audit trail stay complete.

    Raises:
        ServiceUnavailableError: 503 if the subscription cannot be cancelled with Razorpay.
    """
    billing_service.cancel_for_deletion(business)

    business_id = business.id
    user_ids = select(User.id).where(User.business_id == business_id)
    # Explicit order: appointments reference services and customers with ON DELETE RESTRICT.
    db.execute(delete(Appointment).where(Appointment.business_id == business_id))
    db.execute(delete(Customer).where(Customer.business_id == business_id))
    db.execute(delete(Service).where(Service.business_id == business_id))
    db.execute(delete(WorkingHours).where(WorkingHours.business_id == business_id))
    db.execute(delete(PaymentEvent).where(PaymentEvent.business_id == business_id))
    db.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
    db.execute(delete(User).where(User.business_id == business_id))
    db.execute(delete(Business).where(Business.id == business_id))

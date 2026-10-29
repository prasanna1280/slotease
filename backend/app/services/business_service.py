"""Business (tenant) profile logic: slug rules and profile/booking-rule updates."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import ConflictError, ValidationAppError
from app.models import Business
from app.schemas.business import BusinessUpdate
from app.services.validators import SLUG_MAX_LENGTH, is_reserved_slug, slugify

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

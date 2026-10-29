"""Public (no auth) booking page: business info, services, free slots, bookings (``/api/v1/public``)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import DbSession
from app.exceptions import BusinessInactiveError, NotFoundError
from app.models import Business
from app.rate_limit import limiter
from app.schemas.public import (
    BookingConfirmationOut,
    BookingCreate,
    PublicBusinessOut,
    PublicServiceOut,
    SlotOut,
    SlotsOut,
)
from app.services import booking_service, catalog_service, notification_service, slot_service
from app.services.time_utils import to_local

router = APIRouter(prefix="/public", tags=["Public"])


def _get_business(db: Session, slug: str) -> Business:
    """Return the business by slug or raise 404 ``BUSINESS_NOT_FOUND``."""
    business = db.scalars(select(Business).where(Business.slug == slug.strip().lower())).first()
    if business is None:
        raise NotFoundError("Business not found.", code="BUSINESS_NOT_FOUND")
    return business


def _get_bookable_business(db: Session, slug: str) -> Business:
    """Like :func:`_get_business` but raise 403 ``BUSINESS_INACTIVE`` when bookings are paused."""
    business = _get_business(db, slug)
    if not business.is_bookable:
        raise BusinessInactiveError()
    return business


@router.get("/{slug}", response_model=PublicBusinessOut, summary="Public business info")
def get_public_business(db: DbSession, slug: str) -> PublicBusinessOut:
    """Return the booking-page header data."""
    return PublicBusinessOut.model_validate(_get_business(db, slug))


@router.get("/{slug}/services", response_model=list[PublicServiceOut], summary="Active services")
def list_public_services(db: DbSession, slug: str) -> list[PublicServiceOut]:
    """Return the business's active services ordered by name."""
    business = _get_business(db, slug)
    return [PublicServiceOut.model_validate(s) for s in catalog_service.list_services(db, business.id)]


@router.get("/{slug}/slots", response_model=SlotsOut, summary="Free slots for a service on a day")
@limiter.limit("60/minute")
def get_slots(
    request: Request,
    db: DbSession,
    slug: str,
    service_id: int = Query(gt=0),
    date: date = Query(),
) -> SlotsOut:
    """Return free slots (``[]`` for past days or beyond the booking window)."""
    business = _get_bookable_business(db, slug)
    service = catalog_service.get_service(db, business.id, service_id, active_only=True)
    tz = slot_service.business_tz(business)
    slots = slot_service.compute_free_slots(db, business, service, date)
    return SlotsOut(
        date=date,
        timezone=business.timezone,
        service_id=service.id,
        duration_min=service.duration_min,
        slots=[
            SlotOut(
                start_time=to_local(s.start, tz),
                end_time=to_local(s.end, tz),
                label=f"{to_local(s.start, tz):%H:%M}",
            )
            for s in slots
        ],
    )


@router.post(
    "/{slug}/bookings",
    response_model=BookingConfirmationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Book a slot",
)
@limiter.limit("10/minute")
def create_public_booking(
    request: Request,
    db: DbSession,
    slug: str,
    body: BookingCreate,
    background_tasks: BackgroundTasks,
) -> BookingConfirmationOut:
    """Create an online booking (409 ``SLOT_TAKEN`` if taken, 422 ``INVALID_SLOT`` if not offered)."""
    business = _get_bookable_business(db, slug)
    appointment = booking_service.create_booking(db, business, body, source="online")
    background_tasks.add_task(notification_service.send_booking_confirmation, appointment.id)
    return booking_service.confirmation_out(appointment, business)

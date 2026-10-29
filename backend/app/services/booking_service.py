"""Concurrency-safe booking (PRP "Booking" steps 1-9).

Double bookings are prevented in three layers: the tenant row lock (``SELECT ... FOR UPDATE`` on the
business, a no-op on SQLite), an explicit overlap re-check inside the transaction, and finally the DB
constraints (partial unique index on ``(business_id, start_time)`` everywhere + the Postgres EXCLUDE
constraint), whose ``IntegrityError`` is mapped to 409 ``SLOT_TAKEN``.
"""

from __future__ import annotations

import logging
from datetime import UTC, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions import AppError, SlotTakenError, ValidationAppError
from app.models import Appointment, Business, Customer
from app.schemas.public import BookingConfirmationOut, BookingCreate
from app.services.catalog_service import get_service
from app.services.slot_service import (
    booked_intervals,
    business_tz,
    is_day_bookable_online,
    is_within_working_hours,
)
from app.services.time_utils import format_human, now_utc, to_local

logger = logging.getLogger(__name__)

INVALID_SLOT = "INVALID_SLOT"
OUTSIDE_HOURS_MESSAGE = "This time is outside the business's working hours."
TOO_SOON_MESSAGE = "This time is too soon to book online. Please pick a later slot."
OUTSIDE_WINDOW_MESSAGE = "This date is outside the online booking window."


def create_booking(
    db: Session, business: Business, data: BookingCreate, *, source: Literal["online", "owner"]
) -> Appointment:
    """Book ``data`` for ``business`` in one transaction and return the committed appointment.

    ``source="online"`` additionally enforces minimum notice and the booking window.

    Raises:
        NotFoundError: 404 ``SERVICE_NOT_FOUND`` (unknown, inactive or another tenant's service).
        ValidationAppError: 422 ``INVALID_SLOT``.
        SlotTakenError: 409 ``SLOT_TAKEN`` when the time overlaps a non-cancelled appointment.
    """
    # 1. Active service of this business.
    service = get_service(db, business.id, data.service_id, active_only=True)
    # 2. UTC bounds.
    start_utc = data.start_time.astimezone(UTC)
    end_utc = start_utc + timedelta(minutes=service.duration_min)
    tz = business_tz(business)

    try:
        # 3. Serialise bookings of this tenant (no-op on SQLite, which serialises writers anyway).
        db.execute(select(Business.id).where(Business.id == business.id).with_for_update())

        # 4. Slot validity.
        if not is_within_working_hours(db, business, start_utc, service.duration_min):
            raise ValidationAppError(OUTSIDE_HOURS_MESSAGE, code=INVALID_SLOT)
        if source == "online":
            now = now_utc()
            if not is_day_bookable_online(business, to_local(start_utc, tz).date(), now):
                raise ValidationAppError(OUTSIDE_WINDOW_MESSAGE, code=INVALID_SLOT)
            if start_utc < now + timedelta(minutes=business.min_notice_minutes):
                raise ValidationAppError(TOO_SOON_MESSAGE, code=INVALID_SLOT)

        # 5. Overlap re-check inside the transaction.
        if booked_intervals(db, business.id, start_utc, end_utc):
            raise SlotTakenError()

        # 6. Customer upsert by normalised phone.
        customer = _upsert_customer(db, business.id, data)

        # 7. Insert with price snapshot, then derive the reference from the generated id.
        appointment = Appointment(
            business_id=business.id,
            service_id=service.id,
            customer_id=customer.id,
            start_time=start_utc,
            end_time=end_utc,
            status="booked",
            price=service.price,
            notes=data.notes,
            source=source,
        )
        db.add(appointment)
        db.flush()
        appointment.reference = f"APT-{to_local(start_utc, tz):%Y%m%d}-{appointment.id:04d}"
        db.commit()
    except IntegrityError as exc:
        # 8. The DB constraint is the final guard against a concurrent insert.
        db.rollback()
        logger.info("Booking rejected by DB constraint (business_id=%s)", business.id)
        raise SlotTakenError() from exc
    except AppError:
        db.rollback()
        raise

    appointment.service = service
    appointment.customer = customer
    return appointment


def _upsert_customer(db: Session, business_id: int, data: BookingCreate) -> Customer:
    """Find the customer by ``(business_id, phone)`` and refresh name/email, or create one."""
    customer = db.scalars(
        select(Customer).where(Customer.business_id == business_id, Customer.phone == data.customer_phone)
    ).first()
    if customer is None:
        customer = Customer(
            business_id=business_id,
            name=data.customer_name,
            phone=data.customer_phone,
            email=data.customer_email,
        )
        db.add(customer)
        db.flush()
    else:
        customer.name = data.customer_name
        if data.customer_email:
            customer.email = data.customer_email
    return customer


def confirmation_out(appointment: Appointment, business: Business) -> BookingConfirmationOut:
    """Build the public 201 body (Sample Output A) in the business timezone."""
    tz = business_tz(business)
    local_start = to_local(appointment.start_time, tz)
    return BookingConfirmationOut(
        booking_id=appointment.reference or "",
        service=appointment.service.name,
        start_time=local_start,
        end_time=to_local(appointment.end_time, tz),
        status=appointment.status,
        message=f"Booking confirmed at {business.name}, {format_human(local_start)}",
        business_name=business.name,
        customer_name=appointment.customer.name,
        price=appointment.price,
    )

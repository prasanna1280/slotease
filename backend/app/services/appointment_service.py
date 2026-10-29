"""Owner appointment management: list by day/range, detail, status/notes updates."""

from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import Select

from app.exceptions import AppError, NotFoundError, SlotTakenError, ValidationAppError
from app.models import Appointment, Business
from app.schemas.appointment import AppointmentOut, AppointmentUpdate
from app.services.slot_service import booked_intervals, business_tz, today_local
from app.services.time_utils import local_day_bounds, to_local

MAX_RANGE_DAYS = 42


def appointment_to_out(appt: Appointment, tz: ZoneInfo) -> AppointmentOut:
    """Build an :class:`AppointmentOut` with every datetime in the business timezone.

    ``appt.service`` and ``appt.customer`` must be loaded (use :func:`with_relations`).
    """
    return AppointmentOut(
        id=appt.id,
        reference=appt.reference,
        service_id=appt.service_id,
        service_name=appt.service.name,
        duration_min=int((appt.end_time - appt.start_time).total_seconds() // 60),
        customer_id=appt.customer_id,
        customer_name=appt.customer.name,
        customer_phone=appt.customer.phone,
        customer_email=appt.customer.email,
        start_time=to_local(appt.start_time, tz),
        end_time=to_local(appt.end_time, tz),
        status=appt.status,  # type: ignore[arg-type]
        price=appt.price,
        notes=appt.notes,
        source=appt.source,  # type: ignore[arg-type]
        created_at=to_local(appt.created_at, tz),
    )


def with_relations(stmt: Select[Appointment]) -> Select[Appointment]:
    """Eager-load service and customer (one JOIN, no N+1)."""
    return stmt.options(joinedload(Appointment.service), joinedload(Appointment.customer))


def resolve_range(
    business: Business, day: date | None, start: date | None, end: date | None
) -> tuple[date, date]:
    """Resolve the ``date`` / ``start``+``end`` query params into an inclusive local date range.

    No params -> today. ``start``/``end`` must come together, ``end >= start``, at most 42 days.
    """
    if day is not None:
        if start is not None or end is not None:
            raise ValidationAppError("Use either date or start/end, not both.", code="INVALID_RANGE")
        return day, day
    if start is None and end is None:
        today = today_local(business)
        return today, today
    if start is None or end is None:
        raise ValidationAppError("Both start and end are required.", code="INVALID_RANGE")
    if end < start:
        raise ValidationAppError("end must be on or after start.", code="INVALID_RANGE")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationAppError(f"The range can be at most {MAX_RANGE_DAYS} days.", code="INVALID_RANGE")
    return start, end


def list_appointments(
    db: Session, business: Business, first_day: date, last_day: date, status: str | None = None
) -> list[Appointment]:
    """Return appointments starting within the inclusive local days ``first_day..last_day``, by start."""
    tz = business_tz(business)
    start_utc, _ = local_day_bounds(first_day, tz)
    _, end_utc = local_day_bounds(last_day, tz)
    stmt = with_relations(
        select(Appointment).where(
            Appointment.business_id == business.id,
            Appointment.start_time >= start_utc,
            Appointment.start_time < end_utc,
        )
    )
    if status is not None:
        stmt = stmt.where(Appointment.status == status)
    return list(db.scalars(stmt.order_by(Appointment.start_time, Appointment.id)).unique())


def get_appointment(db: Session, business_id: int, appointment_id: int) -> Appointment:
    """Return one appointment of the business or raise 404 ``APPOINTMENT_NOT_FOUND``."""
    stmt = with_relations(
        select(Appointment).where(Appointment.id == appointment_id, Appointment.business_id == business_id)
    )
    appt = db.scalars(stmt).unique().first()
    if appt is None:
        raise NotFoundError("Appointment not found.", code="APPOINTMENT_NOT_FOUND")
    return appt


def update_appointment(
    db: Session, business: Business, appointment_id: int, data: AppointmentUpdate
) -> Appointment:
    """Change status and/or notes.

    Reviving a cancelled appointment re-checks overlap under the tenant lock; a clash (or a DB
    constraint violation) raises 409 ``SLOT_TAKEN``.
    """
    appt = get_appointment(db, business.id, appointment_id)
    changes = data.model_dump(exclude_unset=True)
    try:
        new_status = changes.get("status")
        if new_status is not None and appt.status == "cancelled" and new_status != "cancelled":
            db.execute(select(Business.id).where(Business.id == business.id).with_for_update())
            clashes = booked_intervals(db, business.id, appt.start_time, appt.end_time, exclude_id=appt.id)
            if clashes:
                raise SlotTakenError()
        for field, value in changes.items():
            setattr(appt, field, value)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise SlotTakenError() from exc
    except AppError:
        db.rollback()
        raise
    return get_appointment(db, business.id, appointment_id)

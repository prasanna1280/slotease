"""Owner appointment management (``/api/v1/appointments``)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.appointment import AppointmentOut, AppointmentStatus, AppointmentUpdate
from app.schemas.public import BookingCreate
from app.services import appointment_service, booking_service, notification_service
from app.services.slot_service import business_tz

router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.get("", response_model=list[AppointmentOut], summary="List appointments for a day or range")
def list_appointments(
    db: DbSession,
    business: CurrentBusiness,
    day: date | None = Query(default=None, alias="date"),
    start: date | None = None,
    end: date | None = None,
    status_filter: AppointmentStatus | None = Query(default=None, alias="status"),
) -> list[AppointmentOut]:
    """``?date=`` (one local day, default today) or ``?start=&end=`` (inclusive, at most 42 days)."""
    first_day, last_day = appointment_service.resolve_range(business, day, start, end)
    tz = business_tz(business)
    rows = appointment_service.list_appointments(db, business, first_day, last_day, status_filter)
    return [appointment_service.appointment_to_out(a, tz) for a in rows]


@router.post(
    "",
    response_model=AppointmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a booking as the owner",
)
def create_appointment(
    db: DbSession, business: CurrentBusiness, body: BookingCreate, background_tasks: BackgroundTasks
) -> AppointmentOut:
    """Book on behalf of a customer (no minimum-notice / booking-window rule; working hours apply)."""
    appointment = booking_service.create_booking(db, business, body, source="owner")
    background_tasks.add_task(notification_service.send_booking_confirmation, appointment.id)
    return appointment_service.appointment_to_out(appointment, business_tz(business))


@router.get("/{appointment_id}", response_model=AppointmentOut, summary="Get an appointment")
def get_appointment(db: DbSession, business: CurrentBusiness, appointment_id: int) -> AppointmentOut:
    """Return one appointment (404 ``APPOINTMENT_NOT_FOUND`` if missing or another tenant's)."""
    appointment = appointment_service.get_appointment(db, business.id, appointment_id)
    return appointment_service.appointment_to_out(appointment, business_tz(business))


@router.patch("/{appointment_id}", response_model=AppointmentOut, summary="Update status / notes")
def update_appointment(
    db: DbSession, business: CurrentBusiness, appointment_id: int, body: AppointmentUpdate
) -> AppointmentOut:
    """Change status and/or notes (409 ``SLOT_TAKEN`` when reviving into an occupied slot)."""
    appointment = appointment_service.update_appointment(db, business, appointment_id, body)
    return appointment_service.appointment_to_out(appointment, business_tz(business))

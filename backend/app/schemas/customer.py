"""Customer schemas (owner side)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.appointment import AppointmentOut


class CustomerOut(BaseModel):
    """A customer with visit aggregates; datetimes in the business timezone.

    ``total_bookings`` counts every appointment (incl. cancelled); ``last_visit`` is the start of the
    latest *completed* appointment.
    """

    id: int
    name: str
    phone: str
    email: str | None
    total_bookings: int
    completed_visits: int
    no_shows: int
    last_visit: datetime | None
    created_at: datetime


class CustomerDetailOut(CustomerOut):
    """Customer plus their latest 50 appointments (newest first)."""

    appointments: list[AppointmentOut]

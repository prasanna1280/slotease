"""Free-slot computation (the PRP "Slot algorithm").

All arithmetic happens on aware datetimes converted to UTC, so stepping is in real elapsed minutes and
is DST-safe. Working-hour boundaries are built with ``datetime.combine(day, time, tzinfo=tz)``.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, Business, Service, WorkingHours
from app.services.time_utils import get_tz, local_day_bounds, now_utc

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class Slot:
    """A candidate slot ``[start, end)`` with both bounds as aware UTC datetimes."""

    start: datetime
    end: datetime


def business_tz(business: Business) -> ZoneInfo:
    """Return the business's ``ZoneInfo``."""
    return get_tz(business.timezone)


def today_local(business: Business, now: datetime | None = None) -> date:
    """Return today's date in the business timezone."""
    return (now or now_utc()).astimezone(business_tz(business)).date()


def working_intervals(db: Session, business: Business, day: date) -> list[Interval]:
    """Return the open ranges of ``day`` as UTC ``(open, close)`` pairs sorted by open time."""
    tz = business_tz(business)
    rows = db.execute(
        select(WorkingHours.open_time, WorkingHours.close_time)
        .where(WorkingHours.business_id == business.id, WorkingHours.weekday == day.weekday())
        .order_by(WorkingHours.open_time)
    ).all()
    return [
        (_local_to_utc(day, open_time, tz), _local_to_utc(day, close_time, tz))
        for open_time, close_time in rows
    ]


def booked_intervals(
    db: Session, business_id: int, start_utc: datetime, end_utc: datetime, *, exclude_id: int | None = None
) -> list[Interval]:
    """Return ``[start, end)`` of non-cancelled appointments overlapping ``[start_utc, end_utc)``."""
    stmt = select(Appointment.start_time, Appointment.end_time).where(
        Appointment.business_id == business_id,
        Appointment.status != "cancelled",
        Appointment.start_time < end_utc,
        Appointment.end_time > start_utc,
    )
    if exclude_id is not None:
        stmt = stmt.where(Appointment.id != exclude_id)
    return [(s, e) for s, e in db.execute(stmt).all()]


def iter_candidate_slots(intervals: Sequence[Interval], duration_min: int, step_min: int) -> Iterator[Slot]:
    """Yield every ``[t, t+duration)`` with ``t`` stepping by ``step_min`` from each open time and
    ``t + duration <= close`` (pure; no bookings, notice or window applied)."""
    duration = timedelta(minutes=duration_min)
    step = timedelta(minutes=max(step_min, 1))
    for open_utc, close_utc in intervals:
        t = open_utc
        while t + duration <= close_utc:
            yield Slot(t, t + duration)
            t += step


def overlaps(start: datetime, end: datetime, booked: Sequence[Interval]) -> bool:
    """Return True if ``[start, end)`` overlaps any booked ``[s, e)`` (``s < end and e > start``)."""
    return any(s < end and e > start for s, e in booked)


def is_day_bookable_online(business: Business, day: date, now: datetime | None = None) -> bool:
    """False for past local days and days beyond ``today + booking_window_days``."""
    today = today_local(business, now)
    return today <= day <= today + timedelta(days=business.booking_window_days)


def compute_free_slots(
    db: Session,
    business: Business,
    service: Service,
    day: date,
    *,
    now: datetime | None = None,
    enforce_notice: bool = True,
) -> list[Slot]:
    """Return the free slots of ``service`` on the local ``day`` (see PRP "Slot algorithm").

    Returns ``[]`` for a past day or a day beyond the booking window. Slots overlapping a non-cancelled
    appointment are skipped; with ``enforce_notice`` slots starting before ``now + min_notice_minutes``
    are skipped too (which also drops already-started slots of today).
    """
    current = now or now_utc()
    if not is_day_bookable_online(business, day, current):
        return []
    intervals = working_intervals(db, business, day)
    if not intervals:
        return []
    day_start, day_end = local_day_bounds(day, business_tz(business))
    booked = booked_intervals(db, business.id, day_start, day_end)
    earliest = current + timedelta(minutes=business.min_notice_minutes)
    return [
        slot
        for slot in iter_candidate_slots(intervals, service.duration_min, business.slot_interval_min)
        if not overlaps(slot.start, slot.end, booked) and not (enforce_notice and slot.start < earliest)
    ]


def is_within_working_hours(db: Session, business: Business, start: datetime, duration_min: int) -> bool:
    """True if ``start`` is exactly the start of a working-hours slot of that length (bookings ignored)."""
    tz = business_tz(business)
    start_utc = start.astimezone(UTC)
    day = start_utc.astimezone(tz).date()
    intervals = working_intervals(db, business, day)
    return any(
        slot.start == start_utc
        for slot in iter_candidate_slots(intervals, duration_min, business.slot_interval_min)
    )


def _local_to_utc(day: date, wall: time, tz: ZoneInfo) -> datetime:
    """Combine a local date and wall-clock time in ``tz`` and convert to UTC."""
    return datetime.combine(day, wall.replace(tzinfo=None), tzinfo=tz).astimezone(UTC)

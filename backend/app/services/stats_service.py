"""Owner reporting: monthly stats and the per-day dashboard summary.

Month/day boundaries are local midnights in the business timezone converted to UTC. Per-day bucketing
must happen in the business timezone, which SQL cannot do portably (SQLite vs Postgres), so the month
query fetches only the few needed columns of that month's appointments in ONE query and aggregates in
Python (a busy business has a few hundred rows a month).
"""

from __future__ import annotations

import calendar
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.exceptions import ValidationAppError
from app.models import Appointment, Business, Customer, Service
from app.schemas.stats import DailyStatOut, DaySummaryOut, MonthStatsOut, TopServiceOut
from app.services.appointment_service import appointment_to_out, with_relations
from app.services.slot_service import business_tz, today_local
from app.services.time_utils import is_supported_year, local_day_bounds, now_utc, to_local

MONTH_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")
WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
REVENUE_STATUSES = ("booked", "completed")
TOP_SERVICES_LIMIT = 5


def parse_month(value: str | None, business: Business) -> date:
    """Parse ``YYYY-MM`` into the first day of that month (default: current local month)."""
    if value is None:
        return today_local(business).replace(day=1)
    match = MONTH_PATTERN.fullmatch(value.strip())
    if match is None or not 1 <= int(match.group(2)) <= 12 or not is_supported_year(int(match.group(1))):
        raise ValidationAppError(
            "Invalid month, expected YYYY-MM.",
            details=[{"field": "query.month", "message": "Expected YYYY-MM."}],
        )
    return date(int(match.group(1)), int(match.group(2)), 1)


@dataclass
class _ServiceTotals:
    name: str
    bookings: int = 0
    revenue: Decimal = field(default_factory=lambda: Decimal("0"))


def month_stats(db: Session, business: Business, first_day: date) -> MonthStatsOut:
    """Compute :class:`MonthStatsOut` for the local calendar month starting at ``first_day``."""
    tz = business_tz(business)
    days_in_month = calendar.monthrange(first_day.year, first_day.month)[1]
    next_month = first_day + timedelta(days=days_in_month)
    start_utc, _ = local_day_bounds(first_day, tz)
    end_utc, _ = local_day_bounds(next_month, tz)

    rows = db.execute(
        select(
            Appointment.start_time,
            Appointment.status,
            Appointment.price,
            Appointment.service_id,
            Service.name,
        )
        .join(Service, Service.id == Appointment.service_id)
        .where(
            Appointment.business_id == business.id,
            Appointment.start_time >= start_utc,
            Appointment.start_time < end_utc,
        )
    ).all()

    status_counts: Counter[str] = Counter()
    revenue = Decimal("0")
    weekday_counts: Counter[int] = Counter()
    daily: dict[date, list[int]] = {
        first_day + timedelta(days=i): [0, 0, 0] for i in range(days_in_month)
    }  # bookings, completed, no_shows
    services: dict[int, _ServiceTotals] = {}

    for start_time, status, price, service_id, service_name in rows:
        status_counts[status] += 1
        local_day = to_local(start_time, tz).date()
        bucket = daily.get(local_day)
        if status in REVENUE_STATUSES:
            revenue += Decimal(price)
        if status == "cancelled":
            continue
        weekday_counts[local_day.weekday()] += 1
        totals = services.setdefault(service_id, _ServiceTotals(name=service_name))
        totals.bookings += 1
        if status in REVENUE_STATUSES:
            totals.revenue += Decimal(price)
        if bucket is not None:
            bucket[0] += 1
            if status == "completed":
                bucket[1] += 1
            elif status == "no_show":
                bucket[2] += 1

    total = len(rows)
    cancelled = status_counts["cancelled"]
    no_shows = status_counts["no_show"]
    denominator = total - cancelled
    no_show_rate = round(no_shows / denominator * 100, 1) if denominator > 0 else 0.0

    busiest_day = None
    if weekday_counts:
        # Most bookings; ties go to the earlier weekday (Monday first) for determinism.
        best = max(weekday_counts.items(), key=lambda kv: (kv[1], -kv[0]))
        busiest_day = WEEKDAY_NAMES[best[0]]

    top = sorted(services.items(), key=lambda kv: (-kv[1].bookings, -kv[1].revenue, kv[1].name, kv[0]))
    new_customers = db.scalar(
        select(func.count(Customer.id)).where(
            Customer.business_id == business.id,
            Customer.created_at >= start_utc,
            Customer.created_at < end_utc,
        )
    )

    return MonthStatsOut(
        month=f"{first_day:%Y-%m}",
        total_bookings=total,
        booked=status_counts["booked"],
        completed=status_counts["completed"],
        cancelled=cancelled,
        no_shows=no_shows,
        no_show_rate=no_show_rate,
        revenue_estimate=revenue,
        busiest_day=busiest_day,
        new_customers=int(new_customers or 0),
        daily=[
            DailyStatOut(date=day, bookings=v[0], completed=v[1], no_shows=v[2]) for day, v in daily.items()
        ],
        top_services=[
            TopServiceOut(service_id=sid, name=t.name, bookings=t.bookings, revenue=t.revenue)
            for sid, t in top[:TOP_SERVICES_LIMIT]
        ],
    )


def day_summary(db: Session, business: Business, day: date | None) -> DaySummaryOut:
    """Compute :class:`DaySummaryOut` for a local day (default today).

    ``next_appointment`` is the earliest ``booked`` appointment of that day starting at or after now.
    """
    tz = business_tz(business)
    day = day or today_local(business)
    start_utc, end_utc = local_day_bounds(day, tz)

    rows = db.execute(
        select(Appointment.status, func.count(Appointment.id), func.coalesce(func.sum(Appointment.price), 0))
        .where(
            Appointment.business_id == business.id,
            Appointment.start_time >= start_utc,
            Appointment.start_time < end_utc,
        )
        .group_by(Appointment.status)
    ).all()
    counts: dict[str, int] = {}
    revenue = Decimal("0")
    for status, count, amount in rows:
        counts[status] = int(count)
        if status in REVENUE_STATUSES:
            revenue += Decimal(str(amount))

    next_from = max(start_utc, now_utc())
    next_appt = db.scalars(
        with_relations(
            select(Appointment).where(
                Appointment.business_id == business.id,
                Appointment.status == "booked",
                Appointment.start_time >= next_from,
                Appointment.start_time < end_utc,
            )
        )
        .order_by(Appointment.start_time)
        .limit(1)
    ).first()

    cancelled = counts.get("cancelled", 0)
    return DaySummaryOut(
        date=day,
        total=sum(counts.values()) - cancelled,
        booked=counts.get("booked", 0),
        completed=counts.get("completed", 0),
        cancelled=cancelled,
        no_shows=counts.get("no_show", 0),
        revenue_estimate=revenue,
        next_appointment=appointment_to_out(next_appt, tz) if next_appt is not None else None,
    )

"""Platform-wide reports for admins: dashboard summary, revenue by period, subscription health.

Period boundaries use ``settings.ADMIN_REPORT_TIMEZONE``. The ``fiscal`` basis follows the Indian
financial year (April to March).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Appointment, Business, Customer, Payment
from app.schemas.admin import (
    Basis,
    CountsByStatus,
    Granularity,
    MonthlySignups,
    OverviewOut,
    PaymentOut,
    RevenueOut,
    RevenuePeriod,
    SubscriptionsOut,
)
from app.services.admin_service import business_rows, derive_status, row_select, status_filter
from app.services.time_utils import get_tz, local_day_bounds, now_utc, to_local

CENT = Decimal("0.01")
MONTHS_PER_PERIOD: dict[str, int] = {"month": 1, "quarter": 3, "half_year": 6, "year": 12}
PERIODS_SHOWN: dict[str, int] = {"month": 12, "quarter": 8, "half_year": 6, "year": 5}
FISCAL_START_MONTH = 4
SOON = timedelta(days=7)


def _money(value: object) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT)


# ---------------------------------------------------------------------------
# Periods
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Period:
    """One reporting period [start, end] in local dates."""

    index: int
    start: date
    end: date
    key: str
    label: str


def _fy_label(start_year: int) -> str:
    return f"FY{start_year % 100:02d}-{(start_year + 1) % 100:02d}"


def period_index(day: date, granularity: str, basis: str) -> int:
    """Number of whole periods between year 0 and ``day``'s period (monotonic across years)."""
    size = MONTHS_PER_PERIOD[granularity]
    offset = FISCAL_START_MONTH - 1 if basis == "fiscal" and granularity != "month" else 0
    return (day.year * 12 + day.month - 1 - offset) // size


def period_for_index(index: int, granularity: str, basis: str) -> Period:
    """Build the period with the given :func:`period_index`."""
    size = MONTHS_PER_PERIOD[granularity]
    offset = FISCAL_START_MONTH - 1 if basis == "fiscal" and granularity != "month" else 0
    first = index * size + offset
    start = date(first // 12, first % 12 + 1, 1)
    after = first + size
    end = date(after // 12, after % 12 + 1, 1) - timedelta(days=1)
    fiscal = basis == "fiscal" and granularity != "month"
    fy_start = start.year if start.month >= FISCAL_START_MONTH else start.year - 1

    if granularity == "month":
        key, label = f"{start:%Y-%m}", f"{start:%b %Y}"
    elif granularity == "quarter":
        if fiscal:
            number = (start.month - FISCAL_START_MONTH) % 12 // 3 + 1
            key, label = f"{_fy_label(fy_start)}-Q{number}", f"Q{number} {_fy_label(fy_start)}"
        else:
            number = (start.month - 1) // 3 + 1
            key, label = f"{start.year}-Q{number}", f"Q{number} {start.year}"
    elif granularity == "half_year":
        if fiscal:
            number = 1 if start.month == FISCAL_START_MONTH else 2
            key, label = f"{_fy_label(fy_start)}-H{number}", f"H{number} {_fy_label(fy_start)}"
        else:
            number = 1 if start.month == 1 else 2
            key, label = f"{start.year}-H{number}", f"H{number} {start.year}"
    elif fiscal:
        key = label = _fy_label(fy_start)
    else:
        key = label = str(start.year)
    return Period(index=index, start=start, end=end, key=key, label=label)


def _utc_range(start: date, end: date) -> tuple[datetime, datetime]:
    """UTC instants covering local dates ``start``..``end`` inclusive."""
    tz = get_tz(settings.ADMIN_REPORT_TIMEZONE)
    return local_day_bounds(start, tz)[0], local_day_bounds(end, tz)[1]


def _revenue_between(db: Session, start: date, end: date) -> Decimal:
    lo, hi = _utc_range(start, end)
    return _money(
        db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.paid_at >= lo, Payment.paid_at < hi
            )
        )
    )


def _first_payment_dates(db: Session) -> dict[int, date]:
    """Local date of each business's first payment."""
    tz = get_tz(settings.ADMIN_REPORT_TIMEZONE)
    rows = db.execute(
        select(Payment.business_id, func.min(Payment.paid_at))
        .where(Payment.business_id.is_not(None))
        .group_by(Payment.business_id)
    ).all()
    result: dict[int, date] = {}
    for business_id, first in rows:
        if business_id is None or first is None:
            continue
        if isinstance(first, str):  # SQLite returns text for an aggregate over a custom type
            first = datetime.fromisoformat(first)
        result[business_id] = to_local(first, tz).date()
    return result


def revenue_report(db: Session, granularity: Granularity, basis: Basis) -> RevenueOut:
    """Revenue for the last N periods (12 months, 8 quarters, 6 half-years or 5 years)."""
    tz = get_tz(settings.ADMIN_REPORT_TIMEZONE)
    today = to_local(now_utc(), tz).date()
    current = period_index(today, granularity, basis)
    shown = PERIODS_SHOWN[granularity]
    # One extra period before the first shown one, for its change percentage.
    periods = [period_for_index(i, granularity, basis) for i in range(current - shown, current + 1)]
    lo, hi = _utc_range(periods[0].start, periods[-1].end)
    payments = db.execute(
        select(Payment.paid_at, Payment.amount, Payment.business_id).where(
            Payment.paid_at >= lo, Payment.paid_at < hi
        )
    ).all()

    revenue: dict[int, Decimal] = defaultdict(Decimal)
    counts: dict[int, int] = defaultdict(int)
    payers: dict[int, set[int]] = defaultdict(set)
    for paid_at, amount, business_id in payments:
        index = period_index(to_local(paid_at, tz).date(), granularity, basis)
        revenue[index] += Decimal(amount)
        counts[index] += 1
        if business_id is not None:
            payers[index].add(business_id)
    new_payers: dict[int, int] = defaultdict(int)
    for first in _first_payment_dates(db).values():
        new_payers[period_index(first, granularity, basis)] += 1

    out: list[RevenuePeriod] = []
    for previous, period in zip(periods, periods[1:], strict=False):
        amount = _money(revenue[period.index])
        before = _money(revenue[previous.index])
        change = None if before == 0 else round(float((amount - before) / before * 100), 1)
        out.append(
            RevenuePeriod(
                key=period.key,
                label=period.label,
                start=period.start,
                end=period.end,
                revenue=amount,
                payments=counts[period.index],
                paying_businesses=len(payers[period.index]),
                new_paying_businesses=new_payers[period.index],
                change_pct=change,
            )
        )
    total = _money(sum((p.revenue for p in out), Decimal(0)))
    return RevenueOut(
        granularity=granularity,
        basis=basis,
        timezone=settings.ADMIN_REPORT_TIMEZONE,
        periods=out,
        total_revenue=total,
        total_payments=sum(p.payments for p in out),
        average_revenue=_money(total / len(out)) if out else _money(0),
    )


# ---------------------------------------------------------------------------
# Status counts
# ---------------------------------------------------------------------------


def status_counts(db: Session, now: datetime) -> CountsByStatus:
    """How many businesses are in each admin status."""
    counts = CountsByStatus()
    for business in db.scalars(select(Business)).all():
        status = derive_status(business, now)
        setattr(counts, status, getattr(counts, status) + 1)
    return counts


def _mrr(counts: CountsByStatus) -> Decimal:
    return _money(Decimal(settings.PLAN_PRICE_INR) * counts.active)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def _month_start(day: date, months_back: int = 0) -> date:
    absolute = day.year * 12 + day.month - 1 - months_back
    return date(absolute // 12, absolute % 12 + 1, 1)


def overview(db: Session) -> OverviewOut:
    """Dashboard summary: businesses, subscriptions, revenue, bookings and 12-month sign-ups."""
    now = now_utc()
    tz = get_tz(settings.ADMIN_REPORT_TIMEZONE)
    today = to_local(now, tz).date()
    month_start = _month_start(today)
    last_month_start = _month_start(today, 1)
    quarter_start = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
    year_start = date(today.year, 1, 1)

    def created_between(model: type[Business] | type[Appointment], start: date, end: date) -> int:
        lo, hi = _utc_range(start, end)
        return (
            db.scalar(select(func.count(model.id)).where(model.created_at >= lo, model.created_at < hi)) or 0
        )

    counts = status_counts(db, now)
    mrr = _mrr(counts)

    # Trial conversion: of the businesses whose trial has ended, how many ever paid or went Pro.
    first_payments = _first_payment_dates(db)
    finished = db.execute(
        select(Business.id, Business.plan).where(
            Business.trial_ends_at.is_not(None), Business.trial_ends_at <= now
        )
    ).all()
    converted = sum(1 for business_id, plan in finished if plan == "pro" or business_id in first_payments)
    conversion = round(converted / len(finished) * 100, 1) if finished else None

    # Sign-ups and first payments per month for the last 12 months.
    first_month = _month_start(today, 11)
    lo, _ = _utc_range(first_month, today)
    signups: dict[str, int] = defaultdict(int)
    for (created,) in db.execute(select(Business.created_at).where(Business.created_at >= lo)).all():
        signups[f"{to_local(created, tz):%Y-%m}"] += 1
    firsts: dict[str, int] = defaultdict(int)
    for first in first_payments.values():
        firsts[f"{first:%Y-%m}"] += 1
    months = [_month_start(today, back) for back in range(11, -1, -1)]

    recent_payments = db.scalars(
        select(Payment).order_by(Payment.paid_at.desc(), Payment.id.desc()).limit(5)
    ).all()
    recent_businesses = business_rows(
        db, row_select().order_by(Business.created_at.desc(), Business.id.desc()).limit(5), now
    )

    return OverviewOut(
        generated_at=now,
        timezone=settings.ADMIN_REPORT_TIMEZONE,
        plan_price=_money(settings.PLAN_PRICE_INR),
        businesses_total=db.scalar(select(func.count(Business.id))) or 0,
        businesses_new_this_month=created_between(Business, month_start, today),
        businesses_new_last_month=created_between(
            Business, last_month_start, month_start - timedelta(days=1)
        ),
        status_counts=counts,
        paying_businesses=counts.active,
        mrr=mrr,
        arr=_money(mrr * 12),
        revenue_this_month=_revenue_between(db, month_start, today),
        revenue_last_month=_revenue_between(db, last_month_start, month_start - timedelta(days=1)),
        revenue_this_quarter=_revenue_between(db, quarter_start, today),
        revenue_this_year=_revenue_between(db, year_start, today),
        revenue_lifetime=_money(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)))),
        trial_conversion_rate=conversion,
        bookings_today=created_between(Appointment, today, today),
        bookings_this_month=created_between(Appointment, month_start, today),
        bookings_total=db.scalar(select(func.count(Appointment.id))) or 0,
        end_customers_total=db.scalar(select(func.count(Customer.id))) or 0,
        signups_by_month=[
            MonthlySignups(
                month=f"{m:%Y-%m}",
                label=f"{m:%b %Y}",
                signups=signups[f"{m:%Y-%m}"],
                first_payments=firsts[f"{m:%Y-%m}"],
            )
            for m in months
        ],
        recent_businesses=recent_businesses,
        recent_payments=[PaymentOut.model_validate(p) for p in recent_payments],
    )


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------


def subscriptions(db: Session) -> SubscriptionsOut:
    """Subscription health: counts, MRR and lists of businesses needing attention."""
    now = now_utc()
    counts = status_counts(db, now)
    base = row_select()
    return SubscriptionsOut(
        status_counts=counts,
        mrr=_mrr(counts),
        trials_ending_soon=business_rows(
            db,
            base.where(status_filter("trialing", now), Business.trial_ends_at <= now + SOON).order_by(
                Business.trial_ends_at.asc()
            ),
            now,
        ),
        renewals_due=business_rows(
            db,
            base.where(
                status_filter("active", now),
                Business.current_period_end.is_not(None),
                Business.current_period_end <= now + SOON,
            ).order_by(Business.current_period_end.asc()),
            now,
        ),
        past_due=business_rows(
            db, base.where(status_filter("past_due", now)).order_by(Business.current_period_end.asc()), now
        ),
        recently_cancelled=business_rows(
            db,
            base.where(status_filter("cancelled", now), Business.updated_at >= now - timedelta(days=30))
            .order_by(Business.updated_at.desc())
            .limit(20),
            now,
        ),
    )

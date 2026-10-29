"""Customers (owner side): paginated search with visit aggregates, and detail with history."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Integer, case, func, or_, select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Appointment, Business, Customer
from app.schemas.customer import CustomerDetailOut, CustomerOut
from app.services.appointment_service import appointment_to_out, with_relations
from app.services.slot_service import business_tz
from app.services.time_utils import to_local

DETAIL_APPOINTMENT_LIMIT = 50
_PHONE_SEPARATORS = re.compile(r"[\s\-().]")


def _aggregates_subquery(business_id: int) -> Any:
    """One grouped query: per-customer total bookings, completed visits, no-shows and last visit."""
    return (
        select(
            Appointment.customer_id.label("customer_id"),
            func.count(Appointment.id).label("total_bookings"),
            func.sum(case((Appointment.status == "completed", 1), else_=0), type_=Integer).label(
                "completed_visits"
            ),
            func.sum(case((Appointment.status == "no_show", 1), else_=0), type_=Integer).label("no_shows"),
            func.max(case((Appointment.status == "completed", Appointment.start_time), else_=None)).label(
                "last_visit"
            ),
        )
        .where(Appointment.business_id == business_id)
        .group_by(Appointment.customer_id)
        .subquery("agg")
    )


def _customer_out(customer: Customer, row: Any, tz: ZoneInfo) -> CustomerOut:
    """Build a :class:`CustomerOut` from a customer and its aggregate row."""
    last_visit = _as_datetime(row.last_visit) if row is not None else None
    return CustomerOut(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        email=customer.email,
        total_bookings=int(row.total_bookings or 0) if row is not None else 0,
        completed_visits=int(row.completed_visits or 0) if row is not None else 0,
        no_shows=int(row.no_shows or 0) if row is not None else 0,
        last_visit=to_local(last_visit, tz) if last_visit is not None else None,
        created_at=to_local(customer.created_at, tz),
    )


def _as_datetime(value: Any) -> datetime | None:
    """``MAX()`` over a type-decorated column comes back raw on SQLite (string/naive) - normalise it."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def list_customers(
    db: Session, business: Business, search: str | None, page: int, page_size: int
) -> tuple[list[CustomerOut], int]:
    """Return one page of customers (name order) matching ``search`` on name/phone, plus the total."""
    tz = business_tz(business)
    agg = _aggregates_subquery(business.id)
    conditions = [Customer.business_id == business.id]
    term = (search or "").strip()
    if term:
        name_match = func.lower(Customer.name).contains(term.lower(), autoescape=True)
        digits = _PHONE_SEPARATORS.sub("", term)
        if digits:
            conditions.append(or_(name_match, Customer.phone.contains(digits, autoescape=True)))
        else:
            conditions.append(name_match)

    total = db.scalar(select(func.count(Customer.id)).where(*conditions)) or 0
    rows = db.execute(
        select(Customer, agg.c.total_bookings, agg.c.completed_visits, agg.c.no_shows, agg.c.last_visit)
        .outerjoin(agg, agg.c.customer_id == Customer.id)
        .where(*conditions)
        .order_by(func.lower(Customer.name), Customer.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return [_customer_out(row[0], row, tz) for row in rows], int(total)


def get_customer_detail(db: Session, business: Business, customer_id: int) -> CustomerDetailOut:
    """Return the customer with aggregates and the latest 50 appointments (newest first); 404 otherwise."""
    tz = business_tz(business)
    agg = _aggregates_subquery(business.id)
    row = db.execute(
        select(Customer, agg.c.total_bookings, agg.c.completed_visits, agg.c.no_shows, agg.c.last_visit)
        .outerjoin(agg, agg.c.customer_id == Customer.id)
        .where(Customer.id == customer_id, Customer.business_id == business.id)
    ).first()
    if row is None:
        raise NotFoundError("Customer not found.", code="CUSTOMER_NOT_FOUND")
    appointments = db.scalars(
        with_relations(
            select(Appointment).where(
                Appointment.business_id == business.id, Appointment.customer_id == customer_id
            )
        )
        .order_by(Appointment.start_time.desc(), Appointment.id.desc())
        .limit(DETAIL_APPOINTMENT_LIMIT)
    ).unique()
    base = _customer_out(row[0], row, tz)
    return CustomerDetailOut(
        **base.model_dump(), appointments=[appointment_to_out(a, tz) for a in appointments]
    )

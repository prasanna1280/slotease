"""Reporting schemas."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.appointment import AppointmentOut
from app.schemas.service import Money


class DailyStatOut(BaseModel):
    """Per-day counts (``bookings`` excludes cancelled)."""

    date: date
    bookings: int
    completed: int
    no_shows: int


class TopServiceOut(BaseModel):
    """A top service of the month by non-cancelled bookings (``revenue`` = booked + completed)."""

    service_id: int
    name: str
    bookings: int
    revenue: Money


class MonthStatsOut(BaseModel):
    """``GET /stats`` response."""

    month: str
    total_bookings: int
    booked: int
    completed: int
    cancelled: int
    no_shows: int
    no_show_rate: float
    revenue_estimate: Money
    busiest_day: str | None
    new_customers: int
    daily: list[DailyStatOut]
    top_services: list[TopServiceOut]


class DaySummaryOut(BaseModel):
    """``GET /stats/summary`` response (``total`` excludes cancelled)."""

    date: date
    total: int
    booked: int
    completed: int
    cancelled: int
    no_shows: int
    revenue_estimate: Money
    next_appointment: AppointmentOut | None

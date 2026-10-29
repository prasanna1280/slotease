"""Owner reporting (``/api/v1/stats``)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.stats import DaySummaryOut, MonthStatsOut
from app.services import stats_service

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("", response_model=MonthStatsOut, summary="Monthly stats")
def get_month_stats(
    db: DbSession, business: CurrentBusiness, month: str | None = Query(default=None, max_length=7)
) -> MonthStatsOut:
    """Stats for ``month=YYYY-MM`` (default: current month in the business timezone)."""
    first_day = stats_service.parse_month(month, business)
    return stats_service.month_stats(db, business, first_day)


@router.get("/summary", response_model=DaySummaryOut, summary="Day summary for the dashboard")
def get_day_summary(
    db: DbSession, business: CurrentBusiness, day: date | None = Query(default=None, alias="date")
) -> DaySummaryOut:
    """Counts, revenue estimate and next appointment for ``date`` (default: today, business timezone)."""
    return stats_service.day_summary(db, business, day)

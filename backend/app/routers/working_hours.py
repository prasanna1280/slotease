"""Weekly working hours of the authenticated business (``/api/v1/working-hours``)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.working_hours import WorkingHoursOut, WorkingHoursReplace
from app.services import working_hours_service

router = APIRouter(prefix="/working-hours", tags=["Working hours"])


@router.get("", response_model=list[WorkingHoursOut], summary="List working hours")
def list_working_hours(db: DbSession, business: CurrentBusiness) -> list[WorkingHoursOut]:
    """Return all ranges sorted by weekday, then open time."""
    rows = working_hours_service.list_working_hours(db, business.id)
    return [WorkingHoursOut.model_validate(row) for row in rows]


@router.put("", response_model=list[WorkingHoursOut], summary="Replace working hours")
def replace_working_hours(
    db: DbSession, business: CurrentBusiness, body: WorkingHoursReplace
) -> list[WorkingHoursOut]:
    """Replace the whole weekly schedule (422 on invalid / overlapping / too many ranges)."""
    rows = working_hours_service.replace_working_hours(db, business.id, body.hours)
    return [WorkingHoursOut.model_validate(row) for row in rows]

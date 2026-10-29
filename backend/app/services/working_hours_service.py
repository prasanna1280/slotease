"""Weekly working hours (``/working-hours``): list and replace-all with validation."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.exceptions import ValidationAppError
from app.models import WorkingHours
from app.schemas.working_hours import WorkingHoursIn

MAX_RANGES_PER_DAY = 4
WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def list_working_hours(db: Session, business_id: int) -> list[WorkingHours]:
    """Return the business's ranges sorted by weekday, then open time."""
    stmt = (
        select(WorkingHours)
        .where(WorkingHours.business_id == business_id)
        .order_by(WorkingHours.weekday, WorkingHours.open_time)
    )
    return list(db.scalars(stmt))


def validate_hours(hours: list[WorkingHoursIn]) -> None:
    """Check open < close, no overlapping ranges on one weekday and at most 4 ranges per day.

    Raises:
        ValidationAppError: 422 ``VALIDATION_ERROR`` with ``details`` ``[{"field", "message"}]``.
    """
    details: list[dict[str, str]] = []
    by_day: dict[int, list[tuple[int, WorkingHoursIn]]] = defaultdict(list)
    for index, item in enumerate(hours):
        if item.open_time >= item.close_time:
            details.append(
                {"field": f"hours.{index}", "message": "Opening time must be before closing time."}
            )
        by_day[item.weekday].append((index, item))

    for weekday, items in sorted(by_day.items()):
        day = WEEKDAY_NAMES[weekday]
        if len(items) > MAX_RANGES_PER_DAY:
            details.append(
                {
                    "field": "hours",
                    "message": f"{day} has more than {MAX_RANGES_PER_DAY} time ranges.",
                }
            )
        ordered = sorted(items, key=lambda pair: (pair[1].open_time, pair[1].close_time))
        for (_, prev), (index, cur) in zip(ordered, ordered[1:], strict=False):
            if cur.open_time < prev.close_time:
                details.append({"field": f"hours.{index}", "message": f"{day} has overlapping time ranges."})

    if details:
        raise ValidationAppError("Invalid working hours.", details=details)


def replace_working_hours(db: Session, business_id: int, hours: list[WorkingHoursIn]) -> list[WorkingHours]:
    """Validate and atomically replace every range of the business."""
    validate_hours(hours)
    db.execute(delete(WorkingHours).where(WorkingHours.business_id == business_id))
    db.add_all(
        WorkingHours(
            business_id=business_id,
            weekday=item.weekday,
            open_time=item.open_time.replace(tzinfo=None),
            close_time=item.close_time.replace(tzinfo=None),
        )
        for item in hours
    )
    db.commit()
    return list_working_hours(db, business_id)

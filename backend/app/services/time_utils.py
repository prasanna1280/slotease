"""Timezone helpers. Storage is UTC; slot math and API output use the business timezone."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.exceptions import ValidationAppError

DEFAULT_TIMEZONE = "Asia/Kolkata"

# Supported calendar range. Dates near date.min/date.max overflow during timezone conversion,
# so API inputs outside this range are rejected with 422 instead of crashing.
MIN_SUPPORTED_YEAR = 1970
MAX_SUPPORTED_YEAR = 2200

# Explicit English names: strftime %a/%b depend on the process locale.
_WEEKDAYS_SHORT = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_MONTHS_SHORT = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


@lru_cache(maxsize=256)
def get_tz(name: str) -> ZoneInfo:
    """Return the ``ZoneInfo`` for an IANA name (raises ``ZoneInfoNotFoundError``/``ValueError``)."""
    return ZoneInfo(name)


def is_valid_timezone(name: str) -> bool:
    """Return True if ``name`` is a loadable IANA timezone (e.g. ``Asia/Kolkata``)."""
    if not name or not isinstance(name, str):
        return False
    try:
        get_tz(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return False
    return True


def is_supported_year(year: int) -> bool:
    """Return True if ``year`` lies in ``[MIN_SUPPORTED_YEAR, MAX_SUPPORTED_YEAR]``."""
    return MIN_SUPPORTED_YEAR <= year <= MAX_SUPPORTED_YEAR


def now_utc() -> datetime:
    """Current time as an aware UTC datetime."""
    return datetime.now(UTC)


def _as_tz(tz: ZoneInfo | str) -> ZoneInfo:
    return get_tz(tz) if isinstance(tz, str) else tz


def to_local(dt: datetime, tz: ZoneInfo | str) -> datetime:
    """Convert an aware datetime to ``tz``. Naive input is assumed to be UTC (SQLite round-trips)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(_as_tz(tz))


def local_day_bounds(day: date, tz: ZoneInfo | str) -> tuple[datetime, datetime]:
    """Return ``(start_utc, end_utc)`` for the local calendar day ``[day 00:00, day+1 00:00)`` in ``tz``.

    DST-safe: both bounds are built as local wall-clock midnights and then converted to UTC.

    Raises:
        ValidationAppError: 422 ``INVALID_DATE`` when ``day`` is outside the supported year range.
    """
    if not is_supported_year(day.year):
        raise ValidationAppError(
            f"Dates must be between {MIN_SUPPORTED_YEAR} and {MAX_SUPPORTED_YEAR}.", code="INVALID_DATE"
        )
    zone = _as_tz(tz)
    start_local = datetime.combine(day, time(0, 0), tzinfo=zone)
    end_local = datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=zone)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def format_human(dt_local: datetime) -> str:
    """Format a local datetime like ``"Sat 10 Oct, 5:30 PM"`` (no leading zeros; portable, no ``%-I``)."""
    hour12 = dt_local.hour % 12 or 12
    meridiem = "AM" if dt_local.hour < 12 else "PM"
    weekday = _WEEKDAYS_SHORT[dt_local.weekday()]
    month = _MONTHS_SHORT[dt_local.month - 1]
    return f"{weekday} {dt_local.day} {month}, {hour12}:{dt_local.minute:02d} {meridiem}"

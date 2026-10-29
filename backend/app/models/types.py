"""Custom column types shared by all models."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware datetime column that always stores and returns UTC.

    * Binding a naive datetime raises ``ValueError`` (callers must be explicit about the zone).
    * Aware datetimes are converted to UTC before they are sent to the database. On SQLite, which has
      no timezone support, the UTC value is stored without tzinfo so comparisons stay consistent.
    * Values read back are always aware and in UTC (SQLite returns naive values -> ``timezone.utc``
      is attached).
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> datetime | None:
        """Validate and normalise an outgoing value to UTC."""
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise ValueError(f"UTCDateTime expects a datetime, got {type(value).__name__}")
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("UTCDateTime requires a timezone-aware datetime (naive datetime given)")
        utc_value = value.astimezone(UTC)
        if dialect.name == "sqlite":
            return utc_value.replace(tzinfo=None)
        return utc_value

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        """Return the stored value as an aware UTC datetime."""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

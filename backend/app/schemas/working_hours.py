"""Weekly working-hours schemas (times as ``"HH:MM"`` in the business timezone)."""

from __future__ import annotations

from datetime import time

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class WorkingHoursIn(BaseModel):
    """One open range on a weekday (0=Monday .. 6=Sunday)."""

    model_config = ConfigDict(extra="forbid")

    weekday: int = Field(ge=0, le=6)
    open_time: time
    close_time: time


class WorkingHoursReplace(BaseModel):
    """``PUT /working-hours`` body: the complete new weekly schedule (may be empty = closed)."""

    model_config = ConfigDict(extra="forbid")

    hours: list[WorkingHoursIn] = Field(max_length=28)


class WorkingHoursOut(BaseModel):
    """A stored range, e.g. ``{"id": 1, "weekday": 0, "open_time": "09:00", "close_time": "18:00"}``."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    weekday: int
    open_time: time
    close_time: time

    @field_serializer("open_time", "close_time")
    def _hhmm(self, value: time) -> str:
        return value.strftime("%H:%M")

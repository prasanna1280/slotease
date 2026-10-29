"""Weekly working hours model."""

from __future__ import annotations

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.business import Business


class WorkingHours(Base):
    """One open interval on a weekday (0=Monday .. 6=Sunday), in the business's local time.

    Several rows for the same weekday model breaks (e.g. 09:00-13:00 and 14:00-18:00).
    """

    __tablename__ = "working_hours"
    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="weekday_range"),
        CheckConstraint("open_time < close_time", name="open_before_close"),
        Index("ix_working_hours_business_weekday", "business_id", "weekday"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    open_time: Mapped[time] = mapped_column(Time(), nullable=False)
    close_time: Mapped[time] = mapped_column(Time(), nullable=False)

    business: Mapped[Business] = relationship(back_populates="working_hours")

    def __repr__(self) -> str:
        return (
            f"<WorkingHours id={self.id} business_id={self.business_id} weekday={self.weekday} "
            f"{self.open_time}-{self.close_time}>"
        )

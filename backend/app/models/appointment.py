"""Appointment model with DB-level double-booking protection."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.types import UTCDateTime

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.customer import Customer
    from app.models.service import Service

APPOINTMENT_STATUSES: tuple[str, ...] = ("booked", "completed", "cancelled", "no_show")
APPOINTMENT_SOURCES: tuple[str, ...] = ("online", "owner")


class Appointment(TimestampMixin, Base):
    """A booked time slot.

    Two non-cancelled appointments of one business can never share a ``start_time`` (partial unique
    index, all dialects). On PostgreSQL the migration also adds ``ex_appointments_no_overlap``, an
    EXCLUDE constraint rejecting any overlapping ``[start_time, end_time)`` ranges.
    """

    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("end_time > start_time", name="end_after_start"),
        CheckConstraint("status IN ('booked', 'completed', 'cancelled', 'no_show')", name="status_valid"),
        Index("ix_appointments_business_start", "business_id", "start_time"),
        Index(
            "uq_appointments_business_start_active",
            "business_id",
            "start_time",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
            sqlite_where=text("status <> 'cancelled'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"), nullable=False)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(24), unique=True, nullable=True)
    start_time: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    end_time: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="booked", server_default=text("'booked'")
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(
        String(10), nullable=False, default="online", server_default=text("'online'")
    )

    business: Mapped[Business] = relationship(back_populates="appointments")
    service: Mapped[Service] = relationship(back_populates="appointments")
    customer: Mapped[Customer] = relationship(back_populates="appointments")

    def __repr__(self) -> str:
        start = self.start_time.isoformat() if self.start_time else None
        return f"<Appointment id={self.id} business_id={self.business_id} start={start} status={self.status}>"

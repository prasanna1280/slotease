"""Bookable service model."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.business import Business


class Service(TimestampMixin, Base):
    """A service offered by a business (e.g. "Haircut", 30 min, Rs 300). Deleting = deactivating."""

    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("duration_min >= 5 AND duration_min <= 480", name="duration_range"),
        CheckConstraint("price >= 0", name="price_non_negative"),
        Index("ix_services_business_active", "business_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())

    business: Mapped[Business] = relationship(back_populates="services")
    appointments: Mapped[list[Appointment]] = relationship(back_populates="service")

    def __repr__(self) -> str:
        return f"<Service id={self.id} business_id={self.business_id} name={self.name!r}>"

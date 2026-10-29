"""Customer model (one row per phone number per business)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.business import Business


class Customer(TimestampMixin, Base):
    """A person who booked with a business. ``phone`` is normalised (digits, optional leading ``+``)."""

    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("business_id", "phone", name="uq_customers_business_phone"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    business: Mapped[Business] = relationship(back_populates="customers")
    appointments: Mapped[list[Appointment]] = relationship(back_populates="customer")

    def __repr__(self) -> str:
        return f"<Customer id={self.id} business_id={self.business_id}>"

"""Subscription payments received (Razorpay charges and manually recorded payments): the revenue ledger."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin
from app.models.types import UTCDateTime

PAYMENT_SOURCES: tuple[str, ...] = ("razorpay", "manual")


class Payment(CreatedAtMixin, Base):
    """One payment from a business. Rows outlive the business (SET NULL) so revenue history stays correct."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("source IN ('razorpay', 'manual')", name="source_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int | None] = mapped_column(
        ForeignKey("businesses.id", ondelete="SET NULL"), index=True, nullable=True
    )
    business_name: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default=text("'INR'")
    )
    paid_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recorded_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<Payment id={self.id} business_id={self.business_id} amount={self.amount}>"

"""Business (tenant) model."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String, false, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.types import UTCDateTime

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.customer import Customer
    from app.models.service import Service
    from app.models.user import User
    from app.models.working_hours import WorkingHours

PLANS: tuple[str, ...] = ("trial", "pro")
SUBSCRIPTION_STATUSES: tuple[str, ...] = ("trialing", "active", "past_due", "cancelled", "expired")
SLOT_INTERVALS: tuple[int, ...] = (5, 10, 15, 20, 30, 60)
SLUG_PATTERN: str = r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$"


class Business(TimestampMixin, Base):
    """A tenant: one clinic/salon with its own public booking page at ``/<slug>``."""

    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Asia/Kolkata", server_default=text("'Asia/Kolkata'")
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR", server_default=text("'INR'")
    )
    slot_interval_min: Mapped[int] = mapped_column(
        Integer, nullable=False, default=15, server_default=text("15")
    )
    booking_window_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default=text("60")
    )
    min_notice_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default=text("60")
    )
    plan: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trial", server_default=text("'trial'")
    )
    subscription_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trialing", server_default=text("'trialing'")
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    razorpay_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Set by a SlotEase admin: the public booking page stops taking bookings regardless of plan.
    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())

    users: Mapped[list[User]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    services: Mapped[list[Service]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    working_hours: Mapped[list[WorkingHours]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    customers: Mapped[list[Customer]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    appointments: Mapped[list[Appointment]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def is_bookable(self) -> bool:
        """Return True if the public booking page may accept bookings right now.

        A suspended business never is. Otherwise active subscriptions are always bookable; a trial is
        bookable until ``trial_ends_at``; ``past_due`` / ``cancelled`` stay bookable until the paid
        ``current_period_end``.
        """
        if self.is_suspended:
            return False
        now = datetime.now(UTC)
        status = self.subscription_status
        if status == "active":
            return True
        if status == "trialing":
            return self.trial_ends_at is not None and _as_aware(self.trial_ends_at) > now
        if status in ("past_due", "cancelled"):
            return self.current_period_end is not None and _as_aware(self.current_period_end) > now
        return False

    def __repr__(self) -> str:
        return f"<Business id={self.id} slug={self.slug!r}>"


def _as_aware(value: datetime) -> datetime:
    """Treat a naive datetime (not yet round-tripped through the DB) as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)

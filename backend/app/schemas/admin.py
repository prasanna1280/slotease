"""Platform admin schemas: sign-in, reports, businesses, subscriptions, payments, bookings, audit log."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import APPOINTMENT_STATUSES, PLANS, SUBSCRIPTION_STATUSES
from app.schemas.common import ORMModel
from app.services.validators import normalize_phone

AdminStatus = Literal["trialing", "trial_expired", "active", "past_due", "cancelled", "expired", "suspended"]
Granularity = Literal["month", "quarter", "half_year", "year"]
Basis = Literal["calendar", "fiscal"]

# --------------------------------------------------------------------------- sign-in


class AdminLoginIn(BaseModel):
    """Step 1 of admin sign-in: email and password."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AdminLoginOut(BaseModel):
    """Step 1 result. ``setup`` means 2FA is not enrolled yet: show ``secret`` / ``otpauth_uri`` as a QR."""

    step: Literal["totp", "setup"]
    challenge_token: str
    secret: str | None = None
    otpauth_uri: str | None = None


class AdminVerifyIn(BaseModel):
    """Step 2 of admin sign-in: the 6-digit code from the authenticator app."""

    challenge_token: str = Field(min_length=1, max_length=2000)
    code: str = Field(min_length=6, max_length=10)


class AdminOut(ORMModel):
    """The signed-in admin."""

    id: int
    email: str
    full_name: str
    last_login_at: datetime | None = None


class AdminSessionOut(BaseModel):
    """Admin session token (not refreshable; sign in again after ``expires_in`` seconds)."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: AdminOut


# --------------------------------------------------------------------------- shared rows


class PaymentOut(ORMModel):
    """One revenue entry."""

    id: int
    business_id: int | None
    business_name: str
    source: str
    provider_payment_id: str | None
    amount: Decimal
    currency: str
    paid_at: datetime
    note: str | None
    created_at: datetime


class PaymentPage(BaseModel):
    """Paginated payments with the total amount of everything matched."""

    items: list[PaymentOut]
    total: int
    total_amount: Decimal
    page: int
    page_size: int


class AdminBusinessRow(BaseModel):
    """A business in admin lists."""

    id: int
    name: str
    slug: str
    phone: str
    owner_name: str | None
    owner_email: str | None
    plan: str
    subscription_status: str
    status: AdminStatus
    is_suspended: bool
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    created_at: datetime
    appointments_count: int
    customers_count: int
    last_booking_at: datetime | None
    revenue_total: Decimal


class AdminBusinessPage(BaseModel):
    """Paginated businesses."""

    items: list[AdminBusinessRow]
    total: int
    page: int
    page_size: int


class AdminAppointmentOut(BaseModel):
    """An appointment as seen by an admin (times in the business's timezone)."""

    id: int
    reference: str | None
    business_id: int
    business_name: str
    business_slug: str
    business_timezone: str
    service_name: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    start_time: datetime
    end_time: datetime
    status: str
    price: Decimal
    source: str
    notes: str | None
    created_at: datetime


class AuditOut(ORMModel):
    """One audit-log entry."""

    id: int
    admin_email: str
    action: str
    business_id: int | None
    target_type: str | None
    target_id: int | None
    summary: str
    details: dict[str, Any]
    ip_address: str | None
    created_at: datetime


class AuditPage(BaseModel):
    """Paginated audit log."""

    items: list[AuditOut]
    total: int
    page: int
    page_size: int


# --------------------------------------------------------------------------- reports


class CountsByStatus(BaseModel):
    """How many businesses are in each admin status."""

    trialing: int = 0
    trial_expired: int = 0
    active: int = 0
    past_due: int = 0
    cancelled: int = 0
    expired: int = 0
    suspended: int = 0


class MonthlySignups(BaseModel):
    """Sign-ups and first payments in one month."""

    month: str
    label: str
    signups: int
    first_payments: int


class OverviewOut(BaseModel):
    """Admin dashboard summary."""

    generated_at: datetime
    timezone: str
    plan_price: Decimal
    businesses_total: int
    businesses_new_this_month: int
    businesses_new_last_month: int
    status_counts: CountsByStatus
    paying_businesses: int
    mrr: Decimal
    arr: Decimal
    revenue_this_month: Decimal
    revenue_last_month: Decimal
    revenue_this_quarter: Decimal
    revenue_this_year: Decimal
    revenue_lifetime: Decimal
    trial_conversion_rate: float | None
    bookings_today: int
    bookings_this_month: int
    bookings_total: int
    end_customers_total: int
    signups_by_month: list[MonthlySignups]
    recent_businesses: list[AdminBusinessRow]
    recent_payments: list[PaymentOut]


class RevenuePeriod(BaseModel):
    """Revenue in one reporting period."""

    key: str
    label: str
    start: date
    end: date
    revenue: Decimal
    payments: int
    paying_businesses: int
    new_paying_businesses: int
    change_pct: float | None


class RevenueOut(BaseModel):
    """Revenue report by month, quarter, half-year or year."""

    granularity: Granularity
    basis: Basis
    timezone: str
    periods: list[RevenuePeriod]
    total_revenue: Decimal
    total_payments: int
    average_revenue: Decimal


class SubscriptionsOut(BaseModel):
    """Subscription health: counts, MRR and the businesses that need attention."""

    status_counts: CountsByStatus
    mrr: Decimal
    trials_ending_soon: list[AdminBusinessRow]
    renewals_due: list[AdminBusinessRow]
    past_due: list[AdminBusinessRow]
    recently_cancelled: list[AdminBusinessRow]


# --------------------------------------------------------------------------- business detail / actions


class AdminOwnerOut(BaseModel):
    """A user of the business."""

    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    active_sessions: int


class AdminBusinessStats(BaseModel):
    """Activity of one business."""

    services: int
    customers: int
    appointments_total: int
    appointments_upcoming: int
    completed: int
    no_shows: int
    cancelled: int
    last_booking_at: datetime | None
    revenue_total: Decimal


class AdminBusinessDetail(BaseModel):
    """Everything an admin needs about one business."""

    id: int
    name: str
    slug: str
    phone: str
    email: str | None
    address: str | None
    timezone: str
    plan: str
    subscription_status: str
    status: AdminStatus
    is_suspended: bool
    is_bookable: bool
    trial_ends_at: datetime | None
    current_period_end: datetime | None
    razorpay_subscription_id: str | None
    created_at: datetime
    owners: list[AdminOwnerOut]
    stats: AdminBusinessStats
    recent_appointments: list[AdminAppointmentOut]
    payments: list[PaymentOut]
    audit: list[AuditOut]


class AdminBusinessUpdate(BaseModel):
    """Fields an admin may change. Omitted fields are left as they are."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=255)
    plan: str | None = None
    subscription_status: str | None = None
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    is_suspended: bool | None = None

    @field_validator("name", "address")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return None if value is None else normalize_phone(value)

    @field_validator("plan")
    @classmethod
    def _plan(cls, value: str | None) -> str | None:
        if value is not None and value not in PLANS:
            raise ValueError(f"Plan must be one of: {', '.join(PLANS)}.")
        return value

    @field_validator("subscription_status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        if value is not None and value not in SUBSCRIPTION_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(SUBSCRIPTION_STATUSES)}.")
        return value

    @field_validator("trial_ends_at", "current_period_end")
    @classmethod
    def _aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Include a timezone offset, e.g. 2026-12-31T23:59:00+05:30.")
        return value


class ExtendTrialIn(BaseModel):
    """Add days to the free trial (from today if it already ended)."""

    days: int = Field(ge=1, le=365)


class ManualPaymentIn(BaseModel):
    """Record a payment received outside Razorpay (bank transfer, UPI, cash)."""

    amount: Decimal = Field(gt=0, le=Decimal("1000000"), max_digits=10, decimal_places=2)
    paid_at: datetime | None = None
    note: str | None = Field(default=None, max_length=255)

    @field_validator("paid_at")
    @classmethod
    def _aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Include a timezone offset.")
        return value


class ResetLinkOut(BaseModel):
    """A password-reset link for an owner (also e-mailed when e-mail is configured)."""

    reset_url: str
    expires_minutes: int


class AdminDeleteBusinessIn(BaseModel):
    """Type the business's slug to confirm deletion."""

    confirm: str = Field(min_length=1, max_length=100)


class AdminAppointmentUpdate(BaseModel):
    """Change an appointment's status."""

    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in APPOINTMENT_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(APPOINTMENT_STATUSES)}.")
        return value


class ViewAsOut(BaseModel):
    """A short read-only owner session for "view as owner"."""

    access_token: str
    expires_in: int
    business_name: str
    owner_email: str

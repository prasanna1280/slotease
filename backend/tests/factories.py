"""Test data factories and shared constants (imported by conftest and test modules)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password
from app.models import Appointment, Business, Customer, Service, User, WorkingHours

IST = ZoneInfo("Asia/Kolkata")
NY = ZoneInfo("America/New_York")

# Thursday 8 Oct 2026, 10:00 in Asia/Kolkata. Every test runs with this frozen "now" by default.
FIXED_NOW = datetime(2026, 10, 8, 4, 30, tzinfo=UTC)

DEFAULT_PASSWORD = "Passw0rd123"
# Monday..Saturday 09:00-18:00 (the registration default).
DEFAULT_HOURS: list[tuple[int, str, str]] = [(d, "09:00", "18:00") for d in range(6)]


def hhmm(value: str) -> time:
    """Parse ``"HH:MM"``."""
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def local(day: date, wall: str, tz: ZoneInfo = IST) -> datetime:
    """Aware datetime for a local wall-clock time on ``day``."""
    return datetime.combine(day, hhmm(wall), tzinfo=tz)


@dataclass
class Tenant:
    """A business with its owner user and a ready-to-use bearer header."""

    business: Business
    user: User
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


def make_tenant(
    db: Session,
    *,
    name: str = "Glow Salon",
    slug: str = "glow-salon",
    email: str | None = None,
    phone: str = "+919876543210",
    timezone: str = "Asia/Kolkata",
    hours: list[tuple[int, str, str]] | None = None,
    password: str = DEFAULT_PASSWORD,
    full_name: str = "Asha K",
    **business_fields: object,
) -> Tenant:
    """Create a bookable business (trial ending 14 real days from now), its owner and working hours."""
    fields: dict[str, object] = {
        "plan": "trial",
        "subscription_status": "trialing",
        # Business.is_bookable uses the real clock, so the trial must end in the real future.
        "trial_ends_at": datetime.now(UTC) + timedelta(days=14),
    }
    fields.update(business_fields)
    business = Business(name=name, slug=slug, phone=phone, email=email, timezone=timezone, **fields)
    db.add(business)
    db.flush()
    user = User(
        business_id=business.id,
        email=email or f"owner@{slug}.example.com",
        password_hash=hash_password(password),
        full_name=full_name,
        role="owner",
        is_active=True,
    )
    db.add(user)
    for weekday, open_t, close_t in DEFAULT_HOURS if hours is None else hours:
        db.add(
            WorkingHours(
                business_id=business.id, weekday=weekday, open_time=hhmm(open_t), close_time=hhmm(close_t)
            )
        )
    db.commit()
    return Tenant(business=business, user=user, token=create_access_token(user.id, business.id))


def make_service(
    db: Session,
    business: Business,
    *,
    name: str = "Haircut",
    duration_min: int = 30,
    price: str = "300.00",
    is_active: bool = True,
    description: str | None = None,
) -> Service:
    service = Service(
        business_id=business.id,
        name=name,
        duration_min=duration_min,
        price=Decimal(price),
        is_active=is_active,
        description=description,
    )
    db.add(service)
    db.commit()
    return service


def make_customer(
    db: Session,
    business: Business,
    *,
    name: str = "Karthik S",
    phone: str = "+919800000001",
    email: str | None = None,
    created_at: datetime | None = None,
) -> Customer:
    customer = Customer(business_id=business.id, name=name, phone=phone, email=email)
    if created_at is not None:
        customer.created_at = created_at
    db.add(customer)
    db.commit()
    return customer


def make_appointment(
    db: Session,
    business: Business,
    service: Service,
    customer: Customer,
    start: datetime,
    *,
    status: str = "booked",
    duration_min: int | None = None,
    price: str | None = None,
    source: str = "online",
    notes: str | None = None,
) -> Appointment:
    """Insert an appointment directly (bypasses booking rules) and set its reference."""
    end = start + timedelta(minutes=duration_min or service.duration_min)
    appt = Appointment(
        business_id=business.id,
        service_id=service.id,
        customer_id=customer.id,
        start_time=start,
        end_time=end,
        status=status,
        price=Decimal(price) if price is not None else service.price,
        source=source,
        notes=notes,
    )
    db.add(appt)
    db.flush()
    tz = ZoneInfo(business.timezone)
    appt.reference = f"APT-{start.astimezone(tz):%Y%m%d}-{appt.id:04d}"
    db.commit()
    return appt


def booking_body(
    service_id: int,
    start: datetime | str,
    *,
    name: str = "Karthik S",
    phone: str = "+91 98765 43210",
    email: str | None = "k@example.com",
    notes: str | None = None,
) -> dict[str, object]:
    return {
        "service_id": service_id,
        "start_time": start if isinstance(start, str) else start.isoformat(),
        "customer_name": name,
        "customer_phone": phone,
        "customer_email": email,
        "notes": notes,
    }

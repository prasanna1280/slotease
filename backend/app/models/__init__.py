"""SQLAlchemy models. Importing this package registers every table on ``Base.metadata``."""

from app.models.admin import AdminAuditLog, AdminUser
from app.models.appointment import APPOINTMENT_SOURCES, APPOINTMENT_STATUSES, Appointment
from app.models.base import Base, utcnow
from app.models.business import (
    PLANS,
    SLOT_INTERVALS,
    SLUG_PATTERN,
    SUBSCRIPTION_STATUSES,
    Business,
)
from app.models.customer import Customer
from app.models.payment import PAYMENT_SOURCES, Payment
from app.models.payment_event import PaymentEvent
from app.models.refresh_token import RefreshToken
from app.models.service import Service
from app.models.types import UTCDateTime
from app.models.user import USER_ROLES, User
from app.models.working_hours import WorkingHours

__all__ = [
    "APPOINTMENT_SOURCES",
    "APPOINTMENT_STATUSES",
    "PAYMENT_SOURCES",
    "PLANS",
    "SLOT_INTERVALS",
    "SLUG_PATTERN",
    "SUBSCRIPTION_STATUSES",
    "USER_ROLES",
    "AdminAuditLog",
    "AdminUser",
    "Appointment",
    "Base",
    "Business",
    "Customer",
    "Payment",
    "PaymentEvent",
    "RefreshToken",
    "Service",
    "UTCDateTime",
    "User",
    "WorkingHours",
    "utcnow",
]

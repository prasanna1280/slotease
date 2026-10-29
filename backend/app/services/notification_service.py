"""Transactional e-mail delivery: Resend -> SMTP -> console log fallback.

Public functions never raise; failures are logged. ``send_booking_confirmation`` opens its own DB
session because it runs as a FastAPI background task after the request session is closed.
Tests can monkeypatch ``notification_service.SessionLocal`` (session factory) and
``notification_service.send_email``.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import Appointment, Business, Customer, Service, User
from app.services import email_templates
from app.services.time_utils import format_human, get_tz, is_valid_timezone, to_local

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
HTTP_TIMEOUT_SECONDS = 10.0
SMTP_TIMEOUT_SECONDS = 15.0


def _send_via_resend(to: str, subject: str, html: str, text: str) -> bool:
    response = httpx.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={"from": settings.EMAIL_FROM, "to": [to], "subject": subject, "html": html, "text": text},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        logger.error("Resend rejected email (HTTP %s): %s", response.status_code, response.text[:300])
        return False
    return True


def _send_via_smtp(to: str, subject: str, html: str, text: str) -> bool:
    message = EmailMessage()
    name, address = parseaddr(settings.EMAIL_FROM)
    message["From"] = formataddr((name, address)) if address else settings.EMAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(message)
    return True


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """Send one e-mail. Returns True when handed to a provider (or logged to console). Never raises."""
    if not to:
        return False
    try:
        if settings.RESEND_API_KEY:
            return _send_via_resend(to, subject, html, text)
        if settings.SMTP_HOST:
            return _send_via_smtp(to, subject, html, text)
        if settings.is_production:
            logger.info("email (console) to=%s subject=%r", to, subject)
        else:
            logger.info("email (console) to=%s subject=%r\n%s", to, subject, text)
        return True
    except Exception:
        logger.exception("Failed to send email to=%s subject=%r", to, subject)
        return False


def send_password_reset(email: str, reset_url: str) -> None:
    """E-mail a password reset link. Never raises."""
    try:
        rendered = email_templates.password_reset(reset_url, settings.PASSWORD_RESET_EXPIRE_MINUTES)
        send_email(email, rendered.subject, rendered.html, rendered.text)
    except Exception:
        logger.exception("Failed to send password reset email")


def send_booking_confirmation(appointment_id: int) -> None:
    """E-mail the customer (if they gave an e-mail) and the business owner(s) about a booking.

    Opens its own session (runs as a background task). Never raises.
    """
    try:
        with SessionLocal() as db:
            appointment = db.get(Appointment, appointment_id)
            if appointment is None:
                logger.warning("Booking confirmation skipped: appointment id=%s not found", appointment_id)
                return
            business = db.get(Business, appointment.business_id)
            service = db.get(Service, appointment.service_id)
            customer = db.get(Customer, appointment.customer_id)
            if business is None or service is None or customer is None:
                logger.warning("Booking confirmation skipped: incomplete data for id=%s", appointment_id)
                return
            # Tenant-scoped: only owners of this appointment's business.
            owner_emails = list(
                db.scalars(
                    select(User.email).where(
                        User.business_id == business.id,
                        User.role == "owner",
                        User.is_active.is_(True),
                    )
                )
            )

            tz_name = business.timezone if is_valid_timezone(business.timezone) else "UTC"
            local_start = to_local(appointment.start_time, get_tz(tz_name))
            ctx = email_templates.BookingEmailContext(
                business_name=business.name,
                business_phone=business.phone,
                business_address=business.address,
                service_name=service.name,
                when=format_human(local_start),
                reference=appointment.reference or f"#{appointment.id}",
                price=email_templates.format_price(appointment.price, business.currency),
                customer_name=customer.name,
                customer_phone=customer.phone,
                customer_email=customer.email,
                notes=appointment.notes,
                manage_url=f"{settings.FRONTEND_URL.rstrip('/')}/app",
            )

        if ctx.customer_email:
            rendered = email_templates.booking_confirmation_customer(ctx)
            send_email(ctx.customer_email, rendered.subject, rendered.html, rendered.text)
        owner_mail = email_templates.booking_notification_owner(ctx)
        for owner_email in owner_emails:
            send_email(owner_email, owner_mail.subject, owner_mail.html, owner_mail.text)
    except Exception:
        logger.exception("Failed to send booking confirmation for appointment id=%s", appointment_id)

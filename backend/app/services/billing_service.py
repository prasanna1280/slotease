"""Subscription billing with Razorpay: status, subscribe, checkout verification, cancel and webhooks."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import AppError, ConflictError, ServiceUnavailableError
from app.models import Business, Payment, PaymentEvent, User
from app.schemas.billing import BillingOut, SubscribeOut, VerifyIn
from app.services import razorpay_client
from app.services.time_utils import get_tz, is_valid_timezone, now_utc, to_local

logger = logging.getLogger(__name__)

PROVIDER = "razorpay"
SUBSCRIPTION_TOTAL_COUNT = 120
# Used until a webhook reports the real ``current_end`` after checkout verification.
PROVISIONAL_PERIOD_DAYS = 30
# Razorpay needs ``start_at`` comfortably in the future; closer than this starts the plan right away.
MIN_DEFERRED_START = timedelta(minutes=15)

ACTIVE_EVENTS = frozenset({"subscription.activated", "subscription.charged"})
PAST_DUE_EVENTS = frozenset({"subscription.pending", "subscription.halted"})
CANCELLED_EVENTS = frozenset({"subscription.cancelled", "subscription.completed"})


class BillingNotConfiguredError(ServiceUnavailableError):
    """503 BILLING_NOT_CONFIGURED - Razorpay keys are missing on this server."""

    code = "BILLING_NOT_CONFIGURED"
    message = "Billing is not configured on this server."


class InvalidSignatureError(AppError):
    """400 INVALID_SIGNATURE - a Razorpay signature did not verify."""

    status_code = 400
    code = "INVALID_SIGNATURE"
    message = "Payment signature verification failed."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def compute_signature(secret: str, message: bytes) -> str:
    """Return the hex HMAC-SHA256 of ``message`` keyed with ``secret`` (Razorpay's scheme)."""
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def signature_matches(secret: str, message: bytes, signature: str | None) -> bool:
    """Constant-time comparison of a provided signature against the expected one."""
    if not secret or not signature:
        return False
    expected = compute_signature(secret, message)
    return hmac.compare_digest(expected.encode("utf-8"), signature.strip().encode("utf-8"))


def _from_unix(value: Any) -> datetime | None:
    """Convert a unix timestamp (int/str) to an aware UTC datetime, or None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _localise(value: datetime | None, business: Business) -> datetime | None:
    if value is None or not is_valid_timezone(business.timezone):
        return value
    return to_local(value, get_tz(business.timezone))


def _paid_until(business: Business, now: datetime) -> datetime | None:
    """Return when the business's already-covered time (trial or paid period) ends, if still ahead.

    A new subscription starts charging then, so resubscribing never forfeits days already paid for.
    """
    candidates = [
        end
        for end in (business.trial_ends_at, business.current_period_end)
        if end is not None and end > now + MIN_DEFERRED_START
    ]
    return max(candidates, default=None)


def _require_configured() -> None:
    if not settings.billing_configured:
        raise BillingNotConfiguredError()


def get_billing(business: Business) -> BillingOut:
    """Return the current plan/subscription state of ``business``."""
    configured = settings.billing_configured
    return BillingOut(
        plan=business.plan,
        subscription_status=business.subscription_status,
        trial_ends_at=_localise(business.trial_ends_at, business),
        current_period_end=_localise(business.current_period_end, business),
        is_bookable=business.is_bookable,
        price_inr=settings.PLAN_PRICE_INR,
        billing_configured=configured,
        razorpay_key_id=settings.RAZORPAY_KEY_ID if configured else None,
        razorpay_subscription_id=business.razorpay_subscription_id,
    )


# ---------------------------------------------------------------------------
# Owner actions
# ---------------------------------------------------------------------------


def subscribe(db: Session, business: Business, user: User) -> SubscribeOut:
    """Create a Razorpay subscription for the business and return Checkout parameters.

    If trial or paid time remains (e.g. resubscribing after a cancel), the subscription starts when
    that time runs out instead of charging now.

    Raises:
        BillingNotConfiguredError: 503 when Razorpay keys are missing.
        ConflictError: 409 ``ALREADY_SUBSCRIBED`` when the subscription is already active.
        ServiceUnavailableError: 503 ``PAYMENT_PROVIDER_ERROR`` on Razorpay failures.
    """
    _require_configured()
    if business.subscription_status == "active":
        raise ConflictError("This business already has an active subscription.", code="ALREADY_SUBSCRIBED")

    start_at = _paid_until(business, now_utc())
    entity = razorpay_client.create_subscription(
        settings.RAZORPAY_PLAN_ID,
        total_count=SUBSCRIPTION_TOTAL_COUNT,
        notes={"business_id": str(business.id), "business_slug": business.slug},
        start_at=start_at,
    )
    subscription_id = entity.get("id")
    if not isinstance(subscription_id, str) or not subscription_id:
        logger.error("Razorpay create_subscription returned no id for business id=%s", business.id)
        raise ServiceUnavailableError(
            razorpay_client.PROVIDER_ERROR_MESSAGE, code=razorpay_client.PROVIDER_ERROR_CODE
        )

    business.razorpay_subscription_id = subscription_id
    db.commit()
    logger.info("Created Razorpay subscription %s for business id=%s", subscription_id, business.id)

    short_url = entity.get("short_url")
    return SubscribeOut(
        subscription_id=subscription_id,
        key_id=settings.RAZORPAY_KEY_ID,
        short_url=short_url if isinstance(short_url, str) else None,
        amount=settings.PLAN_PRICE_INR * 100,
        currency="INR",
        name=business.name,
        email=user.email,
        contact=business.phone,
        starts_at=_localise(start_at, business),
    )


def verify_checkout(db: Session, business: Business, data: VerifyIn) -> BillingOut:
    """Verify a Checkout signature ``HMAC(key_secret, "payment_id|subscription_id")`` and activate.

    Raises:
        BillingNotConfiguredError: 503 when Razorpay keys are missing.
        InvalidSignatureError: 400 for a bad signature or a subscription of another business.
    """
    _require_configured()
    if business.razorpay_subscription_id != data.razorpay_subscription_id:
        raise InvalidSignatureError()
    message = f"{data.razorpay_payment_id}|{data.razorpay_subscription_id}".encode()
    if not signature_matches(settings.RAZORPAY_KEY_SECRET, message, data.razorpay_signature):
        raise InvalidSignatureError()

    now = now_utc()
    business.subscription_status = "active"
    business.plan = "pro"
    if business.current_period_end is None or business.current_period_end < now:
        # A subscription made during the trial is first charged when the trial ends.
        first_charge = _paid_until(business, now) or now
        business.current_period_end = first_charge + timedelta(days=PROVISIONAL_PERIOD_DAYS)
    db.commit()
    db.refresh(business)
    logger.info("Subscription %s verified for business id=%s", data.razorpay_subscription_id, business.id)
    return get_billing(business)


def cancel(db: Session, business: Business) -> BillingOut:
    """Cancel the subscription at the end of the current cycle.

    Raises:
        BillingNotConfiguredError: 503 when Razorpay keys are missing.
        ConflictError: 409 ``NO_ACTIVE_SUBSCRIPTION`` when there is nothing to cancel.
    """
    _require_configured()
    if not business.razorpay_subscription_id or business.subscription_status not in ("active", "past_due"):
        raise ConflictError("There is no active subscription to cancel.", code="NO_ACTIVE_SUBSCRIPTION")

    entity = razorpay_client.cancel_subscription(business.razorpay_subscription_id, cancel_at_cycle_end=True)
    business.subscription_status = "cancelled"
    period_end = _from_unix(entity.get("current_end")) if isinstance(entity, dict) else None
    if period_end is not None:
        business.current_period_end = period_end
    db.commit()
    db.refresh(business)
    logger.info("Subscription cancelled for business id=%s", business.id)
    return get_billing(business)


def cancel_for_deletion(business: Business) -> None:
    """Stop any live Razorpay subscription immediately, before the business is deleted.

    Raises:
        ServiceUnavailableError: 503 ``PAYMENT_PROVIDER_ERROR`` if Razorpay cannot be reached, so the
            account is never deleted while the customer could still be charged.
    """
    if not business.razorpay_subscription_id or business.subscription_status not in ("active", "past_due"):
        return
    if not settings.billing_configured:
        logger.warning(
            "Business id=%s has subscription %s but billing is not configured; it cannot be cancelled here",
            business.id,
            business.razorpay_subscription_id,
        )
        return
    razorpay_client.cancel_subscription(business.razorpay_subscription_id, cancel_at_cycle_end=False)
    logger.info(
        "Cancelled subscription %s for deleted business id=%s", business.razorpay_subscription_id, business.id
    )


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------


def _find_business(db: Session, subscription: dict[str, Any]) -> Business | None:
    """Locate the business by subscription id, falling back to ``notes.business_id``."""
    sub_id = subscription.get("id")
    if isinstance(sub_id, str) and sub_id:
        business = db.scalar(select(Business).where(Business.razorpay_subscription_id == sub_id))
        if business is not None:
            return business
    notes = subscription.get("notes")
    if isinstance(notes, dict):
        raw_id = notes.get("business_id")
        try:
            business_id = int(raw_id) if raw_id is not None else None
        except (TypeError, ValueError):
            business_id = None
        if business_id is not None:
            return db.get(Business, business_id)
    return None


def _apply_event(business: Business, event_type: str, subscription: dict[str, Any]) -> None:
    """Map a Razorpay subscription event onto the business's subscription state."""
    sub_id = subscription.get("id")
    period_end = _from_unix(subscription.get("current_end"))
    current_sub_id = business.razorpay_subscription_id
    if (
        event_type not in ACTIVE_EVENTS
        and isinstance(sub_id, str)
        and sub_id
        and current_sub_id
        and current_sub_id != sub_id
    ):
        # A superseded subscription (matched via notes.business_id) ending or failing must not
        # downgrade the business's current subscription, e.g. after cancel + re-subscribe.
        logger.info(
            "Ignoring %s for superseded subscription %s (business id=%s uses %s)",
            event_type,
            sub_id,
            business.id,
            current_sub_id,
        )
        return
    if event_type in ACTIVE_EVENTS:
        business.subscription_status = "active"
        business.plan = "pro"
        if isinstance(sub_id, str) and sub_id:
            business.razorpay_subscription_id = sub_id
        if period_end is not None:
            business.current_period_end = period_end
    elif event_type in PAST_DUE_EVENTS:
        business.subscription_status = "past_due"
    elif event_type in CANCELLED_EVENTS:
        business.subscription_status = "cancelled"
        if period_end is not None:
            business.current_period_end = period_end


def _record_charge(
    db: Session, business: Business, subscription: dict[str, Any], payment: dict[str, Any]
) -> None:
    """Add a ``subscription.charged`` payment to the revenue ledger (once per Razorpay payment id)."""
    payment_id = payment.get("id")
    amount = payment.get("amount")
    if (
        not isinstance(payment_id, str)
        or not payment_id
        or isinstance(amount, bool)
        or not isinstance(amount, int)
    ):
        logger.warning("subscription.charged without a usable payment entity for business id=%s", business.id)
        return
    if (
        amount <= 0
        or db.scalar(select(Payment.id).where(Payment.provider_payment_id == payment_id)) is not None
    ):
        return
    sub_id = subscription.get("id")
    currency = payment.get("currency")
    db.add(
        Payment(
            business_id=business.id,
            business_name=business.name,
            source="razorpay",
            provider_payment_id=payment_id[:64],
            provider_subscription_id=sub_id[:64] if isinstance(sub_id, str) else None,
            amount=(Decimal(amount) / 100).quantize(Decimal("0.01")),  # Razorpay amounts are in paise
            currency=currency[:3] if isinstance(currency, str) and currency else "INR",
            paid_at=_from_unix(payment.get("created_at")) or now_utc(),
        )
    )


def handle_webhook(db: Session, raw_body: bytes, signature: str | None, event_id_header: str | None) -> None:
    """Verify, de-duplicate and apply a Razorpay webhook.

    Raises:
        BillingNotConfiguredError: 503 when no webhook secret is configured.
        InvalidSignatureError: 400 for a missing/invalid ``X-Razorpay-Signature``.
        AppError: 400 ``BAD_REQUEST`` for a body that is not a JSON object.
    """
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        raise BillingNotConfiguredError("Billing webhooks are not configured on this server.")
    if not signature_matches(secret, raw_body, signature):
        raise InvalidSignatureError("Webhook signature verification failed.")

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise AppError("Webhook body must be JSON.") from exc
    if not isinstance(payload, dict):
        raise AppError("Webhook body must be a JSON object.")

    event_id = (event_id_header or "").strip() or hashlib.sha256(raw_body).hexdigest()
    event_id = event_id[:100]
    if db.scalar(select(PaymentEvent.id).where(PaymentEvent.event_id == event_id)) is not None:
        logger.info("Duplicate Razorpay webhook %s ignored", event_id)
        return

    event_type = str(payload.get("event") or "unknown")[:60]
    inner = payload.get("payload")
    sub_wrapper = inner.get("subscription") if isinstance(inner, dict) else None
    subscription: dict[str, Any] = {}
    if isinstance(sub_wrapper, dict) and isinstance(sub_wrapper.get("entity"), dict):
        subscription = sub_wrapper["entity"]

    pay_wrapper = inner.get("payment") if isinstance(inner, dict) else None
    payment: dict[str, Any] = {}
    if isinstance(pay_wrapper, dict) and isinstance(pay_wrapper.get("entity"), dict):
        payment = pay_wrapper["entity"]

    business = _find_business(db, subscription) if subscription else None
    if business is not None:
        _apply_event(business, event_type, subscription)
        if event_type == "subscription.charged" and payment:
            _record_charge(db, business, subscription, payment)
    else:
        logger.warning("Razorpay webhook %s (%s) matched no business", event_id, event_type)

    db.add(
        PaymentEvent(
            business_id=business.id if business is not None else None,
            provider=PROVIDER,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # A concurrent delivery of the same event won the race; treat as duplicate.
        db.rollback()
        logger.info("Duplicate Razorpay webhook %s ignored (race)", event_id)
        return
    logger.info("Processed Razorpay webhook %s (%s)", event_id, event_type)

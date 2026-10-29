"""Billing schemas (Razorpay subscriptions)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BillingOut(BaseModel):
    """Current plan and subscription state of the business."""

    plan: str
    subscription_status: str
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    is_bookable: bool
    price_inr: int
    billing_configured: bool
    razorpay_key_id: str | None = None
    razorpay_subscription_id: str | None = None


class SubscribeOut(BaseModel):
    """Data the frontend needs to open Razorpay Checkout for a subscription."""

    subscription_id: str
    key_id: str
    short_url: str | None = None
    amount: int
    currency: str = "INR"
    name: str
    email: str
    contact: str


class VerifyIn(BaseModel):
    """Razorpay Checkout success payload for a subscription."""

    razorpay_payment_id: str = Field(min_length=1, max_length=100)
    razorpay_subscription_id: str = Field(min_length=1, max_length=100)
    razorpay_signature: str = Field(min_length=1, max_length=256)


class WebhookAck(BaseModel):
    """Webhook acknowledgement."""

    status: str = "ok"

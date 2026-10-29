"""Razorpay subscription billing: status, subscribe, verify, cancel, webhook.

Mounted by ``app.main`` under ``/api/v1`` -> ``/api/v1/billing``.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.dependencies import CurrentBusiness, CurrentUser, DbSession
from app.schemas.billing import BillingOut, SubscribeOut, VerifyIn, WebhookAck
from app.schemas.common import ErrorOut
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("", response_model=BillingOut, responses={401: {"model": ErrorOut}})
def get_billing(business: CurrentBusiness) -> BillingOut:
    """Return the plan and subscription status."""
    return billing_service.get_billing(business)


@router.post(
    "/subscribe",
    response_model=SubscribeOut,
    responses={409: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
def subscribe(user: CurrentUser, business: CurrentBusiness, db: DbSession) -> SubscribeOut:
    """Create a Razorpay subscription and return Checkout parameters."""
    return billing_service.subscribe(db, business, user)


@router.post(
    "/verify",
    response_model=BillingOut,
    responses={400: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
def verify(data: VerifyIn, business: CurrentBusiness, db: DbSession) -> BillingOut:
    """Verify the Razorpay Checkout signature and activate the subscription."""
    return billing_service.verify_checkout(db, business, data)


@router.post(
    "/cancel",
    response_model=BillingOut,
    responses={409: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
def cancel(business: CurrentBusiness, db: DbSession) -> BillingOut:
    """Cancel the subscription at the end of the current billing cycle."""
    return billing_service.cancel(db, business)


@router.post("/webhook", response_model=WebhookAck, responses={400: {"model": ErrorOut}})
async def webhook(request: Request, db: DbSession) -> WebhookAck:
    """Razorpay webhook (no auth; authenticated by ``X-Razorpay-Signature`` over the raw body)."""
    raw_body = await request.body()
    await run_in_threadpool(
        billing_service.handle_webhook,
        db,
        raw_body,
        request.headers.get("X-Razorpay-Signature"),
        request.headers.get("X-Razorpay-Event-Id"),
    )
    return WebhookAck(status="ok")

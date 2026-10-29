"""Minimal Razorpay REST wrapper (subscriptions).

Module-level functions so tests can replace them with ``monkeypatch.setattr(razorpay_client, "...", fake)``.
Every transport/HTTP failure is raised as ``ServiceUnavailableError`` (503 ``PAYMENT_PROVIDER_ERROR``).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings
from app.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)

API_BASE = "https://api.razorpay.com/v1"
TIMEOUT_SECONDS = 15.0
PROVIDER_ERROR_CODE = "PAYMENT_PROVIDER_ERROR"
PROVIDER_ERROR_MESSAGE = "The payment provider could not be reached. Please try again shortly."


def _auth() -> tuple[str, str]:
    """HTTP basic-auth credentials (key id, key secret)."""
    return settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET


def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST JSON to the Razorpay API and return the decoded JSON object."""
    url = f"{API_BASE}{path}"
    try:
        response = httpx.post(url, json=payload, auth=_auth(), timeout=TIMEOUT_SECONDS)
    except httpx.HTTPError as exc:
        logger.error("Razorpay request to %s failed: %s", path, exc)
        raise ServiceUnavailableError(PROVIDER_ERROR_MESSAGE, code=PROVIDER_ERROR_CODE) from exc
    if response.status_code >= 400:
        logger.error("Razorpay %s returned HTTP %s: %s", path, response.status_code, response.text[:500])
        raise ServiceUnavailableError(PROVIDER_ERROR_MESSAGE, code=PROVIDER_ERROR_CODE)
    try:
        data = response.json()
    except ValueError as exc:
        logger.error("Razorpay %s returned a non-JSON body", path)
        raise ServiceUnavailableError(PROVIDER_ERROR_MESSAGE, code=PROVIDER_ERROR_CODE) from exc
    if not isinstance(data, dict):
        raise ServiceUnavailableError(PROVIDER_ERROR_MESSAGE, code=PROVIDER_ERROR_CODE)
    return data


def create_subscription(
    plan_id: str, total_count: int = 120, notes: dict[str, str] | None = None
) -> dict[str, Any]:
    """Create a Razorpay subscription for ``plan_id``; returns the entity (``id``, ``short_url``, ...)."""
    payload: dict[str, Any] = {
        "plan_id": plan_id,
        "total_count": total_count,
        "customer_notify": 1,
        "notes": notes or {},
    }
    return _post("/subscriptions", payload)


def cancel_subscription(sub_id: str, cancel_at_cycle_end: bool = True) -> dict[str, Any]:
    """Cancel a subscription (by default at the end of the current billing cycle)."""
    return _post(f"/subscriptions/{sub_id}/cancel", {"cancel_at_cycle_end": 1 if cancel_at_cycle_end else 0})

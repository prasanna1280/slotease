"""Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) for admin 2FA."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

DIGITS = 6
STEP_SECONDS = 30
# Accept the previous and next step too, to tolerate clock drift between phone and server.
DRIFT_STEPS = 1
ISSUER = "SlotEase Admin"


def generate_secret() -> str:
    """Return a new random base32 secret (160 bits), as authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _key(secret: str) -> bytes:
    padded = secret.upper() + "=" * (-len(secret) % 8)
    return base64.b32decode(padded)


def current_step(now: float | None = None) -> int:
    """Return the TOTP time step for ``now`` (seconds since the epoch)."""
    return int((time.time() if now is None else now) // STEP_SECONDS)


def code_at(secret: str, step: int) -> str:
    """Return the 6-digit code for ``secret`` at time ``step`` (RFC 4226 dynamic truncation)."""
    digest = hmac.new(_key(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def verify(secret: str, code: str, *, last_step: int | None = None, now: float | None = None) -> int | None:
    """Check ``code`` against ``secret``; return the matched step, or None.

    Steps at or before ``last_step`` are rejected so each code can be used only once.
    """
    cleaned = code.replace(" ", "")
    if len(cleaned) != DIGITS or not cleaned.isdigit():
        return None
    step = current_step(now)
    for candidate in range(step - DRIFT_STEPS, step + DRIFT_STEPS + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(code_at(secret, candidate), cleaned):
            return candidate
    return None


def provisioning_uri(secret: str, account: str) -> str:
    """Return the ``otpauth://`` URI that authenticator apps read from a QR code."""
    label = quote(f"{ISSUER}:{account}")
    query = urlencode({"secret": secret, "issuer": ISSUER, "digits": DIGITS, "period": STEP_SECONDS})
    return f"otpauth://totp/{label}?{query}"

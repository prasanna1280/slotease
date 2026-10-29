"""Reusable input validators/normalisers (phone, slug, password).

All functions raise ``ValueError`` on invalid input so they can be used directly inside
Pydantic ``field_validator`` s (which turns them into 422 VALIDATION_ERROR responses).
"""

from __future__ import annotations

import re
import unicodedata

PHONE_MIN_DIGITS = 7
PHONE_MAX_DIGITS = 15
SLUG_MAX_LENGTH = 40
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
_PHONE_SEPARATORS = re.compile(r"[\s\-().]")

RESERVED_SLUGS: frozenset[str] = frozenset(
    {
        "app",
        "api",
        "admin",
        "login",
        "register",
        "signup",
        "book",
        "booking",
        "dashboard",
        "settings",
        "billing",
        "pricing",
        "help",
        "support",
        "docs",
        "static",
        "assets",
        "health",
        "forgot-password",
        "reset-password",
        "terms",
        "privacy",
        "about",
        "www",
        "mail",
    }
)


def normalize_phone(value: str) -> str:
    """Normalise a phone number to digits with an optional leading ``+`` (e.g. ``+919876543210``).

    Spaces, dashes, dots and brackets are stripped. 7-15 digits are required.

    Raises:
        ValueError: if the result is not a valid phone number.
    """
    if value is None:
        raise ValueError("Phone number is required.")
    raw = _PHONE_SEPARATORS.sub("", str(value).strip())
    plus = raw.startswith("+")
    digits = raw[1:] if plus else raw
    if not digits.isdigit() or not digits.isascii():
        raise ValueError("Phone number may contain only digits, spaces, dashes, brackets and a leading +.")
    if not PHONE_MIN_DIGITS <= len(digits) <= PHONE_MAX_DIGITS:
        raise ValueError(f"Phone number must have {PHONE_MIN_DIGITS}-{PHONE_MAX_DIGITS} digits.")
    return f"+{digits}" if plus else digits


def is_reserved_slug(slug: str) -> bool:
    """Return True if ``slug`` collides with an app route (e.g. ``login``, ``api``)."""
    return slug.strip().lower() in RESERVED_SLUGS


def validate_slug(value: str) -> str:
    """Lower-case and validate a booking-page slug (3-40 chars, ``a-z0-9-``, no leading/trailing dash).

    Does NOT check reserved slugs - callers raise 422 ``SLUG_RESERVED`` via :func:`is_reserved_slug`.

    Raises:
        ValueError: if the slug format is invalid.
    """
    slug = str(value).strip().lower()
    if not SLUG_PATTERN.fullmatch(slug):
        raise ValueError(
            "Slug must be 3-40 characters of lowercase letters, numbers and dashes, "
            "and must start and end with a letter or number."
        )
    return slug


def slugify(text: str, max_length: int = SLUG_MAX_LENGTH) -> str:
    """Turn arbitrary text (e.g. a business name) into a slug candidate.

    ``"Glow Salon & Spa!"`` -> ``"glow-salon-spa"``. Pads very short results so the
    output always satisfies :data:`SLUG_PATTERN` (falls back to ``"business"``).
    """
    ascii_text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug[:max_length].strip("-")
    if not slug:
        slug = "business"
    while len(slug) < 3:
        slug = f"{slug}-1" if not slug.endswith("-") else f"{slug}1"
    return slug


def validate_password_strength(password: str) -> str:
    """Require 8-128 characters with at least one letter and one digit.

    Raises:
        ValueError: with a human-readable message when the rule is not met.
    """
    if not isinstance(password, str):
        raise ValueError("Password is required.")
    if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters long.")
    if not any(ch.isalpha() for ch in password) or not any(ch.isdigit() for ch in password):
        raise ValueError("Password must contain at least one letter and one number.")
    return password

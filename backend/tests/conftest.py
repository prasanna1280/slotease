"""Shared pytest fixtures.

Environment variables are set BEFORE any ``app`` import so ``settings`` (and the rate limiter) are
built for tests: rate limiting off, no e-mail/Razorpay providers, a throwaway SQLite file for the
app's default engine (never used by requests: ``get_db`` is overridden per test with an isolated
in-memory SQLite database on a ``StaticPool``).
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="slotease-tests-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_TMP_DIR / 'default.db').as_posix()}",
        "SECRET_KEY": "test-secret-key-that-is-at-least-32-bytes-long",
        "ENVIRONMENT": "test",
        "RATE_LIMIT_ENABLED": "false",
        "LOG_LEVEL": "WARNING",
        "FRONTEND_URL": "http://localhost:5173",
        "CORS_ORIGINS": "http://localhost:5173",
        "RESEND_API_KEY": "",
        "SMTP_HOST": "",
        "SMTP_USER": "",
        "SMTP_PASSWORD": "",
        "RAZORPAY_KEY_ID": "",
        "RAZORPAY_KEY_SECRET": "",
        "RAZORPAY_PLAN_ID": "",
        "RAZORPAY_WEBHOOK_SECRET": "",
    }
)

import bcrypt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import enable_sqlite_foreign_keys, get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models import Base  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.services import booking_service, notification_service, slot_service, stats_service  # noqa: E402
from tests.factories import FIXED_NOW, Tenant, make_tenant  # noqa: E402

# Originals, captured before any fixture patches them (for tests that exercise the real functions).
REAL_SEND_EMAIL = notification_service.send_email
REAL_SEND_BOOKING_CONFIRMATION = notification_service.send_booking_confirmation
_REAL_GENSALT = bcrypt.gensalt

FROZEN_MODULES = (slot_service, booking_service, stats_service)


@pytest.fixture(autouse=True, scope="session")
def _fast_bcrypt() -> Iterator[None]:
    """Use 4 bcrypt rounds in tests (hashes are still real ``$2b$`` bcrypt)."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(bcrypt, "gensalt", lambda rounds=4, prefix=b"2b": _REAL_GENSALT(rounds, prefix))
        yield


@pytest.fixture(autouse=True)
def _rate_limit_off() -> Iterator[None]:
    limiter.enabled = False
    limiter.reset()
    yield
    limiter.enabled = False
    limiter.reset()


@pytest.fixture(autouse=True)
def freeze(monkeypatch: pytest.MonkeyPatch) -> Callable[[datetime], None]:
    """Freeze ``now_utc`` for slot/booking/stats logic at ``FIXED_NOW``; call the fixture to move it."""

    def set_now(value: datetime) -> None:
        for module in FROZEN_MODULES:
            monkeypatch.setattr(module, "now_utc", lambda value=value: value)

    set_now(FIXED_NOW)
    return set_now


@dataclass
class Outbox:
    """Captured side effects: booking confirmations scheduled and e-mails sent."""

    bookings: list[int] = field(default_factory=list)
    emails: list[dict[str, str]] = field(default_factory=list)


@pytest.fixture(autouse=True)
def outbox(monkeypatch: pytest.MonkeyPatch) -> Outbox:
    box = Outbox()

    def fake_send_email(to: str, subject: str, html: str, text: str) -> bool:
        box.emails.append({"to": to, "subject": subject, "html": html, "text": text})
        return True

    monkeypatch.setattr(notification_service, "send_email", fake_send_email)
    monkeypatch.setattr(notification_service, "send_booking_confirmation", box.bookings.append)
    return box


def make_memory_engine() -> Engine:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def engine() -> Iterator[Engine]:
    eng = make_memory_engine()
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def override_db(factory: sessionmaker[Session]) -> Callable[[], Iterator[Session]]:
    def _get_db() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    return _get_db


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    fastapi_app.dependency_overrides[get_db] = override_db(session_factory)
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def tenant(db: Session) -> Tenant:
    """Glow Salon (Asia/Kolkata), Mon-Sat 09:00-18:00, bookable trial."""
    return make_tenant(db)


@pytest.fixture
def other_tenant(db: Session) -> Tenant:
    return make_tenant(db, name="Other Clinic", slug="other-clinic", phone="+919811111111")

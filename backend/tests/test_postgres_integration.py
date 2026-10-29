"""Opt-in integration tests against a REAL PostgreSQL 16 server.

Skipped unless ``TEST_POSTGRES_URL`` is set, e.g.::

    TEST_POSTGRES_URL=postgresql+psycopg://slotease:slotease@localhost:5432/slotease_test pytest

The database name must end in ``_test``: its ``public`` schema is dropped and recreated, migrated with
Alembic (validating the hand-written migration on Postgres), exercised, then downgraded to base.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_db
from app.main import app
from app.models import Appointment
from tests.conftest import override_db
from tests.factories import booking_body, local, make_customer, make_service, make_tenant

PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

pytestmark = pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRES_URL not set")

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRIDAY = date(2026, 10, 9)
SAMPLE_B = {"error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time."}
TABLES = {
    "businesses",
    "users",
    "refresh_tokens",
    "services",
    "working_hours",
    "customers",
    "appointments",
    "payment_events",
}


def _url() -> URL:
    url = make_url(PG_URL)
    assert url.database and url.database.endswith("_test"), "TEST_POSTGRES_URL must name a *_test database"
    return url


def _alembic(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": _url().render_as_string(hide_password=False)}
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stdout}\n{result.stderr}"


@pytest.fixture(scope="module")
def pg_engine() -> Iterator[Engine]:
    engine = create_engine(_url(), pool_pre_ping=True, future=True)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    _alembic("upgrade", "head")
    try:
        yield engine
    finally:
        engine.dispose()
        _alembic("downgrade", "base")
        check = create_engine(_url(), future=True)
        try:
            remaining = set(inspect(check).get_table_names()) & TABLES
        finally:
            check.dispose()
        assert remaining == set(), f"downgrade left tables behind: {remaining}"


@pytest.fixture
def pg_factory(pg_engine: Engine) -> Iterator[sessionmaker[Session]]:
    with pg_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(sorted(TABLES))} RESTART IDENTITY CASCADE"))
    yield sessionmaker(bind=pg_engine, autoflush=False, expire_on_commit=False)


def test_migration_creates_schema_and_constraints(pg_engine: Engine) -> None:
    insp = inspect(pg_engine)
    assert set(insp.get_table_names()) >= TABLES
    with pg_engine.connect() as conn:
        assert conn.scalar(text("SELECT version_num FROM alembic_version")) == "0001_initial"
        constraint = conn.scalar(
            text("SELECT contype FROM pg_constraint WHERE conname = 'ex_appointments_no_overlap'")
        )
        assert constraint == "x"
        index_def = conn.scalar(
            text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_appointments_business_start_active'")
        )
        assert index_def is not None
        assert "UNIQUE" in index_def and "cancelled" in index_def
        assert conn.scalar(text("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'")) == 1


def _seed(factory: sessionmaker[Session]) -> tuple[int, int, int, int]:
    with factory() as db:
        tenant = make_tenant(db)
        long_service = make_service(db, tenant.business, name="Facial", duration_min=60)
        short_service = make_service(db, tenant.business, name="Trim", duration_min=30)
        customer = make_customer(db, tenant.business)
        return tenant.business.id, long_service.id, short_service.id, customer.id


def _appt(
    business_id: int, service_id: int, customer_id: int, start: datetime, minutes: int, status: str = "booked"
) -> Appointment:
    return Appointment(
        business_id=business_id,
        service_id=service_id,
        customer_id=customer_id,
        start_time=start,
        end_time=start + timedelta(minutes=minutes),
        status=status,
        price=Decimal("100.00"),
        source="owner",
    )


def test_exclusion_constraint_rejects_overlap_with_different_start(pg_factory: sessionmaker[Session]) -> None:
    business_id, long_id, short_id, customer_id = _seed(pg_factory)
    start = datetime(2026, 10, 9, 4, 30, tzinfo=UTC)
    with pg_factory() as db:
        db.add(_appt(business_id, long_id, customer_id, start, 60))
        db.commit()
        db.add(_appt(business_id, short_id, customer_id, start + timedelta(minutes=30), 30))
        with pytest.raises(IntegrityError) as excinfo:
            db.commit()
        assert "ex_appointments_no_overlap" in str(excinfo.value)
        db.rollback()
        # Touching ranges ('[)' bounds) are fine.
        db.add(_appt(business_id, short_id, customer_id, start + timedelta(minutes=60), 30))
        db.commit()


def test_partial_unique_and_exclusion_ignore_cancelled(pg_factory: sessionmaker[Session]) -> None:
    business_id, long_id, short_id, customer_id = _seed(pg_factory)
    start = datetime(2026, 10, 9, 5, 30, tzinfo=UTC)
    with pg_factory() as db:
        db.add(_appt(business_id, long_id, customer_id, start, 60, status="cancelled"))
        db.add(_appt(business_id, long_id, customer_id, start, 60, status="cancelled"))
        db.commit()
        db.add(_appt(business_id, short_id, customer_id, start, 30, status="booked"))
        db.commit()
        db.add(_appt(business_id, short_id, customer_id, start, 30, status="completed"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_aware_datetimes_round_trip_as_utc(pg_factory: sessionmaker[Session]) -> None:
    business_id, long_id, _short, customer_id = _seed(pg_factory)
    start = local(FRIDAY, "17:30")
    with pg_factory() as db:
        appt = _appt(business_id, long_id, customer_id, start, 60)
        db.add(appt)
        db.commit()
        appt_id = appt.id
    with pg_factory() as db:
        loaded = db.get(Appointment, appt_id)
        assert loaded is not None
        assert loaded.start_time == start
        assert loaded.start_time.utcoffset() == timedelta(0)


def _race(clients: list[TestClient], bodies: list[dict[str, object]]) -> list[tuple[int, dict[str, object]]]:
    barrier = threading.Barrier(len(clients))
    results: list[tuple[int, dict[str, object]]] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def worker(c: TestClient, body: dict[str, object]) -> None:
        try:
            barrier.wait(timeout=10)
            response = c.post("/api/v1/public/glow-salon/bookings", json=body)
            with lock:
                results.append((response.status_code, response.json()))
        except BaseException as exc:  # pragma: no cover
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=pair) for pair in zip(clients, bodies, strict=True)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not errors, errors
    return results


def test_concurrent_booking_through_api(pg_factory: sessionmaker[Session]) -> None:
    _business_id, long_id, short_id, _customer = _seed(pg_factory)
    app.dependency_overrides[get_db] = override_db(pg_factory)
    try:
        with TestClient(app) as c1, TestClient(app) as c2:
            days = [FRIDAY + timedelta(days=n) for n in (0, 3, 4, 5, 6)]  # Fri, Mon..Thu
            for i, day in enumerate(days):
                # Same start time.
                same = _race(
                    [c1, c2],
                    [
                        booking_body(short_id, local(day, "09:00"), phone=f"+9198000{i:02d}001"),
                        booking_body(short_id, local(day, "09:00"), phone=f"+9198000{i:02d}002"),
                    ],
                )
                assert sorted(s for s, _ in same) == [201, 409], same
                assert next(b for s, b in same if s == 409) == SAMPLE_B
                # Overlapping ranges with different start times.
                overlap = _race(
                    [c1, c2],
                    [
                        booking_body(long_id, local(day, "10:00"), phone=f"+9198100{i:02d}001"),
                        booking_body(short_id, local(day, "10:30"), phone=f"+9198100{i:02d}002"),
                    ],
                )
                assert sorted(s for s, _ in overlap) == [201, 409], overlap
    finally:
        app.dependency_overrides.clear()

    with pg_factory() as db:
        active = db.scalar(text("SELECT count(*) FROM appointments WHERE status <> 'cancelled'"))
        assert active == 10

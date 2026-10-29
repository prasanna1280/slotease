"""Concurrent double booking: two simultaneous requests for one slot -> exactly one 201 and one 409.

Uses a file-based SQLite database (real separate connections per request) so the race reaches the
database; the partial unique index is the final guard.

Overlapping ranges with *different* start times are only serialised on PostgreSQL (``SELECT ... FOR
UPDATE`` on the tenant row + the EXCLUDE constraint); SQLite has neither, so that race is covered in
``test_postgres_integration.py``.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import enable_sqlite_foreign_keys, get_db
from app.main import app
from app.models import Appointment, Base
from tests.conftest import override_db
from tests.factories import booking_body, local, make_service, make_tenant

SAMPLE_B = {"error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time."}
ROUNDS = 8


@pytest.fixture
def file_engine(tmp_path: Path) -> Iterator[Engine]:
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'race.db').as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 30},
        future=True,
    )
    enable_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def race(
    clients: list[TestClient], url: str, bodies: list[dict[str, object]]
) -> list[tuple[int, dict[str, object]]]:
    """Fire one POST per client at the same instant and return ``(status, json)`` per request."""
    barrier = threading.Barrier(len(clients))
    results: list[tuple[int, dict[str, object]]] = []
    lock = threading.Lock()
    errors: list[BaseException] = []

    def worker(c: TestClient, body: dict[str, object]) -> None:
        try:
            barrier.wait(timeout=10)
            response = c.post(url, json=body)
            with lock:
                results.append((response.status_code, response.json()))
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(c, b)) for c, b in zip(clients, bodies, strict=True)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not errors, errors
    return results


def test_concurrent_double_booking_one_wins(file_engine: Engine) -> None:
    factory = sessionmaker(bind=file_engine, autoflush=False, expire_on_commit=False)
    with factory() as db:
        tenant = make_tenant(db, hours=[(d, "09:00", "18:00") for d in range(6)])
        service = make_service(db, tenant.business, duration_min=30)
        service_id = service.id

    app.dependency_overrides[get_db] = override_db(factory)
    try:
        with TestClient(app) as c1, TestClient(app) as c2:
            for i in range(ROUNDS):
                start = local(date(2026, 10, 9), f"{9 + i:02d}:00")
                bodies = [
                    booking_body(service_id, start, name="Alice", phone=f"+9198000{i:02d}001"),
                    booking_body(service_id, start, name="Bob", phone=f"+9198000{i:02d}002"),
                ]
                results = race([c1, c2], "/api/v1/public/glow-salon/bookings", bodies)
                statuses = sorted(status for status, _ in results)
                assert statuses == [201, 409], results
                loser = next(body for status, body in results if status == 409)
                assert loser == SAMPLE_B
    finally:
        app.dependency_overrides.clear()

    with Session(file_engine) as db:
        count = db.scalar(select(func.count(Appointment.id)).where(Appointment.status == "booked"))
        assert count == ROUNDS

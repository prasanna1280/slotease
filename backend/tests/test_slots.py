"""Public business/services endpoints and the slot algorithm (incl. DST)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.slot_service import Slot, compute_free_slots, iter_candidate_slots, overlaps
from tests.factories import (
    IST,
    Tenant,
    booking_body,
    local,
    make_appointment,
    make_customer,
    make_service,
    make_tenant,
)

FRIDAY = date(2026, 10, 9)  # FIXED_NOW is Thursday 2026-10-08 10:00 IST


def get_slots(
    client: TestClient, service_id: int, day: date | str, slug: str = "glow-salon"
) -> list[dict[str, str]]:
    response = client.get(f"/api/v1/public/{slug}/slots", params={"service_id": service_id, "date": str(day)})
    assert response.status_code == 200, response.text
    return response.json()["slots"]


def labels(slots: list[dict[str, str]]) -> list[str]:
    return [s["label"] for s in slots]


def quarter_hours(first: str, last: str) -> list[str]:
    start = datetime.strptime(first, "%H:%M")
    end = datetime.strptime(last, "%H:%M")
    out = []
    while start <= end:
        out.append(start.strftime("%H:%M"))
        start += timedelta(minutes=15)
    return out


# --------------------------------------------------------------------------- public info


def test_public_business_and_services(client: TestClient, db: Session, tenant: Tenant) -> None:
    make_service(db, tenant.business, name="Shave", duration_min=15, price="100", description="Quick")
    make_service(db, tenant.business, name="Archived", is_active=False)
    response = client.get("/api/v1/public/Glow-Salon")
    assert response.status_code == 200
    assert response.json() == {
        "name": "Glow Salon",
        "slug": "glow-salon",
        "phone": "+919876543210",
        "address": None,
        "timezone": "Asia/Kolkata",
        "currency": "INR",
        "booking_window_days": 60,
        "is_bookable": True,
    }
    services = client.get("/api/v1/public/glow-salon/services").json()
    assert len(services) == 1
    assert set(services[0]) == {"id", "name", "description", "duration_min", "price"}
    assert services[0]["price"] == "100.00"


def test_public_unknown_business_404(client: TestClient) -> None:
    for path in (
        "/api/v1/public/nope",
        "/api/v1/public/nope/services",
        "/api/v1/public/nope/slots?service_id=1&date=2026-10-09",
    ):
        response = client.get(path)
        assert response.status_code == 404
        assert response.json() == {"error": "BUSINESS_NOT_FOUND", "message": "Business not found."}


# --------------------------------------------------------------------------- slot rules


def test_slots_respect_working_hours_and_duration(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    response = client.get(
        "/api/v1/public/glow-salon/slots", params={"service_id": service.id, "date": "2026-10-09"}
    )
    body = response.json()
    assert body["date"] == "2026-10-09"
    assert body["timezone"] == "Asia/Kolkata"
    assert body["service_id"] == service.id
    assert body["duration_min"] == 30
    assert body["slots"][0] == {
        "start_time": "2026-10-09T09:00:00+05:30",
        "end_time": "2026-10-09T09:30:00+05:30",
        "label": "09:00",
    }
    assert labels(body["slots"]) == quarter_hours("09:00", "17:30")  # last slot ends exactly at close


@pytest.mark.parametrize(("duration", "last"), [(45, "17:15"), (50, "17:00"), (60, "17:00"), (480, "10:00")])
def test_last_slot_ends_before_close(
    client: TestClient, db: Session, tenant: Tenant, duration: int, last: str
) -> None:
    service = make_service(db, tenant.business, duration_min=duration)
    slots = get_slots(client, service.id, FRIDAY)
    assert labels(slots) == quarter_hours("09:00", last)
    assert all(s["end_time"] <= "2026-10-09T18:00:00+05:30" for s in slots)


def test_slot_interval_controls_step(client: TestClient, db: Session) -> None:
    tenant = make_tenant(db, slot_interval_min=60, hours=[(4, "09:00", "12:00")])
    service = make_service(db, tenant.business, duration_min=30)
    assert labels(get_slots(client, service.id, FRIDAY)) == ["09:00", "10:00", "11:00"]


def test_slots_respect_breaks(client: TestClient, db: Session) -> None:
    tenant = make_tenant(db, slot_interval_min=30, hours=[(4, "09:00", "12:00"), (4, "13:00", "15:00")])
    service = make_service(db, tenant.business, duration_min=60)
    assert labels(get_slots(client, service.id, FRIDAY)) == [
        "09:00",
        "09:30",
        "10:00",
        "10:30",
        "11:00",
        "13:00",
        "13:30",
        "14:00",
    ]


def test_slots_skip_existing_bookings(
    client: TestClient, db: Session, tenant: Tenant, other_tenant: Tenant
) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    long_service = make_service(db, tenant.business, name="Facial", duration_min=60)
    customer = make_customer(db, tenant.business)
    make_appointment(db, tenant.business, long_service, customer, local(FRIDAY, "10:00"))
    # Cancelled bookings and other tenants' bookings never block.
    make_appointment(db, tenant.business, service, customer, local(FRIDAY, "12:00"), status="cancelled")
    other_service = make_service(db, other_tenant.business)
    other_customer = make_customer(db, other_tenant.business)
    make_appointment(db, other_tenant.business, other_service, other_customer, local(FRIDAY, "14:00"))
    # Completed / no-show still occupy the time.
    make_appointment(db, tenant.business, service, customer, local(FRIDAY, "16:00"), status="no_show")

    got = labels(get_slots(client, service.id, FRIDAY))
    for blocked in ("09:45", "10:00", "10:15", "10:30", "10:45", "15:45", "16:00", "16:15"):
        assert blocked not in got
    for free in ("09:30", "11:00", "12:00", "14:00", "15:30", "16:30"):
        assert free in got


def test_today_skips_past_and_notice(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    today = date(2026, 10, 8)  # now = 10:00 local, notice 60 min
    assert labels(get_slots(client, service.id, today))[0] == "11:00"
    tenant.business.min_notice_minutes = 0
    db.commit()
    assert labels(get_slots(client, service.id, today))[0] == "10:00"
    tenant.business.min_notice_minutes = 24 * 60
    db.commit()
    assert get_slots(client, service.id, today) == []
    assert labels(get_slots(client, service.id, FRIDAY))[0] == "10:00"


def test_past_day_and_window(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    assert get_slots(client, service.id, date(2026, 10, 7)) == []
    last_day = date(2026, 10, 8) + timedelta(days=60)  # Monday 2026-12-07
    assert get_slots(client, service.id, last_day) != []
    assert get_slots(client, service.id, last_day + timedelta(days=1)) == []
    tenant.business.booking_window_days = 1
    db.commit()
    assert get_slots(client, service.id, FRIDAY) != []
    assert get_slots(client, service.id, date(2026, 10, 10)) == []


def test_closed_day_has_no_slots(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business)
    assert get_slots(client, service.id, date(2026, 10, 11)) == []  # Sunday


def test_slots_service_errors(client: TestClient, db: Session, tenant: Tenant, other_tenant: Tenant) -> None:
    inactive = make_service(db, tenant.business, is_active=False)
    foreign = make_service(db, other_tenant.business)
    for service_id in (inactive.id, foreign.id, 9999):
        response = client.get(
            "/api/v1/public/glow-salon/slots", params={"service_id": service_id, "date": "2026-10-09"}
        )
        assert response.status_code == 404
        assert response.json()["error"] == "SERVICE_NOT_FOUND"
    for params in (
        {"date": "2026-10-09"},
        {"service_id": 1, "date": "09-10-2026"},
        {"service_id": 0, "date": "2026-10-09"},
    ):
        assert client.get("/api/v1/public/glow-salon/slots", params=params).status_code == 422


def test_slots_business_inactive_403(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business)
    tenant.business.trial_ends_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    response = client.get(
        "/api/v1/public/glow-salon/slots", params={"service_id": service.id, "date": "2026-10-09"}
    )
    assert response.status_code == 403
    assert response.json() == {
        "error": "BUSINESS_INACTIVE",
        "message": "This business is not accepting online bookings right now.",
    }
    # The info endpoint still works and reports it.
    assert client.get("/api/v1/public/glow-salon").json()["is_bookable"] is False


def test_compute_free_slots_without_notice(db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business, duration_min=60)
    today = date(2026, 10, 8)
    with_notice = compute_free_slots(db, tenant.business, service, today)
    without = compute_free_slots(db, tenant.business, service, today, enforce_notice=False)
    assert with_notice[0].start.astimezone(IST).hour == 11
    assert without[0].start.astimezone(IST).hour == 9
    explicit_now = compute_free_slots(
        db, tenant.business, service, today, now=datetime(2026, 10, 8, 0, 0, tzinfo=UTC)
    )
    assert explicit_now[0].start.astimezone(IST).hour == 9


# --------------------------------------------------------------------------- DST


def test_dst_fall_back_new_york(client: TestClient, db: Session, freeze: Callable[[datetime], None]) -> None:
    freeze(datetime(2026, 10, 28, 12, 0, tzinfo=UTC))
    tenant = make_tenant(
        db,
        slug="ny-spa",
        timezone="America/New_York",
        hours=[(6, "00:30", "03:30")],
        slot_interval_min=30,
        min_notice_minutes=0,
    )
    service = make_service(db, tenant.business, duration_min=30)
    slots = get_slots(client, service.id, "2026-11-01", slug="ny-spa")
    assert [s["start_time"] for s in slots] == [
        "2026-11-01T00:30:00-04:00",
        "2026-11-01T01:00:00-04:00",
        "2026-11-01T01:30:00-04:00",
        "2026-11-01T01:00:00-05:00",
        "2026-11-01T01:30:00-05:00",
        "2026-11-01T02:00:00-05:00",
        "2026-11-01T02:30:00-05:00",
        "2026-11-01T03:00:00-05:00",
    ]
    assert labels(slots) == ["00:30", "01:00", "01:30", "01:00", "01:30", "02:00", "02:30", "03:00"]
    # Every slot lasts exactly 30 real minutes.
    for s in slots:
        delta = datetime.fromisoformat(s["end_time"]) - datetime.fromisoformat(s["start_time"])
        assert delta == timedelta(minutes=30)

    # The repeated 01:00 (EST) hour is bookable on its own.
    response = client.post(
        "/api/v1/public/ny-spa/bookings", json=booking_body(service.id, "2026-11-01T01:00:00-05:00")
    )
    assert response.status_code == 201, response.text
    assert response.json()["start_time"] == "2026-11-01T01:00:00-05:00"
    assert response.json()["message"].endswith("Sun 1 Nov, 1:00 AM")
    remaining = [s["start_time"] for s in get_slots(client, service.id, "2026-11-01", slug="ny-spa")]
    assert "2026-11-01T01:00:00-05:00" not in remaining
    assert "2026-11-01T01:00:00-04:00" in remaining


def test_dst_spring_forward_new_york(
    client: TestClient, db: Session, freeze: Callable[[datetime], None]
) -> None:
    freeze(datetime(2026, 3, 1, 12, 0, tzinfo=UTC))
    tenant = make_tenant(
        db,
        slug="ny-spa",
        timezone="America/New_York",
        hours=[(6, "01:00", "04:00")],
        slot_interval_min=30,
        min_notice_minutes=0,
    )
    service = make_service(db, tenant.business, duration_min=30)
    slots = get_slots(client, service.id, "2026-03-08", slug="ny-spa")
    assert [(s["start_time"], s["end_time"]) for s in slots] == [
        ("2026-03-08T01:00:00-05:00", "2026-03-08T01:30:00-05:00"),
        ("2026-03-08T01:30:00-05:00", "2026-03-08T03:00:00-04:00"),
        ("2026-03-08T03:00:00-04:00", "2026-03-08T03:30:00-04:00"),
        ("2026-03-08T03:30:00-04:00", "2026-03-08T04:00:00-04:00"),
    ]
    # A normal day after the change uses the summer offset.
    summer = get_slots(client, service.id, "2026-03-15", slug="ny-spa")
    assert summer[0]["start_time"] == "2026-03-15T01:00:00-04:00"
    assert len(summer) == 6


# --------------------------------------------------------------------------- pure helpers


def test_iter_candidate_slots_and_overlaps() -> None:
    base = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
    intervals = [
        (base, base + timedelta(hours=1)),
        (base + timedelta(hours=2), base + timedelta(hours=2, minutes=40)),
    ]
    slots = list(iter_candidate_slots(intervals, 30, 15))
    assert [s.start - base for s in slots] == [
        timedelta(0),
        timedelta(minutes=15),
        timedelta(minutes=30),
        timedelta(hours=2),
    ]
    assert slots[0] == Slot(base, base + timedelta(minutes=30))
    assert list(iter_candidate_slots(intervals, 90, 15)) == []
    # Step < 1 is clamped (no infinite loop).
    assert len(list(iter_candidate_slots([(base, base + timedelta(minutes=3))], 1, 0))) == 3

    booked = [(base + timedelta(minutes=30), base + timedelta(minutes=60))]
    assert overlaps(base, base + timedelta(minutes=31), booked)
    assert overlaps(base + timedelta(minutes=59), base + timedelta(minutes=90), booked)
    assert overlaps(base + timedelta(minutes=35), base + timedelta(minutes=40), booked)
    assert not overlaps(base, base + timedelta(minutes=30), booked)  # touching is fine
    assert not overlaps(base + timedelta(minutes=60), base + timedelta(minutes=90), booked)
    assert not overlaps(base, base + timedelta(hours=5), [])

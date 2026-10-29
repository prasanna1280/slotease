"""Public booking: Sample Outputs A/B, overlap rules, INVALID_SLOT, customer upsert, notifications."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, Customer
from app.services import booking_service
from tests.conftest import Outbox
from tests.factories import (
    Tenant,
    booking_body,
    local,
    make_appointment,
    make_customer,
    make_service,
    make_tenant,
)

BOOK = "/api/v1/public/glow-salon/bookings"
SATURDAY = date(2026, 10, 10)
FRIDAY = date(2026, 10, 9)

SAMPLE_B = {"error": "SLOT_TAKEN", "message": "This slot was just booked. Please pick another time."}


@pytest.fixture
def salon(db: Session) -> Tenant:
    """Glow Salon open Mon-Fri 09:00-18:00 and Saturday 09:00-20:00."""
    hours = [(d, "09:00", "18:00") for d in range(5)] + [(5, "09:00", "20:00")]
    return make_tenant(db, hours=hours)


def test_sample_output_a_exact_body(client: TestClient, db: Session, salon: Tenant, outbox: Outbox) -> None:
    service = make_service(db, salon.business, name="Haircut + Beard", duration_min=45, price="450.00")
    # Six earlier appointments so this booking gets id 7 -> APT-20261010-0007.
    filler = make_customer(db, salon.business, name="Filler", phone="+919800000099")
    for hour in range(9, 15):
        make_appointment(db, salon.business, service, filler, local(FRIDAY, f"{hour:02d}:00"))

    response = client.post(
        BOOK,
        json=booking_body(
            service.id, "2026-10-10T17:30:00+05:30", phone="+91 98765 43210", email="k@example.com"
        ),
    )
    assert response.status_code == 201, response.text
    assert response.json() == {
        "booking_id": "APT-20261010-0007",
        "service": "Haircut + Beard",
        "start_time": "2026-10-10T17:30:00+05:30",
        "end_time": "2026-10-10T18:15:00+05:30",
        "status": "booked",
        "message": "Booking confirmed at Glow Salon, Sat 10 Oct, 5:30 PM",
        "business_name": "Glow Salon",
        "customer_name": "Karthik S",
        "price": "450.00",
    }
    # Notification scheduled as a background task with the appointment id.
    assert outbox.bookings == [7]
    appt = db.get(Appointment, 7)
    assert appt is not None
    assert appt.source == "online"
    assert appt.start_time == datetime(2026, 10, 10, 12, 0, tzinfo=UTC)


def test_sample_output_b_sequential_duplicate(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, name="Haircut + Beard", duration_min=45, price="450.00")
    first = client.post(BOOK, json=booking_body(service.id, "2026-10-10T17:30:00+05:30"))
    assert first.status_code == 201
    second = client.post(
        BOOK, json=booking_body(service.id, "2026-10-10T17:30:00+05:30", phone="+919800000002")
    )
    assert second.status_code == 409
    assert second.json() == SAMPLE_B


def test_start_time_in_other_offset_is_converted(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, duration_min=30)
    response = client.post(BOOK, json=booking_body(service.id, "2026-10-10T06:30:00Z"))
    assert response.status_code == 201
    assert response.json()["start_time"] == "2026-10-10T12:00:00+05:30"
    assert response.json()["message"] == "Booking confirmed at Glow Salon, Sat 10 Oct, 12:00 PM"
    again = client.post(
        BOOK, json=booking_body(service.id, "2026-10-10T12:00:00+05:30", phone="+919800000003")
    )
    assert again.status_code == 409


def test_message_morning_format(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, duration_min=30)
    response = client.post(BOOK, json=booking_body(service.id, "2026-10-12T09:05:00+05:30"))
    assert response.status_code == 422  # not on the 15-minute grid
    response = client.post(BOOK, json=booking_body(service.id, "2026-10-12T09:15:00+05:30"))
    assert response.json()["message"] == "Booking confirmed at Glow Salon, Mon 12 Oct, 9:15 AM"


def test_overlap_with_different_durations(client: TestClient, db: Session, salon: Tenant) -> None:
    long_service = make_service(db, salon.business, name="Facial", duration_min=60)
    short_service = make_service(db, salon.business, name="Trim", duration_min=30)
    assert client.post(BOOK, json=booking_body(long_service.id, local(FRIDAY, "10:00"))).status_code == 201

    clash = client.post(
        BOOK, json=booking_body(short_service.id, local(FRIDAY, "10:30"), phone="+919800000004")
    )
    assert clash.status_code == 409
    assert clash.json() == SAMPLE_B
    clash_before = client.post(
        BOOK, json=booking_body(long_service.id, local(FRIDAY, "09:30"), phone="+919800000005")
    )
    assert clash_before.status_code == 409
    # Touching ranges are fine on both sides.
    assert (
        client.post(
            BOOK, json=booking_body(short_service.id, local(FRIDAY, "11:00"), phone="+919800000006")
        ).status_code
        == 201
    )
    assert (
        client.post(
            BOOK, json=booking_body(short_service.id, local(FRIDAY, "09:30"), phone="+919800000007")
        ).status_code
        == 201
    )


def test_cancelled_slot_can_be_rebooked(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, duration_min=30)
    customer = make_customer(db, salon.business)
    make_appointment(db, salon.business, service, customer, local(FRIDAY, "10:00"), status="cancelled")
    response = client.post(BOOK, json=booking_body(service.id, local(FRIDAY, "10:00"), phone="+919800000008"))
    assert response.status_code == 201


def test_db_constraint_is_final_guard(
    client: TestClient, db: Session, salon: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Even if the app-level overlap check misses, the unique index yields 409 SLOT_TAKEN."""
    service = make_service(db, salon.business, duration_min=30)
    assert client.post(BOOK, json=booking_body(service.id, local(FRIDAY, "10:00"))).status_code == 201
    monkeypatch.setattr(booking_service, "booked_intervals", lambda *_a, **_k: [])
    response = client.post(BOOK, json=booking_body(service.id, local(FRIDAY, "10:00"), phone="+919800000009"))
    assert response.status_code == 409
    assert response.json() == SAMPLE_B
    assert db.scalar(select(Customer).where(Customer.phone == "+919800000009")) is None  # rolled back


@pytest.mark.parametrize(
    ("start", "message"),
    [
        ("2026-10-09T10:05:00+05:30", "This time is outside the business's working hours."),  # off-grid
        ("2026-10-09T08:00:00+05:30", "This time is outside the business's working hours."),  # before open
        (
            "2026-10-09T17:45:00+05:30",
            "This time is outside the business's working hours.",
        ),  # ends after close
        ("2026-10-09T18:00:00+05:30", "This time is outside the business's working hours."),  # at close
        ("2026-10-11T10:00:00+05:30", "This time is outside the business's working hours."),  # Sunday closed
        ("2026-10-08T10:30:00+05:30", "This time is too soon to book online. Please pick a later slot."),
        ("2026-10-08T09:00:00+05:30", "This time is too soon to book online. Please pick a later slot."),
        ("2026-10-07T10:00:00+05:30", "This date is outside the online booking window."),  # past day
        ("2026-12-08T10:00:00+05:30", "This date is outside the online booking window."),  # beyond 60 days
    ],
)
def test_invalid_slot_cases(client: TestClient, db: Session, salon: Tenant, start: str, message: str) -> None:
    service = make_service(db, salon.business, duration_min=30 if "17:45" not in start else 45)
    response = client.post(BOOK, json=booking_body(service.id, start))
    assert response.status_code == 422
    assert response.json() == {"error": "INVALID_SLOT", "message": message}
    assert db.scalar(select(Appointment.id)) is None


def test_naive_start_time_rejected(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business)
    response = client.post(BOOK, json=booking_body(service.id, "2026-10-09T10:00:00"))
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


@pytest.mark.parametrize(
    "override",
    [
        {"customer_phone": "12"},
        {"customer_name": "   "},
        {"customer_email": "nope"},
        {"business_id": 2},
        {"service_id": 0},
        {"notes": "x" * 501},
    ],
)
def test_booking_body_validation(
    client: TestClient, db: Session, salon: Tenant, override: dict[str, object]
) -> None:
    service = make_service(db, salon.business)
    body = booking_body(service.id, local(FRIDAY, "10:00"))
    body.update(override)
    assert client.post(BOOK, json=body).status_code == 422


def test_inactive_or_foreign_service_404(
    client: TestClient, db: Session, salon: Tenant, other_tenant: Tenant
) -> None:
    inactive = make_service(db, salon.business, is_active=False)
    foreign = make_service(db, other_tenant.business)
    for service in (inactive, foreign):
        response = client.post(BOOK, json=booking_body(service.id, local(FRIDAY, "10:00")))
        assert response.status_code == 404
        assert response.json() == {"error": "SERVICE_NOT_FOUND", "message": "Service not found."}


def test_unknown_business_404(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business)
    response = client.post(
        "/api/v1/public/nobody/bookings", json=booking_body(service.id, local(FRIDAY, "10:00"))
    )
    assert response.status_code == 404
    assert response.json()["error"] == "BUSINESS_NOT_FOUND"


@pytest.mark.parametrize(
    ("status", "trial_delta", "period_delta"),
    [("trialing", -1, None), ("expired", 5, 5), ("cancelled", None, -1), ("past_due", None, None)],
)
def test_business_inactive_403(
    client: TestClient,
    db: Session,
    salon: Tenant,
    outbox: Outbox,
    status: str,
    trial_delta: int | None,
    period_delta: int | None,
) -> None:
    service = make_service(db, salon.business)
    now = datetime.now(UTC)
    salon.business.subscription_status = status
    salon.business.trial_ends_at = now + timedelta(days=trial_delta) if trial_delta is not None else None
    salon.business.current_period_end = (
        now + timedelta(days=period_delta) if period_delta is not None else None
    )
    db.commit()
    response = client.post(BOOK, json=booking_body(service.id, local(FRIDAY, "10:00")))
    assert response.status_code == 403
    assert response.json() == {
        "error": "BUSINESS_INACTIVE",
        "message": "This business is not accepting online bookings right now.",
    }
    assert outbox.bookings == []


def test_customer_upsert_by_normalised_phone(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, duration_min=30)
    first = client.post(
        BOOK,
        json=booking_body(
            service.id, local(FRIDAY, "10:00"), name="Karthik", phone="+91 98765 43210", email="k@example.com"
        ),
    )
    second = client.post(
        BOOK,
        json=booking_body(
            service.id, local(FRIDAY, "11:00"), name="Karthik  S", phone="+91-98765-43210", email=None
        ),
    )
    third = client.post(
        BOOK,
        json=booking_body(
            service.id,
            local(FRIDAY, "12:00"),
            name="Karthik S",
            phone="+919876543210",
            email="NEW@example.com",
        ),
    )
    assert first.status_code == second.status_code == third.status_code == 201
    customers = db.scalars(select(Customer).where(Customer.business_id == salon.business.id)).all()
    assert len(customers) == 1
    db.refresh(customers[0])
    assert customers[0].phone == "+919876543210"
    assert customers[0].name == "Karthik S"
    assert customers[0].email == "new@example.com"
    assert second.json()["customer_name"] == "Karthik S"


def test_same_phone_different_businesses_are_separate_customers(
    client: TestClient, db: Session, salon: Tenant, other_tenant: Tenant
) -> None:
    s1 = make_service(db, salon.business)
    s2 = make_service(db, other_tenant.business)
    assert client.post(BOOK, json=booking_body(s1.id, local(FRIDAY, "10:00"))).status_code == 201
    other = client.post(
        "/api/v1/public/other-clinic/bookings", json=booking_body(s2.id, local(FRIDAY, "10:00"))
    )
    assert other.status_code == 201
    assert len(db.scalars(select(Customer)).all()) == 2


def test_notes_and_price_snapshot(client: TestClient, db: Session, salon: Tenant) -> None:
    service = make_service(db, salon.business, price="300.00")
    response = client.post(
        BOOK, json=booking_body(service.id, local(FRIDAY, "10:00"), notes="  first visit  ")
    )
    assert response.status_code == 201
    service.price = 999
    db.commit()
    appt = db.scalars(select(Appointment)).one()
    db.refresh(appt)
    assert str(appt.price) == "300.00"
    assert appt.notes == "first visit"

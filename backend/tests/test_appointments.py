"""Owner appointments: list by day/range, owner create, status transitions, revive conflicts."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.exceptions import ValidationAppError
from app.models import Appointment
from app.services import appointment_service
from tests.conftest import Outbox
from tests.factories import Tenant, booking_body, local, make_appointment, make_customer, make_service

URL = "/api/v1/appointments"
FRIDAY = date(2026, 10, 9)


@pytest.fixture
def seeded(db: Session, tenant: Tenant) -> dict[str, Appointment]:
    haircut = make_service(db, tenant.business, name="Haircut", duration_min=30, price="300")
    facial = make_service(db, tenant.business, name="Facial", duration_min=60, price="1000")
    alice = make_customer(db, tenant.business, name="Alice", phone="+919800000001", email="alice@example.com")
    bob = make_customer(db, tenant.business, name="Bob", phone="+919800000002")
    return {
        "today_late": make_appointment(
            db, tenant.business, haircut, alice, local(date(2026, 10, 8), "15:00")
        ),
        "today_early": make_appointment(
            db, tenant.business, facial, bob, local(date(2026, 10, 8), "09:00"), status="completed"
        ),
        "friday": make_appointment(
            db, tenant.business, haircut, bob, local(FRIDAY, "10:00"), status="cancelled"
        ),
        # 00:15 IST on 10 Oct is 18:45 UTC on 9 Oct: must be listed under the 10th.
        "saturday_midnight": make_appointment(
            db, tenant.business, haircut, alice, local(date(2026, 10, 10), "00:15")
        ),
        "november": make_appointment(db, tenant.business, haircut, alice, local(date(2026, 11, 18), "10:00")),
    }


def ids(response_json: list[dict[str, object]]) -> list[object]:
    return [a["id"] for a in response_json]


def test_list_default_today_sorted(
    client: TestClient, tenant: Tenant, seeded: dict[str, Appointment]
) -> None:
    response = client.get(URL, headers=tenant.headers)
    assert response.status_code == 200
    assert ids(response.json()) == [seeded["today_early"].id, seeded["today_late"].id]


def test_list_by_date_uses_local_day(
    client: TestClient, tenant: Tenant, seeded: dict[str, Appointment]
) -> None:
    sat = client.get(URL, headers=tenant.headers, params={"date": "2026-10-10"}).json()
    assert ids(sat) == [seeded["saturday_midnight"].id]
    assert sat[0]["start_time"] == "2026-10-10T00:15:00+05:30"
    fri = client.get(URL, headers=tenant.headers, params={"date": "2026-10-09"}).json()
    assert ids(fri) == [seeded["friday"].id]


def test_appointment_out_shape(client: TestClient, tenant: Tenant, seeded: dict[str, Appointment]) -> None:
    appt = seeded["today_late"]
    body = client.get(f"{URL}/{appt.id}", headers=tenant.headers).json()
    assert body == {
        "id": appt.id,
        "reference": f"APT-20261008-{appt.id:04d}",
        "service_id": appt.service_id,
        "service_name": "Haircut",
        "duration_min": 30,
        "customer_id": appt.customer_id,
        "customer_name": "Alice",
        "customer_phone": "+919800000001",
        "customer_email": "alice@example.com",
        "start_time": "2026-10-08T15:00:00+05:30",
        "end_time": "2026-10-08T15:30:00+05:30",
        "status": "booked",
        "price": "300.00",
        "notes": None,
        "source": "online",
        "created_at": body["created_at"],
    }
    assert body["created_at"].endswith("+05:30")


def test_list_range_and_status_filter(
    client: TestClient, tenant: Tenant, seeded: dict[str, Appointment]
) -> None:
    params = {"start": "2026-10-08", "end": "2026-10-10"}
    got = ids(client.get(URL, headers=tenant.headers, params=params).json())
    assert got == [
        seeded["today_early"].id,
        seeded["today_late"].id,
        seeded["friday"].id,
        seeded["saturday_midnight"].id,
    ]
    cancelled = client.get(URL, headers=tenant.headers, params={**params, "status": "cancelled"}).json()
    assert ids(cancelled) == [seeded["friday"].id]
    # 42 days inclusive is allowed (8 Oct .. 18 Nov).
    wide = client.get(URL, headers=tenant.headers, params={"start": "2026-10-08", "end": "2026-11-18"})
    assert wide.status_code == 200
    assert seeded["november"].id in ids(wide.json())


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-10-08", "end": "2026-11-19"},  # 43 days
        {"start": "2026-10-10", "end": "2026-10-08"},
        {"start": "2026-10-08"},
        {"end": "2026-10-08"},
        {"date": "2026-10-08", "start": "2026-10-08", "end": "2026-10-09"},
    ],
)
def test_list_invalid_range_422(client: TestClient, tenant: Tenant, params: dict[str, str]) -> None:
    response = client.get(URL, headers=tenant.headers, params=params)
    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_RANGE"


def test_list_bad_query_types(client: TestClient, tenant: Tenant) -> None:
    assert client.get(URL, headers=tenant.headers, params={"date": "tomorrow"}).status_code == 422
    assert client.get(URL, headers=tenant.headers, params={"status": "lost"}).status_code == 422


def test_resolve_range_pure(tenant: Tenant) -> None:
    d = date(2026, 1, 1)
    assert appointment_service.resolve_range(tenant.business, d, None, None) == (d, d)
    assert appointment_service.resolve_range(tenant.business, None, None, None) == (date(2026, 10, 8),) * 2
    assert appointment_service.resolve_range(tenant.business, None, d, date(2026, 2, 11)) == (
        d,
        date(2026, 2, 11),
    )
    with pytest.raises(ValidationAppError):
        appointment_service.resolve_range(tenant.business, None, d, date(2026, 2, 12))


def test_owner_create_skips_notice_and_window(
    client: TestClient, db: Session, tenant: Tenant, outbox: Outbox
) -> None:
    service = make_service(db, tenant.business, duration_min=30)
    # Today 09:00 (already past "now" of 10:00) and far in the future are allowed for owners.
    past = client.post(
        URL, headers=tenant.headers, json=booking_body(service.id, local(date(2026, 10, 8), "09:00"))
    )
    assert past.status_code == 201, past.text
    body = past.json()
    assert body["source"] == "owner"
    assert body["status"] == "booked"
    assert body["customer_phone"] == "+919876543210"
    assert body["reference"] == f"APT-20261008-{body['id']:04d}"
    far = client.post(
        URL, headers=tenant.headers, json=booking_body(service.id, local(date(2027, 6, 1), "10:00"))
    )
    assert far.status_code == 201
    assert outbox.bookings == [body["id"], far.json()["id"]]
    # Working hours still apply.
    closed = client.post(
        URL, headers=tenant.headers, json=booking_body(service.id, local(date(2026, 10, 11), "10:00"))
    )
    assert closed.status_code == 422
    assert closed.json()["error"] == "INVALID_SLOT"
    # And so does the overlap rule.
    taken = client.post(
        URL, headers=tenant.headers, json=booking_body(service.id, local(date(2026, 10, 8), "09:00"))
    )
    assert taken.status_code == 409


def test_status_transitions_and_notes(
    client: TestClient, tenant: Tenant, seeded: dict[str, Appointment]
) -> None:
    appt_id = seeded["today_late"].id
    for status in ("completed", "no_show", "booked", "cancelled", "booked"):
        response = client.patch(f"{URL}/{appt_id}", headers=tenant.headers, json={"status": status})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == status
    response = client.patch(f"{URL}/{appt_id}", headers=tenant.headers, json={"notes": "  bring photo "})
    assert response.json()["notes"] == "bring photo"
    assert response.json()["status"] == "booked"
    response = client.patch(f"{URL}/{appt_id}", headers=tenant.headers, json={"notes": None})
    assert response.json()["notes"] is None


@pytest.mark.parametrize(
    "payload", [{"status": "done"}, {"status": None}, {"notes": "x" * 501}, {"price": 1}]
)
def test_patch_validation(
    client: TestClient, tenant: Tenant, seeded: dict[str, Appointment], payload: dict[str, object]
) -> None:
    response = client.patch(f"{URL}/{seeded['today_late'].id}", headers=tenant.headers, json=payload)
    assert response.status_code == 422


def test_revive_into_taken_slot_409(
    client: TestClient, db: Session, tenant: Tenant, seeded: dict[str, Appointment]
) -> None:
    cancelled = seeded["friday"]  # Haircut 10:00-10:30 Friday, cancelled
    service = make_service(db, tenant.business, name="Beard", duration_min=30)
    # Someone else books 10:15 (overlapping, different start) -> reviving must fail.
    rebook = client.post(
        URL,
        headers=tenant.headers,
        json=booking_body(service.id, local(FRIDAY, "10:15"), phone="+919800000077"),
    )
    assert rebook.status_code == 201
    response = client.patch(f"{URL}/{cancelled.id}", headers=tenant.headers, json={"status": "booked"})
    assert response.status_code == 409
    assert response.json()["error"] == "SLOT_TAKEN"
    db.expire_all()
    assert db.get(Appointment, cancelled.id).status == "cancelled"
    # Reviving to "completed" is also a revival.
    assert (
        client.patch(
            f"{URL}/{cancelled.id}", headers=tenant.headers, json={"status": "completed"}
        ).status_code
        == 409
    )
    # Cancelling the blocker frees it again.
    client.patch(f"{URL}/{rebook.json()['id']}", headers=tenant.headers, json={"status": "cancelled"})
    assert (
        client.patch(f"{URL}/{cancelled.id}", headers=tenant.headers, json={"status": "booked"}).status_code
        == 200
    )


def test_revive_same_start_hits_unique_index(
    client: TestClient,
    db: Session,
    tenant: Tenant,
    seeded: dict[str, Appointment],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancelled = seeded["friday"]
    rebook = client.post(
        URL,
        headers=tenant.headers,
        json=booking_body(cancelled.service_id, local(FRIDAY, "10:00"), phone="+919800000078"),
    )
    assert rebook.status_code == 201
    # Bypass the app-level check: the partial unique index still refuses two active rows at 10:00.
    monkeypatch.setattr(appointment_service, "booked_intervals", lambda *_a, **_k: [])
    response = client.patch(f"{URL}/{cancelled.id}", headers=tenant.headers, json={"status": "booked"})
    assert response.status_code == 409
    assert response.json()["error"] == "SLOT_TAKEN"


def test_unknown_appointment_404(client: TestClient, tenant: Tenant) -> None:
    for response in (
        client.get(f"{URL}/999", headers=tenant.headers),
        client.patch(f"{URL}/999", headers=tenant.headers, json={"status": "completed"}),
    ):
        assert response.status_code == 404
        assert response.json() == {"error": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found."}

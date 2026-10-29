"""Tenant isolation: business A can never see or touch business B's data (404, never 403)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, Service, WorkingHours
from tests.factories import Tenant, booking_body, local, make_appointment, make_customer, make_service

DAY = date(2026, 10, 9)


@pytest.fixture
def world(db: Session, tenant: Tenant, other_tenant: Tenant) -> dict[str, object]:
    a_service = make_service(db, tenant.business, name="A Cut", price="100")
    a_customer = make_customer(db, tenant.business, name="A Person", phone="+919800000001")
    a_appt = make_appointment(
        db, tenant.business, a_service, a_customer, local(DAY, "10:00"), status="completed"
    )
    b_service = make_service(db, other_tenant.business, name="B Cut", price="900")
    b_customer = make_customer(db, other_tenant.business, name="B Person", phone="+919800000001")
    b_appt = make_appointment(
        db, other_tenant.business, b_service, b_customer, local(DAY, "11:00"), status="completed"
    )
    make_appointment(db, other_tenant.business, b_service, b_customer, local(DAY, "12:00"), status="no_show")
    return {
        "a": tenant,
        "b": other_tenant,
        "a_service": a_service,
        "a_appt": a_appt,
        "b_service": b_service,
        "b_customer": b_customer,
        "b_appt": b_appt,
    }


def test_cannot_access_other_tenants_services(
    client: TestClient, db: Session, world: dict[str, object]
) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b_service: Service = world["b_service"]  # type: ignore[assignment]
    url = f"/api/v1/services/{b_service.id}"
    assert client.get(url, headers=a.headers).status_code == 404
    assert client.patch(url, headers=a.headers, json={"name": "Hacked"}).status_code == 404
    assert client.delete(url, headers=a.headers).status_code == 404
    db.expire_all()
    fresh = db.get(Service, b_service.id)
    assert fresh is not None and fresh.name == "B Cut" and fresh.is_active
    names = [
        s["name"] for s in client.get("/api/v1/services?include_inactive=true", headers=a.headers).json()
    ]
    assert names == ["A Cut"]


def test_cannot_access_other_tenants_appointments(
    client: TestClient, db: Session, world: dict[str, object]
) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b_appt: Appointment = world["b_appt"]  # type: ignore[assignment]
    url = f"/api/v1/appointments/{b_appt.id}"
    assert client.get(url, headers=a.headers).status_code == 404
    response = client.patch(url, headers=a.headers, json={"status": "cancelled"})
    assert response.status_code == 404
    assert response.json()["error"] == "APPOINTMENT_NOT_FOUND"
    db.expire_all()
    assert db.get(Appointment, b_appt.id).status == "completed"
    listed = client.get(
        "/api/v1/appointments", headers=a.headers, params={"start": "2026-10-01", "end": "2026-10-31"}
    )
    assert [x["id"] for x in listed.json()] == [world["a_appt"].id]  # type: ignore[attr-defined]


def test_owner_cannot_book_with_other_tenants_service(client: TestClient, world: dict[str, object]) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b_service: Service = world["b_service"]  # type: ignore[assignment]
    response = client.post(
        "/api/v1/appointments", headers=a.headers, json=booking_body(b_service.id, local(DAY, "15:00"))
    )
    assert response.status_code == 404
    assert response.json()["error"] == "SERVICE_NOT_FOUND"


def test_cannot_access_other_tenants_customers(client: TestClient, world: dict[str, object]) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b_customer = world["b_customer"]
    assert client.get(f"/api/v1/customers/{b_customer.id}", headers=a.headers).status_code == 404  # type: ignore[attr-defined]
    page = client.get("/api/v1/customers", headers=a.headers).json()
    assert [c["name"] for c in page["items"]] == ["A Person"]
    assert page["total"] == 1
    # Same phone in both tenants: search must still only find A's row; aggregates only count A.
    found = client.get("/api/v1/customers", headers=a.headers, params={"search": "9800000001"}).json()
    assert [c["name"] for c in found["items"]] == ["A Person"]
    assert found["items"][0]["total_bookings"] == 1


def test_working_hours_are_per_tenant(client: TestClient, db: Session, world: dict[str, object]) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b: Tenant = world["b"]  # type: ignore[assignment]
    assert client.put("/api/v1/working-hours", headers=a.headers, json={"hours": []}).status_code == 200
    assert client.get("/api/v1/working-hours", headers=a.headers).json() == []
    assert len(client.get("/api/v1/working-hours", headers=b.headers).json()) == 6
    b_rows = db.scalars(select(WorkingHours).where(WorkingHours.business_id == b.business.id)).all()
    assert len(b_rows) == 6


def test_stats_only_count_own_tenant(client: TestClient, world: dict[str, object]) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    month = client.get("/api/v1/stats", headers=a.headers, params={"month": "2026-10"}).json()
    assert month["total_bookings"] == 1
    assert month["completed"] == 1
    assert month["no_shows"] == 0
    assert month["revenue_estimate"] == "100.00"
    assert [s["name"] for s in month["top_services"]] == ["A Cut"]
    assert month["new_customers"] in (0, 1)  # created_at uses the real clock
    day = client.get("/api/v1/stats/summary", headers=a.headers, params={"date": "2026-10-09"}).json()
    assert (day["total"], day["completed"], day["no_shows"], day["revenue_estimate"]) == (1, 1, 0, "100.00")


def test_billing_and_business_are_own(client: TestClient, world: dict[str, object]) -> None:
    a: Tenant = world["a"]  # type: ignore[assignment]
    b: Tenant = world["b"]  # type: ignore[assignment]
    assert client.get("/api/v1/business", headers=a.headers).json()["slug"] == "glow-salon"
    assert client.get("/api/v1/business", headers=b.headers).json()["slug"] == "other-clinic"
    patched = client.patch("/api/v1/business", headers=a.headers, json={"name": "A Renamed"})
    assert patched.json()["id"] == a.business.id
    assert client.get("/api/v1/business", headers=b.headers).json()["name"] == "Other Clinic"

"""Customers: paginated search with aggregates, detail with history."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Customer
from tests.factories import Tenant, local, make_appointment, make_customer, make_service

URL = "/api/v1/customers"


@pytest.fixture
def people(db: Session, tenant: Tenant) -> dict[str, Customer]:
    service = make_service(db, tenant.business)
    alice = make_customer(db, tenant.business, name="alice Rao", phone="+919800000001", email="a@example.com")
    bob = make_customer(db, tenant.business, name="Bob 100%_off", phone="04423456789")
    carol = make_customer(db, tenant.business, name="Carol", phone="+15550001111")
    d = date(2026, 10, 1)
    make_appointment(db, tenant.business, service, alice, local(d, "09:00"), status="completed")
    make_appointment(db, tenant.business, service, alice, local(d, "10:00"), status="completed")
    make_appointment(db, tenant.business, service, alice, local(d, "11:00"), status="no_show")
    make_appointment(db, tenant.business, service, alice, local(d, "12:00"), status="cancelled")
    make_appointment(db, tenant.business, service, alice, local(date(2026, 10, 20), "12:00"), status="booked")
    make_appointment(db, tenant.business, service, bob, local(d, "13:00"), status="booked")
    return {"alice": alice, "bob": bob, "carol": carol}


def test_list_with_aggregates(client: TestClient, tenant: Tenant, people: dict[str, Customer]) -> None:
    response = client.get(URL, headers=tenant.headers)
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 3
    assert page["page"] == 1
    assert page["page_size"] == 20
    assert [c["name"] for c in page["items"]] == [
        "alice Rao",
        "Bob 100%_off",
        "Carol",
    ]  # case-insensitive order
    alice = page["items"][0]
    assert alice["total_bookings"] == 5
    assert alice["completed_visits"] == 2
    assert alice["no_shows"] == 1
    assert alice["last_visit"] == "2026-10-01T10:00:00+05:30"
    assert alice["email"] == "a@example.com"
    assert alice["created_at"].endswith("+05:30")
    carol = page["items"][2]
    assert (carol["total_bookings"], carol["completed_visits"], carol["no_shows"], carol["last_visit"]) == (
        0,
        0,
        0,
        None,
    )


@pytest.mark.parametrize(
    ("search", "expected"),
    [
        ("ALICE", ["alice Rao"]),
        ("rao", ["alice Rao"]),
        ("98000", ["alice Rao"]),
        ("+91 98000-00001", ["alice Rao"]),
        ("0442", ["Bob 100%_off"]),
        ("%", ["Bob 100%_off"]),
        ("_", ["Bob 100%_off"]),
        ("  ", ["alice Rao", "Bob 100%_off", "Carol"]),
        ("zzz", []),
    ],
)
def test_search(
    client: TestClient, tenant: Tenant, people: dict[str, Customer], search: str, expected: list[str]
) -> None:
    page = client.get(URL, headers=tenant.headers, params={"search": search}).json()
    assert [c["name"] for c in page["items"]] == expected
    assert page["total"] == len(expected)


def test_pagination(client: TestClient, tenant: Tenant, people: dict[str, Customer]) -> None:
    page2 = client.get(URL, headers=tenant.headers, params={"page": 2, "page_size": 2}).json()
    assert [c["name"] for c in page2["items"]] == ["Carol"]
    assert page2["total"] == 3
    assert client.get(URL, headers=tenant.headers, params={"page": 0}).status_code == 422
    assert client.get(URL, headers=tenant.headers, params={"page_size": 101}).status_code == 422
    assert client.get(URL, headers=tenant.headers, params={"search": "x" * 101}).status_code == 422


def test_detail_with_history(client: TestClient, tenant: Tenant, people: dict[str, Customer]) -> None:
    response = client.get(f"{URL}/{people['alice'].id}", headers=tenant.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_bookings"] == 5
    starts = [a["start_time"] for a in body["appointments"]]
    assert starts == sorted(starts, reverse=True)
    assert starts[0] == "2026-10-20T12:00:00+05:30"
    assert {a["customer_id"] for a in body["appointments"]} == {people["alice"].id}

    empty = client.get(f"{URL}/{people['carol'].id}", headers=tenant.headers).json()
    assert empty["appointments"] == []
    assert empty["last_visit"] is None


def test_detail_unknown_404(client: TestClient, tenant: Tenant) -> None:
    response = client.get(f"{URL}/999", headers=tenant.headers)
    assert response.status_code == 404
    assert response.json() == {"error": "CUSTOMER_NOT_FOUND", "message": "Customer not found."}

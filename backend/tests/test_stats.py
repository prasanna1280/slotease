"""Stats on a known fixture -> exact numbers."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.exceptions import ValidationAppError
from app.services.stats_service import parse_month
from tests.factories import Tenant, local, make_appointment, make_customer, make_service

URL = "/api/v1/stats"


@pytest.fixture
def fixture_month(db: Session, tenant: Tenant, other_tenant: Tenant) -> dict[str, int]:
    biz = tenant.business
    haircut = make_service(db, biz, name="Haircut", duration_min=30, price="300")
    facial = make_service(db, biz, name="Facial", duration_min=60, price="1000")
    c1 = make_customer(
        db, biz, name="C1", phone="+919800000001", created_at=datetime(2026, 10, 2, 6, 0, tzinfo=UTC)
    )
    c2 = make_customer(
        db, biz, name="C2", phone="+919800000002", created_at=datetime(2026, 9, 15, 6, 0, tzinfo=UTC)
    )
    make_customer(
        db, biz, name="C3", phone="+919800000003", created_at=datetime(2026, 10, 20, 6, 0, tzinfo=UTC)
    )
    # 1 Oct 00:05 IST is 30 Sep 18:35 UTC -> belongs to October locally.
    make_customer(
        db, biz, name="C4", phone="+919800000004", created_at=datetime(2026, 9, 30, 18, 35, tzinfo=UTC)
    )

    d3, d5 = date(2026, 10, 3), date(2026, 10, 5)
    make_appointment(db, biz, haircut, c1, local(d3, "10:00"), status="completed")
    make_appointment(db, biz, haircut, c1, local(d3, "11:00"), status="completed")
    make_appointment(db, biz, facial, c2, local(d3, "12:00"), status="no_show")
    next_appt = make_appointment(db, biz, facial, c2, local(d5, "10:00"), status="booked")
    make_appointment(db, biz, haircut, c1, local(d5, "11:00"), status="cancelled")
    make_appointment(db, biz, haircut, c2, local(date(2026, 10, 10), "10:00"), status="booked")
    make_appointment(db, biz, haircut, c1, local(date(2026, 10, 31), "23:30"), status="completed")
    make_appointment(db, biz, haircut, c1, local(date(2026, 11, 1), "00:15"), status="completed")  # November
    make_appointment(db, biz, facial, c2, local(date(2026, 10, 1), "00:10"), status="completed")
    make_appointment(db, biz, facial, c2, local(date(2026, 9, 30), "23:50"), status="completed")  # September

    # Another tenant's October data must not leak in.
    other_service = make_service(db, other_tenant.business, price="5000")
    other_customer = make_customer(db, other_tenant.business, created_at=datetime(2026, 10, 5, tzinfo=UTC))
    make_appointment(
        db, other_tenant.business, other_service, other_customer, local(d3, "10:00"), status="completed"
    )
    return {"haircut": haircut.id, "facial": facial.id, "next": next_appt.id}


def test_month_stats_exact(client: TestClient, tenant: Tenant, fixture_month: dict[str, int]) -> None:
    response = client.get(URL, headers=tenant.headers, params={"month": "2026-10"})
    assert response.status_code == 200
    body = response.json()
    daily = body.pop("daily")
    assert body == {
        "month": "2026-10",
        "total_bookings": 8,
        "booked": 2,
        "completed": 4,
        "cancelled": 1,
        "no_shows": 1,
        "no_show_rate": 14.3,  # 1 / (8 - 1) * 100
        "revenue_estimate": "3200.00",
        "busiest_day": "Saturday",
        "new_customers": 3,  # C1, C3, C4
        "top_services": [
            {"service_id": fixture_month["haircut"], "name": "Haircut", "bookings": 4, "revenue": "1200.00"},
            {"service_id": fixture_month["facial"], "name": "Facial", "bookings": 3, "revenue": "2000.00"},
        ],
    }
    assert len(daily) == 31
    assert daily[0]["date"] == "2026-10-01"
    assert daily[-1]["date"] == "2026-10-31"
    non_zero = {d["date"]: (d["bookings"], d["completed"], d["no_shows"]) for d in daily if d["bookings"]}
    assert non_zero == {
        "2026-10-01": (1, 1, 0),
        "2026-10-03": (3, 2, 1),
        "2026-10-05": (1, 0, 0),
        "2026-10-10": (1, 0, 0),
        "2026-10-31": (1, 1, 0),
    }


def test_month_stats_default_current_month_and_empty(client: TestClient, tenant: Tenant) -> None:
    body = client.get(URL, headers=tenant.headers).json()  # frozen now: 8 Oct 2026
    assert body["month"] == "2026-10"
    assert body["total_bookings"] == 0
    assert body["no_show_rate"] == 0.0
    assert body["busiest_day"] is None
    assert body["revenue_estimate"] == "0.00"
    assert body["top_services"] == []
    feb = client.get(URL, headers=tenant.headers, params={"month": "2028-02"}).json()
    assert len(feb["daily"]) == 29


@pytest.mark.parametrize("month", ["2026-13", "2026-00", "abc", "2026-1", "0000-01"])
def test_month_stats_invalid_month(client: TestClient, tenant: Tenant, month: str) -> None:
    response = client.get(URL, headers=tenant.headers, params={"month": month})
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_parse_month_pure(tenant: Tenant) -> None:
    assert parse_month("2026-02", tenant.business) == date(2026, 2, 1)
    assert parse_month(" 2026-12 ", tenant.business) == date(2026, 12, 1)
    assert parse_month(None, tenant.business) == date(2026, 10, 1)
    with pytest.raises(ValidationAppError):
        parse_month("2026/02", tenant.business)


def test_day_summary_past_day(
    client: TestClient, tenant: Tenant, fixture_month: dict[str, int], freeze: Callable[[datetime], None]
) -> None:
    freeze(datetime(2026, 10, 3, 6, 0, tzinfo=UTC))  # 11:30 IST on the 3rd
    body = client.get(f"{URL}/summary", headers=tenant.headers, params={"date": "2026-10-03"}).json()
    assert body == {
        "date": "2026-10-03",
        "total": 3,
        "booked": 0,
        "completed": 2,
        "cancelled": 0,
        "no_shows": 1,
        "revenue_estimate": "600.00",
        "next_appointment": None,
    }


def test_day_summary_with_next_appointment(
    client: TestClient, tenant: Tenant, fixture_month: dict[str, int], freeze: Callable[[datetime], None]
) -> None:
    freeze(datetime(2026, 10, 3, 6, 0, tzinfo=UTC))
    body = client.get(f"{URL}/summary", headers=tenant.headers, params={"date": "2026-10-05"}).json()
    assert (body["total"], body["booked"], body["cancelled"], body["revenue_estimate"]) == (
        1,
        1,
        1,
        "1000.00",
    )
    assert body["next_appointment"]["id"] == fixture_month["next"]
    assert body["next_appointment"]["start_time"] == "2026-10-05T10:00:00+05:30"
    # Once the booking's start has passed it is no longer "next".
    freeze(datetime(2026, 10, 5, 5, 0, tzinfo=UTC))  # 10:30 IST
    later = client.get(f"{URL}/summary", headers=tenant.headers, params={"date": "2026-10-05"}).json()
    assert later["next_appointment"] is None


def test_day_summary_default_today(client: TestClient, tenant: Tenant) -> None:
    body = client.get(f"{URL}/summary", headers=tenant.headers).json()
    assert body["date"] == "2026-10-08"
    assert body["total"] == 0
    assert body["next_appointment"] is None


def test_stats_require_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.get(f"{URL}/summary").status_code == 401

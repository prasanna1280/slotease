"""Working hours (/working-hours) and the pure ``validate_hours`` helper."""

from __future__ import annotations

from datetime import time

import pytest
from fastapi.testclient import TestClient

from app.exceptions import ValidationAppError
from app.schemas.working_hours import WorkingHoursIn
from app.services.working_hours_service import validate_hours
from tests.factories import Tenant

URL = "/api/v1/working-hours"


def test_get_default_hours_sorted(client: TestClient, tenant: Tenant) -> None:
    response = client.get(URL, headers=tenant.headers)
    assert response.status_code == 200
    rows = response.json()
    assert [r["weekday"] for r in rows] == [0, 1, 2, 3, 4, 5]
    assert {(r["open_time"], r["close_time"]) for r in rows} == {("09:00", "18:00")}
    assert set(rows[0]) == {"id", "weekday", "open_time", "close_time"}


def test_put_replaces_all_with_breaks(client: TestClient, tenant: Tenant) -> None:
    hours = [
        {"weekday": 2, "open_time": "14:00", "close_time": "18:00"},
        {"weekday": 2, "open_time": "09:00", "close_time": "13:00"},
        {"weekday": 0, "open_time": "10:00", "close_time": "12:30"},
        {"weekday": 6, "open_time": "10:00:00", "close_time": "14:00"},
    ]
    response = client.put(URL, headers=tenant.headers, json={"hours": hours})
    assert response.status_code == 200
    got = [(r["weekday"], r["open_time"], r["close_time"]) for r in response.json()]
    assert got == [(0, "10:00", "12:30"), (2, "09:00", "13:00"), (2, "14:00", "18:00"), (6, "10:00", "14:00")]
    assert [(r["weekday"], r["open_time"]) for r in client.get(URL, headers=tenant.headers).json()] == [
        (0, "10:00"),
        (2, "09:00"),
        (2, "14:00"),
        (6, "10:00"),
    ]


def test_put_empty_closes_business(client: TestClient, tenant: Tenant) -> None:
    response = client.put(URL, headers=tenant.headers, json={"hours": []})
    assert response.status_code == 200
    assert response.json() == []


def test_adjacent_ranges_are_allowed(client: TestClient, tenant: Tenant) -> None:
    hours = [
        {"weekday": 1, "open_time": "09:00", "close_time": "12:00"},
        {"weekday": 1, "open_time": "12:00", "close_time": "15:00"},
    ]
    assert client.put(URL, headers=tenant.headers, json={"hours": hours}).status_code == 200


@pytest.mark.parametrize(
    ("hours", "fragment"),
    [
        ([{"weekday": 0, "open_time": "18:00", "close_time": "09:00"}], "before closing"),
        ([{"weekday": 0, "open_time": "09:00", "close_time": "09:00"}], "before closing"),
        (
            [
                {"weekday": 3, "open_time": "09:00", "close_time": "13:00"},
                {"weekday": 3, "open_time": "12:00", "close_time": "15:00"},
            ],
            "Thursday has overlapping",
        ),
        (
            [{"weekday": 4, "open_time": f"{h:02d}:00", "close_time": f"{h:02d}:30"} for h in range(8, 13)],
            "Friday has more than 4",
        ),
    ],
)
def test_put_invalid_hours_422(
    client: TestClient, tenant: Tenant, hours: list[dict[str, object]], fragment: str
) -> None:
    response = client.put(URL, headers=tenant.headers, json={"hours": hours})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert any(fragment in d["message"] for d in body["details"])
    # Nothing was replaced.
    assert len(client.get(URL, headers=tenant.headers).json()) == 6


@pytest.mark.parametrize(
    "item",
    [
        {"weekday": 7, "open_time": "09:00", "close_time": "10:00"},
        {"weekday": -1, "open_time": "09:00", "close_time": "10:00"},
        {"weekday": 0, "open_time": "25:00", "close_time": "26:00"},
        {"weekday": 0, "open_time": "09:00", "close_time": "10:00", "extra": True},
    ],
)
def test_put_schema_validation(client: TestClient, tenant: Tenant, item: dict[str, object]) -> None:
    assert client.put(URL, headers=tenant.headers, json={"hours": [item]}).status_code == 422


def test_put_too_many_rows(client: TestClient, tenant: Tenant) -> None:
    hours = [{"weekday": d % 7, "open_time": "09:00", "close_time": "10:00"} for d in range(29)]
    assert client.put(URL, headers=tenant.headers, json={"hours": hours}).status_code == 422


def test_validate_hours_pure() -> None:
    def wh(day: int, o: tuple[int, int], c: tuple[int, int]) -> WorkingHoursIn:
        return WorkingHoursIn(weekday=day, open_time=time(*o), close_time=time(*c))

    validate_hours([wh(0, (9, 0), (12, 0)), wh(0, (13, 0), (18, 0)), wh(1, (9, 0), (18, 0))])
    with pytest.raises(ValidationAppError) as excinfo:
        validate_hours([wh(0, (9, 0), (12, 0)), wh(0, (11, 59), (18, 0)), wh(1, (10, 0), (9, 0))])
    fields = {d["field"] for d in excinfo.value.details or []}
    assert fields == {"hours.1", "hours.2"}
    assert excinfo.value.status_code == 422

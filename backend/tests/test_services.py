"""Service catalogue CRUD (/services)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Service
from tests.factories import Tenant, make_service

URL = "/api/v1/services"


def test_create_and_get_service(client: TestClient, tenant: Tenant) -> None:
    response = client.post(
        URL,
        headers=tenant.headers,
        json={"name": " Haircut + Beard ", "description": "  ", "duration_min": 45, "price": 450},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Haircut + Beard"
    assert body["description"] is None
    assert body["duration_min"] == 45
    assert body["price"] == "450.00"
    assert body["is_active"] is True
    assert body["created_at"].endswith("+05:30")

    got = client.get(f"{URL}/{body['id']}", headers=tenant.headers)
    assert got.status_code == 200
    assert got.json() == body


def test_list_services_ordered_by_name_and_inactive_filter(
    client: TestClient, db: Session, tenant: Tenant
) -> None:
    make_service(db, tenant.business, name="Shave", duration_min=15, price="100")
    make_service(db, tenant.business, name="Facial", duration_min=60, price="1000.5")
    make_service(db, tenant.business, name="Archived", is_active=False)
    names = [s["name"] for s in client.get(URL, headers=tenant.headers).json()]
    assert names == ["Facial", "Shave"]
    all_names = [s["name"] for s in client.get(f"{URL}?include_inactive=true", headers=tenant.headers).json()]
    assert all_names == ["Archived", "Facial", "Shave"]
    prices = {s["name"]: s["price"] for s in client.get(URL, headers=tenant.headers).json()}
    assert prices == {"Facial": "1000.50", "Shave": "100.00"}


def test_patch_service_partial(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business, description="old")
    response = client.patch(f"{URL}/{service.id}", headers=tenant.headers, json={"price": "350.5"})
    assert response.status_code == 200
    body = response.json()
    assert body["price"] == "350.50"
    assert body["name"] == "Haircut"
    assert body["description"] == "old"
    response = client.patch(f"{URL}/{service.id}", headers=tenant.headers, json={"description": None})
    assert response.json()["description"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"name": None},
        {"duration_min": None},
        {"price": None},
        {"is_active": None},
        {"duration_min": 4},
        {"bogus": 1},
    ],
)
def test_patch_service_validation(
    client: TestClient, db: Session, tenant: Tenant, payload: dict[str, object]
) -> None:
    service = make_service(db, tenant.business)
    response = client.patch(f"{URL}/{service.id}", headers=tenant.headers, json=payload)
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "X", "duration_min": 4, "price": 1},
        {"name": "X", "duration_min": 481, "price": 1},
        {"name": "X", "duration_min": 30, "price": -1},
        {"name": "X", "duration_min": 30, "price": "1.234"},
        {"name": "  ", "duration_min": 30, "price": 1},
        {"name": "X", "duration_min": 30, "price": 1, "business_id": 99},
        {"duration_min": 30},
    ],
)
def test_create_service_validation(client: TestClient, tenant: Tenant, payload: dict[str, object]) -> None:
    response = client.post(URL, headers=tenant.headers, json=payload)
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_create_service_boundaries_and_default_price(client: TestClient, tenant: Tenant) -> None:
    low = client.post(URL, headers=tenant.headers, json={"name": "Quick", "duration_min": 5})
    high = client.post(URL, headers=tenant.headers, json={"name": "Long", "duration_min": 480, "price": "0"})
    assert low.status_code == high.status_code == 201
    assert low.json()["price"] == "0.00"


def test_delete_is_soft(client: TestClient, db: Session, tenant: Tenant) -> None:
    service = make_service(db, tenant.business)
    assert client.delete(f"{URL}/{service.id}", headers=tenant.headers).status_code == 204
    assert client.delete(f"{URL}/{service.id}", headers=tenant.headers).status_code == 204
    db.expire_all()
    assert db.get(Service, service.id).is_active is False
    assert client.get(URL, headers=tenant.headers).json() == []
    got = client.get(f"{URL}/{service.id}", headers=tenant.headers)
    assert got.status_code == 200
    assert got.json()["is_active"] is False


def test_unknown_service_404(client: TestClient, tenant: Tenant) -> None:
    for method in ("get", "patch", "delete"):
        kwargs = {"json": {"price": 1}} if method == "patch" else {}
        response = getattr(client, method)(f"{URL}/9999", headers=tenant.headers, **kwargs)
        assert response.status_code == 404
        assert response.json() == {"error": "SERVICE_NOT_FOUND", "message": "Service not found."}


def test_services_require_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"name": "x", "duration_min": 30}).status_code == 401

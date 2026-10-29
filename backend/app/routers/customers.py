"""Customers of the authenticated business (``/api/v1/customers``)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.common import Page
from app.schemas.customer import CustomerDetailOut, CustomerOut
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=Page[CustomerOut], summary="Search customers")
def list_customers(
    db: DbSession,
    business: CurrentBusiness,
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[CustomerOut]:
    """Paginated customers (name order) with visit aggregates; ``search`` matches name or phone."""
    items, total = customer_service.list_customers(db, business, search, page, page_size)
    return Page[CustomerOut](items=items, total=total, page=page, page_size=page_size)


@router.get("/{customer_id}", response_model=CustomerDetailOut, summary="Customer detail")
def get_customer(db: DbSession, business: CurrentBusiness, customer_id: int) -> CustomerDetailOut:
    """Return the customer with aggregates and latest 50 appointments (404 if another tenant's)."""
    return customer_service.get_customer_detail(db, business, customer_id)

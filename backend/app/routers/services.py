"""Service catalogue CRUD for the authenticated business (``/api/v1/services``)."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.service import ServiceCreate, ServiceOut, ServiceUpdate
from app.services import catalog_service
from app.services.slot_service import business_tz

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("", response_model=list[ServiceOut], summary="List services")
def list_services(
    db: DbSession, business: CurrentBusiness, include_inactive: bool = False
) -> list[ServiceOut]:
    """Return the business's services ordered by name."""
    tz = business_tz(business)
    services = catalog_service.list_services(db, business.id, include_inactive)
    return [catalog_service.service_to_out(s, tz) for s in services]


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED, summary="Create a service")
def create_service(db: DbSession, business: CurrentBusiness, body: ServiceCreate) -> ServiceOut:
    """Create a service."""
    service = catalog_service.create_service(db, business.id, body)
    return catalog_service.service_to_out(service, business_tz(business))


@router.get("/{service_id}", response_model=ServiceOut, summary="Get a service")
def get_service(db: DbSession, business: CurrentBusiness, service_id: int) -> ServiceOut:
    """Return one service (404 ``SERVICE_NOT_FOUND`` if missing or another tenant's)."""
    service = catalog_service.get_service(db, business.id, service_id)
    return catalog_service.service_to_out(service, business_tz(business))


@router.patch("/{service_id}", response_model=ServiceOut, summary="Update a service")
def update_service(
    db: DbSession, business: CurrentBusiness, service_id: int, body: ServiceUpdate
) -> ServiceOut:
    """Partially update a service."""
    service = catalog_service.update_service(db, business.id, service_id, body)
    return catalog_service.service_to_out(service, business_tz(business))


@router.delete(
    "/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Deactivate a service",
)
def delete_service(db: DbSession, business: CurrentBusiness, service_id: int) -> Response:
    """Soft-delete (deactivate) a service; past appointments keep referencing it."""
    catalog_service.deactivate_service(db, business.id, service_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

"""Service catalogue (``/services``): tenant-scoped CRUD with soft delete."""

from __future__ import annotations

from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError
from app.models import Service
from app.schemas.service import ServiceCreate, ServiceOut, ServiceUpdate
from app.services.time_utils import to_local

SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND"
SERVICE_NOT_FOUND_MESSAGE = "Service not found."


def service_to_out(service: Service, tz: ZoneInfo) -> ServiceOut:
    """Build a :class:`ServiceOut` with ``created_at`` in the business timezone."""
    return ServiceOut(
        id=service.id,
        name=service.name,
        description=service.description,
        duration_min=service.duration_min,
        price=service.price,
        is_active=service.is_active,
        created_at=to_local(service.created_at, tz),
    )


def list_services(db: Session, business_id: int, include_inactive: bool = False) -> list[Service]:
    """Return the business's services ordered by name (active only unless ``include_inactive``)."""
    stmt = select(Service).where(Service.business_id == business_id)
    if not include_inactive:
        stmt = stmt.where(Service.is_active.is_(True))
    return list(db.scalars(stmt.order_by(Service.name, Service.id)))


def get_service(db: Session, business_id: int, service_id: int, *, active_only: bool = False) -> Service:
    """Return one service of the business or raise 404 ``SERVICE_NOT_FOUND`` (also for other tenants)."""
    stmt = select(Service).where(Service.id == service_id, Service.business_id == business_id)
    if active_only:
        stmt = stmt.where(Service.is_active.is_(True))
    service = db.scalars(stmt).first()
    if service is None:
        raise NotFoundError(SERVICE_NOT_FOUND_MESSAGE, code=SERVICE_NOT_FOUND)
    return service


def create_service(db: Session, business_id: int, data: ServiceCreate) -> Service:
    """Create a service for the business."""
    service = Service(business_id=business_id, **data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


def update_service(db: Session, business_id: int, service_id: int, data: ServiceUpdate) -> Service:
    """Apply only the fields present in the PATCH body."""
    service = get_service(db, business_id, service_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


def deactivate_service(db: Session, business_id: int, service_id: int) -> None:
    """Soft-delete: mark the service inactive (history and existing appointments are kept)."""
    service = get_service(db, business_id, service_id)
    if service.is_active:
        service.is_active = False
        db.commit()

"""Owner business profile and booking rules (GET/PATCH /business).

Mounted by ``app.main`` under ``/api/v1`` -> ``/api/v1/business``.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import CurrentBusiness, DbSession
from app.schemas.business import BusinessOut, BusinessUpdate
from app.schemas.common import ErrorOut
from app.services import business_service

router = APIRouter(prefix="/business", tags=["Business"])


@router.get("", response_model=BusinessOut, responses={401: {"model": ErrorOut}})
def get_business(business: CurrentBusiness) -> BusinessOut:
    """Return the signed-in owner's business profile."""
    return BusinessOut.model_validate(business)


@router.patch(
    "",
    response_model=BusinessOut,
    responses={401: {"model": ErrorOut}, 409: {"model": ErrorOut}, 422: {"model": ErrorOut}},
)
def update_business(data: BusinessUpdate, business: CurrentBusiness, db: DbSession) -> BusinessOut:
    """Update profile fields and booking rules of the signed-in owner's business."""
    return BusinessOut.model_validate(business_service.update_business(db, business, data))

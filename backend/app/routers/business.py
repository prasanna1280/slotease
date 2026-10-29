"""Owner business profile and booking rules (GET/PATCH /business).

Mounted by ``app.main`` under ``/api/v1`` -> ``/api/v1/business``.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.dependencies import CurrentBusiness, CurrentUser, DbSession
from app.rate_limit import limiter
from app.schemas.business import BusinessDeleteIn, BusinessOut, BusinessUpdate
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


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={
        400: {"model": ErrorOut},
        401: {"model": ErrorOut},
        403: {"model": ErrorOut},
        503: {"model": ErrorOut},
    },
)
@limiter.limit("5/minute")
def delete_business(
    request: Request, data: BusinessDeleteIn, user: CurrentUser, business: CurrentBusiness, db: DbSession
) -> Response:
    """Permanently delete the business, its owner account and all of its data.

    Requires the owner's password and the booking-page slug as confirmation. Cannot be undone.
    """
    business_service.delete_business(db, business, user, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

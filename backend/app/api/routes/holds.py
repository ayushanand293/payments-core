from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.guards import require_write_access
from app.schemas import HoldAuthorizeCreate, HoldCaptureCreate, HoldOut, HoldReleaseCreate
from app.services.holds import (
    HoldValidationError,
    IdempotencyConflictError,
    authorize_hold,
    capture_hold,
    list_holds,
    release_hold,
)

router = APIRouter(prefix="/holds", tags=["holds"])


@router.get("", response_model=list[HoldOut])
def read_holds(session: Session = Depends(get_db)):
    return list_holds(session)


@router.post("/authorize", status_code=201)
def post_hold_authorize(
    payload: HoldAuthorizeCreate,
    request: Request,
    session: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    require_write_access(request)
    if not idempotency_key:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_ERROR", "message": "Idempotency-Key header is required"})

    try:
        result = authorize_hold(session, idempotency_key=idempotency_key, payload=payload)
    except IdempotencyConflictError as error:
        return JSONResponse(status_code=409, content={"code": "IDEMPOTENCY_KEY_REUSED", "message": str(error)})
    except HoldValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    return result.payload


@router.post("/{hold_id}/capture", status_code=201)
def post_hold_capture(
    hold_id: UUID,
    payload: HoldCaptureCreate,
    request: Request,
    session: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    require_write_access(request)
    if not idempotency_key:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_ERROR", "message": "Idempotency-Key header is required"})

    try:
        result = capture_hold(session, hold_id=hold_id, idempotency_key=idempotency_key, payload=payload)
    except IdempotencyConflictError as error:
        return JSONResponse(status_code=409, content={"code": "IDEMPOTENCY_KEY_REUSED", "message": str(error)})
    except HoldValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    return result.payload


@router.post("/{hold_id}/release")
def post_hold_release(
    hold_id: UUID,
    payload: HoldReleaseCreate,
    request: Request,
    session: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    require_write_access(request)
    if not idempotency_key:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_ERROR", "message": "Idempotency-Key header is required"})

    try:
        result = release_hold(session, hold_id=hold_id, idempotency_key=idempotency_key, payload=payload)
    except IdempotencyConflictError as error:
        return JSONResponse(status_code=409, content={"code": "IDEMPOTENCY_KEY_REUSED", "message": str(error)})
    except HoldValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    return result.payload

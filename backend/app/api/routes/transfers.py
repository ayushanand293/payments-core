from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas import TransferCreate
from app.services.transfers import IdempotencyConflictError, TransferConflictError, TransferValidationError, create_transfer

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.post("", status_code=201)
def post_transfer(
    transfer: TransferCreate,
    session: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="Idempotency-Key header is required")

    try:
        result = create_transfer(session, idempotency_key=idempotency_key, transfer=transfer)
    except IdempotencyConflictError as error:
        return JSONResponse(status_code=409, content={"code": "IDEMPOTENCY_KEY_REUSED", "message": str(error)})
    except TransferConflictError as error:
        return JSONResponse(
            status_code=409,
            content={
                "code": error.code,
                "message": str(error),
                "available_balance": error.available_balance,
                "required": error.required,
            },
        )
    except TransferValidationError as error:
        return JSONResponse(status_code=400, content={"code": error.code, "message": str(error)})

    return result.payload

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.schemas import DemoFundCreate, DemoInjectFailureCreate
from app.seed import reset_demo_data
from app.services.demo import DemoFundingError, fund_account
from app.services.webhooks import set_fail_once

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/fund")
def post_demo_fund(
    payload: DemoFundCreate,
    session: Session = Depends(get_db),
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    settings = get_settings()
    if not demo_secret or demo_secret != settings.demo_secret:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid demo secret"})

    try:
        return fund_account(session, account_id=payload.account_id, amount=payload.amount, currency=payload.currency)
    except DemoFundingError as error:
        return JSONResponse(status_code=400, content={"code": error.code, "message": str(error)})


@router.post("/inject-failure")
def post_inject_failure(
    payload: DemoInjectFailureCreate,
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    settings = get_settings()
    if not demo_secret or demo_secret != settings.demo_secret:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid demo secret"})

    set_fail_once(payload.event_id)
    return {
        "event_id": payload.event_id,
        "mode": "fail-once",
    }


@router.post("/reset")
def post_demo_reset(
    session: Session = Depends(get_db),
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    settings = get_settings()
    if not demo_secret or demo_secret != settings.demo_secret:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid demo secret"})

    reset_demo_data(session)
    return {"status": "ok", "message": "Demo data reset complete"}
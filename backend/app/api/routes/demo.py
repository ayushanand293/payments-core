from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.schemas import DemoFundCreate
from app.services.demo import DemoFundingError, fund_account

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
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.guards import require_write_access
from app.core.metrics import refresh_runtime_gauges
from app.schemas import DashboardStatsOut, DemoFundCreate, DemoInjectFailureCreate
from app.seed import reset_demo_data
from app.services.demo import DemoFundingError, fund_account
from app.services.reconciliation import dashboard_stats
from app.services.webhooks import set_fail_once

router = APIRouter(prefix="/demo", tags=["demo"])


def _require_demo_endpoints_enabled(request: Request) -> None:
    settings = request.app.state.settings
    if settings.app_env.lower() == "production" and not settings.demo_endpoints_enabled:
        raise HTTPException(
            status_code=404,
            detail={"code": "DEMO_ENDPOINTS_DISABLED", "message": "Demo endpoints are disabled in production"},
        )


def _require_demo_secret(request: Request, demo_secret: str | None) -> None:
    _require_demo_endpoints_enabled(request)
    require_write_access(request)
    settings = request.app.state.settings
    if not demo_secret or demo_secret != settings.demo_secret:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid demo secret"})


@router.post("/fund")
def post_demo_fund(
    payload: DemoFundCreate,
    request: Request,
    session: Session = Depends(get_db),
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    _require_demo_secret(request, demo_secret)

    try:
        return fund_account(session, account_id=payload.account_id, amount=payload.amount, currency=payload.currency)
    except DemoFundingError as error:
        return JSONResponse(status_code=400, content={"code": error.code, "message": str(error)})


@router.post("/inject-failure")
def post_inject_failure(
    payload: DemoInjectFailureCreate,
    request: Request,
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    _require_demo_secret(request, demo_secret)

    set_fail_once(payload.event_id)
    return {
        "event_id": payload.event_id,
        "mode": "fail-once",
    }


@router.post("/reset")
def post_demo_reset(
    request: Request,
    session: Session = Depends(get_db),
    demo_secret: str | None = Header(default=None, alias="X-DEMO-SECRET"),
):
    _require_demo_secret(request, demo_secret)

    reset_demo_data(session)
    refresh_runtime_gauges(session)
    return {"status": "ok", "message": "Demo data reset complete"}


@router.get("/stats", response_model=DashboardStatsOut)
def get_demo_stats(request: Request, session: Session = Depends(get_db)):
    _require_demo_endpoints_enabled(request)
    return dashboard_stats(session)

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas import ReconcileReportOut
from app.services.reconciliation import latest_reconciliation, run_reconciliation

router = APIRouter(prefix="/reconcile", tags=["reconcile"])


@router.post("/run", response_model=ReconcileReportOut)
def post_reconcile_run(session: Session = Depends(get_db)):
    return run_reconciliation(session)


@router.get("/latest", response_model=ReconcileReportOut)
def get_reconcile_latest(session: Session = Depends(get_db)):
    report = latest_reconciliation(session)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "RECONCILE_NOT_FOUND", "message": "No reconciliation run found"})
    return report

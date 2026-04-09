from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.metrics import metrics_response, refresh_runtime_gauges, sync_derived_counters

router = APIRouter(tags=["metrics"])


@router.get("/metrics")
def metrics(session: Session = Depends(get_db)):
    sync_derived_counters(session)
    refresh_runtime_gauges(session)
    return metrics_response()

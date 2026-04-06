from __future__ import annotations

from app.workers.celery_app import celery_app


@celery_app.task(name="payments_core.noop")
def noop() -> str:
    return "ok"

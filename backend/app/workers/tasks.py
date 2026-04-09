from __future__ import annotations

from app.core.config import get_settings
from app.core.db import create_engine_and_session
from app.services.webhooks import process_webhook_event
from app.workers.celery_app import celery_app

settings = get_settings()
_engine, _session_factory = create_engine_and_session(settings.database_url)


@celery_app.task(name="payments_core.noop")
def noop() -> str:
    return "ok"


@celery_app.task(name="payments_core.process_webhook")
def process_webhook(event_id: str) -> dict:
    def enqueue_retry(next_event_id: str, countdown: int) -> None:
        try:
            process_webhook.apply_async(args=[next_event_id], countdown=countdown)
        except Exception:
            process_webhook.apply(args=[next_event_id])

    with _session_factory() as session:
        return process_webhook_event(session, event_id=event_id, enqueue_retry=enqueue_retry)

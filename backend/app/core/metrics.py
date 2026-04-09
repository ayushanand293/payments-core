from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DlqEvent, Hold, HoldStatus, ReconcileRun, WebhookEvent, WebhookEventStatus

logger = logging.getLogger(__name__)

HTTP_REQUESTS = Counter("payments_core_http_requests_total", "HTTP requests processed", ["method", "path", "status"])
IDEMPOTENCY_REPLAYS = Counter("payments_core_idempotency_replays_total", "Idempotent replay responses")
TRANSACTIONS_CREATED = Counter("payments_core_transactions_created_total", "Transactions created", ["type"])
WEBHOOKS_RECEIVED = Counter("payments_core_webhooks_received_total", "Webhook events received")
WEBHOOKS_DEDUPED = Counter("payments_core_webhooks_deduped_total", "Webhook events deduplicated")
WEBHOOKS_PROCESSED = Counter("payments_core_webhooks_processed_total", "Webhook events processed")
WEBHOOKS_FAILED = Counter("payments_core_webhooks_failed_total", "Webhook processing attempts failed")
DLQ_REPLAYS = Counter("payments_core_dlq_replays_total", "DLQ replay requests")
RECONCILE_RUNS = Counter("payments_core_reconcile_runs_total", "Reconciliation runs")

DLQ_SIZE = Gauge("payments_core_dlq_size", "Current number of events in DLQ")
ACTIVE_HOLDS = Gauge("payments_core_active_holds", "Current number of active authorized holds")
WEBHOOKS_PROCESSING = Gauge("payments_core_webhooks_processing", "Current number of webhooks in PROCESSING state")

_DERIVED_COUNTER_SNAPSHOT = {
    "webhooks_processed_total": 0,
    "webhooks_failed_total": 0,
    "reconcile_runs_total": 0,
}


def _counter_value(counter: Counter) -> float:
    return float(counter._value.get())


def mark_idempotency_replay() -> None:
    IDEMPOTENCY_REPLAYS.inc()


def mark_transaction_created(transaction_type: str) -> None:
    TRANSACTIONS_CREATED.labels(transaction_type).inc()


def mark_webhook_received(*, deduplicated: bool) -> None:
    WEBHOOKS_RECEIVED.inc()
    if deduplicated:
        WEBHOOKS_DEDUPED.inc()


def mark_webhook_processed() -> None:
    WEBHOOKS_PROCESSED.inc()


def mark_webhook_failed() -> None:
    WEBHOOKS_FAILED.inc()


def mark_dlq_replay() -> None:
    DLQ_REPLAYS.inc()


def mark_reconcile_run() -> None:
    RECONCILE_RUNS.inc()


def sync_derived_counters(session: Session) -> None:
    """Sync cumulative counter values from database state.
    
    Counters for webhook processing, DLQ replays, and reconciliation runs
    must be synced from database state since worker processes cannot
    update counters in the main process directly.
    """
    try:
        processed_total = session.execute(
            select(func.count()).select_from(WebhookEvent).where(WebhookEvent.status == WebhookEventStatus.PROCESSED)
        ).scalar_one()

        all_webhooks = session.execute(select(WebhookEvent.status, WebhookEvent.attempts)).all()
        failed_attempts = 0
        for status, attempts in all_webhooks:
            attempt_count = int(attempts or 0)
            if status == WebhookEventStatus.PROCESSED:
                failed_attempts += max(0, attempt_count - 1)
            elif status in {WebhookEventStatus.FAILED, WebhookEventStatus.DLQ}:
                failed_attempts += attempt_count

        reconcile_runs_total = session.execute(select(func.count()).select_from(ReconcileRun)).scalar_one()

        derived_values = {
            "webhooks_processed_total": int(processed_total or 0),
            "webhooks_failed_total": int(failed_attempts),
            "reconcile_runs_total": int(reconcile_runs_total or 0),
        }

        for key, latest_value in derived_values.items():
            previous_value = _DERIVED_COUNTER_SNAPSHOT[key]
            if latest_value > previous_value:
                delta = latest_value - previous_value
                if key == "webhooks_processed_total":
                    WEBHOOKS_PROCESSED.inc(delta)
                elif key == "webhooks_failed_total":
                    WEBHOOKS_FAILED.inc(delta)
                elif key == "reconcile_runs_total":
                    RECONCILE_RUNS.inc(delta)
            _DERIVED_COUNTER_SNAPSHOT[key] = latest_value
    except Exception as e:
        logger.error("Error in sync_derived_counters", extra={"error": str(e)}, exc_info=True)


def refresh_runtime_gauges(session: Session) -> None:
    now = datetime.now(UTC)
    dlq_size = session.execute(select(func.count()).select_from(DlqEvent)).scalar_one()
    active_holds = session.execute(
        select(func.count()).select_from(Hold).where(Hold.status == HoldStatus.AUTHORIZED, Hold.expires_at > now)
    ).scalar_one()
    processing = session.execute(
        select(func.count()).select_from(WebhookEvent).where(WebhookEvent.status == WebhookEventStatus.PROCESSING)
    ).scalar_one()

    DLQ_SIZE.set(float(dlq_size or 0))
    ACTIVE_HOLDS.set(float(active_holds or 0))
    WEBHOOKS_PROCESSING.set(float(processing or 0))


def metrics_snapshot() -> dict:
    return {
        "webhooks_received_total": _counter_value(WEBHOOKS_RECEIVED),
        "webhooks_deduped_total": _counter_value(WEBHOOKS_DEDUPED),
        "webhooks_processed_total": _counter_value(WEBHOOKS_PROCESSED),
        "webhooks_failed_total": _counter_value(WEBHOOKS_FAILED),
        "dlq_replays_total": _counter_value(DLQ_REPLAYS),
        "idempotency_replays_total": _counter_value(IDEMPOTENCY_REPLAYS),
        "reconcile_runs_total": _counter_value(RECONCILE_RUNS),
        "dlq_size": float(DLQ_SIZE._value.get()),
        "active_holds": float(ACTIVE_HOLDS._value.get()),
        "webhooks_processing": float(WEBHOOKS_PROCESSING._value.get()),
    }


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

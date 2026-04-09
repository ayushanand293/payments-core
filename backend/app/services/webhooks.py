from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Callable
from uuid import UUID

from fastapi.encoders import jsonable_encoder
import redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.idempotency import request_hash
from app.models import (
    Account,
    DlqEvent,
    IdempotencyKey,
    LedgerEntry,
    LedgerEntryDirection,
    Transaction,
    TransactionStatus,
    TransactionType,
    WebhookEvent,
    WebhookEventStatus,
)
from app.schemas import WebhookGatewayIn
from app.services.audit import write_audit_event

MAX_RETRY_ATTEMPTS = 5
RETRY_BACKOFF_SECONDS = [1, 2, 4, 8, 16]


class WebhookValidationError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(slots=True)
class WebhookIngestResult:
    event: WebhookEvent
    created: bool


def _payload_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return sha256(encoded.encode("utf-8")).hexdigest()


def ingest_webhook_event(session: Session, payload: WebhookGatewayIn) -> WebhookIngestResult:
    existing = session.get(WebhookEvent, payload.event_id)
    digest = _payload_hash(payload.payload)

    if existing is not None:
        same = (
            existing.event_type == payload.event_type
            and existing.payload_hash == digest
        )
        if not same:
            raise WebhookValidationError(
                "WEBHOOK_EVENT_ID_REUSED",
                "Event id already exists with different payload",
                status_code=409,
            )
        return WebhookIngestResult(event=existing, created=False)

    event = WebhookEvent(
        event_id=payload.event_id,
        event_type=payload.event_type,
        payload_json=jsonable_encoder(payload.payload),
        payload_hash=digest,
        status=WebhookEventStatus.RECEIVED,
        attempts=0,
        last_error=None,
        occurred_at=payload.occurred_at,
    )
    session.add(event)
    write_audit_event(
        session,
        event_type="WEBHOOK_RECEIVED",
        entity_type="webhook",
        entity_id=payload.event_id,
        payload_json={
            "event_id": payload.event_id,
            "event_type": payload.event_type,
            "occurred_at": payload.occurred_at.isoformat() if payload.occurred_at else None,
        },
    )
    session.commit()
    session.refresh(event)
    return WebhookIngestResult(event=event, created=True)


def list_webhook_events(session: Session) -> list[WebhookEvent]:
    return session.execute(select(WebhookEvent).order_by(WebhookEvent.created_at.desc())).scalars().all()


def list_dlq_events(session: Session) -> list[DlqEvent]:
    return session.execute(select(DlqEvent).order_by(DlqEvent.created_at.desc())).scalars().all()


def replay_webhook_event(session: Session, event_id: str) -> WebhookEvent:
    event = session.get(WebhookEvent, event_id)
    if event is None:
        raise WebhookValidationError("WEBHOOK_NOT_FOUND", "Webhook event was not found", status_code=404)
    if event.status not in {WebhookEventStatus.FAILED, WebhookEventStatus.DLQ}:
        raise WebhookValidationError("WEBHOOK_NOT_REPLAYABLE", "Only FAILED or DLQ events can be replayed", status_code=409)

    event.status = WebhookEventStatus.RECEIVED
    event.attempts = 0
    event.last_error = None

    dlq_event = session.execute(select(DlqEvent).where(DlqEvent.event_id == event.event_id)).scalar_one_or_none()
    if dlq_event is not None:
        session.delete(dlq_event)

    write_audit_event(
        session,
        event_type="WEBHOOK_REPLAY_REQUESTED",
        entity_type="webhook",
        entity_id=event.event_id,
        payload_json={"event_id": event.event_id},
    )
    session.commit()
    session.refresh(event)
    return event


def set_fail_once(event_id: str) -> None:
    key = f"webhook:fail-once:{event_id}"
    settings = get_settings()
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    client.set(name=key, value="1", ex=3600)


def _consume_fail_once(event_id: str) -> bool:
    key = f"webhook:fail-once:{event_id}"
    settings = get_settings()
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    value = client.get(key)
    if value is None:
        return False
    client.delete(key)
    return True


def _require_payload_value(payload: dict, key: str) -> str:
    value = payload.get(key)
    if isinstance(value, str) and value.strip():
        return value
    raise WebhookValidationError("INVALID_PAYLOAD", f"Missing or invalid '{key}' in payload", status_code=422)


def _require_payload_int(payload: dict, key: str) -> int:
    value = payload.get(key)
    if isinstance(value, int) and value > 0:
        return value
    raise WebhookValidationError("INVALID_PAYLOAD", f"Missing or invalid '{key}' in payload", status_code=422)


def _apply_business_effect(session: Session, event: WebhookEvent) -> None:
    # Week 3 default: gateway event creates a deterministic mint->user transfer.
    if event.event_type != "demo.fund":
        raise WebhookValidationError("UNSUPPORTED_EVENT_TYPE", f"Unsupported event_type '{event.event_type}'", status_code=422)

    payload = event.payload_json or {}
    account_id_raw = _require_payload_value(payload, "account_id")
    currency_code = _require_payload_value(payload, "currency_code")
    amount_minor = _require_payload_int(payload, "amount_minor")

    try:
        account_id = UUID(account_id_raw)
    except ValueError as error:
        raise WebhookValidationError("INVALID_PAYLOAD", "Invalid account_id in payload", status_code=422) from error

    target = session.get(Account, account_id)
    if target is None:
        raise WebhookValidationError("ACCOUNT_NOT_FOUND", "Target account was not found", status_code=404)
    if target.currency_code != currency_code:
        raise WebhookValidationError("CURRENCY_MISMATCH", "Currency does not match account", status_code=409)

    mint = session.execute(
        select(Account).where(
            Account.currency_code == currency_code,
            Account.name == f"{currency_code} Mint Source",
        )
    ).scalar_one_or_none()
    if mint is None:
        raise WebhookValidationError("MINT_ACCOUNT_MISSING", "Mint source account is missing", status_code=409)

    idempotency_key = f"webhook:{event.event_id}"
    scope = "webhooks.demo_fund"
    payload_hash = request_hash(scope, {"event_id": event.event_id, "payload": payload})

    existing = session.get(IdempotencyKey, idempotency_key)
    if existing is not None:
        if existing.scope != scope or existing.request_hash != payload_hash:
            raise WebhookValidationError("WEBHOOK_IDEMPOTENCY_CONFLICT", "Webhook idempotency conflict", status_code=409)
        return

    tx = Transaction(
        type=TransactionType.DEPOSIT,
        status=TransactionStatus.POSTED,
        currency_code=currency_code,
        idempotency_key=idempotency_key,
        description=f"Webhook {event.event_id}",
    )
    session.add(tx)
    session.flush()

    session.add_all(
        [
            LedgerEntry(
                tx_id=tx.id,
                account_id=mint.id,
                currency_code=currency_code,
                direction=LedgerEntryDirection.DEBIT,
                amount=amount_minor,
            ),
            LedgerEntry(
                tx_id=tx.id,
                account_id=target.id,
                currency_code=currency_code,
                direction=LedgerEntryDirection.CREDIT,
                amount=amount_minor,
            ),
        ]
    )

    session.add(
        IdempotencyKey(
            key=idempotency_key,
            scope=scope,
            request_hash=payload_hash,
            response_json={"transaction_id": str(tx.id)},
            status_code=201,
        )
    )

    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        existing = session.get(IdempotencyKey, idempotency_key)
        if existing is not None and existing.scope == scope and existing.request_hash == payload_hash:
            return
        raise WebhookValidationError("WEBHOOK_IDEMPOTENCY_CONFLICT", "Webhook idempotency conflict", status_code=409) from error


def _next_backoff(attempt_number: int) -> int:
    index = max(0, min(attempt_number - 1, len(RETRY_BACKOFF_SECONDS) - 1))
    return RETRY_BACKOFF_SECONDS[index]


def process_webhook_event(
    session: Session,
    *,
    event_id: str,
    enqueue_retry: Callable[[str, int], None],
) -> dict:
    event = session.get(WebhookEvent, event_id)
    if event is None:
        return {"event_id": event_id, "state": "missing"}
    if event.status == WebhookEventStatus.PROCESSED:
        return {"event_id": event_id, "state": "already_processed"}

    event.status = WebhookEventStatus.PROCESSING
    session.commit()

    try:
        if _consume_fail_once(event.event_id):
            raise RuntimeError("Injected fail-once for webhook event")

        _apply_business_effect(session, event)
        event.attempts += 1
        event.status = WebhookEventStatus.PROCESSED
        event.last_error = None
        write_audit_event(
            session,
            event_type="WEBHOOK_PROCESSED",
            entity_type="webhook",
            entity_id=event.event_id,
            payload_json={"event_id": event.event_id, "attempts": event.attempts},
        )
        session.commit()
        return {"event_id": event.event_id, "state": "processed", "attempts": event.attempts}
    except (WebhookValidationError, RuntimeError, ValueError) as error:
        session.rollback()
        event = session.get(WebhookEvent, event_id)
        if event is None:
            return {"event_id": event_id, "state": "missing_after_error"}

        event.attempts += 1
        event.last_error = str(error)

        if event.attempts >= MAX_RETRY_ATTEMPTS:
            event.status = WebhookEventStatus.DLQ
            existing_dlq = session.execute(select(DlqEvent).where(DlqEvent.event_id == event.event_id)).scalar_one_or_none()
            if existing_dlq is None:
                session.add(
                    DlqEvent(
                        event_id=event.event_id,
                        event_type=event.event_type,
                        payload_json=event.payload_json,
                        attempts=event.attempts,
                        last_error=event.last_error,
                    )
                )
            else:
                existing_dlq.attempts = event.attempts
                existing_dlq.last_error = event.last_error or "unknown"
                existing_dlq.payload_json = event.payload_json

            write_audit_event(
                session,
                event_type="WEBHOOK_DLQ",
                entity_type="webhook",
                entity_id=event.event_id,
                payload_json={"event_id": event.event_id, "attempts": event.attempts, "error": event.last_error},
            )
            session.commit()
            return {"event_id": event.event_id, "state": "dlq", "attempts": event.attempts, "error": event.last_error}

        event.status = WebhookEventStatus.FAILED
        write_audit_event(
            session,
            event_type="WEBHOOK_RETRY_SCHEDULED",
            entity_type="webhook",
            entity_id=event.event_id,
            payload_json={"event_id": event.event_id, "attempts": event.attempts, "error": event.last_error},
        )
        session.commit()
        enqueue_retry(event.event_id, _next_backoff(event.attempts))
        return {"event_id": event.event_id, "state": "retry_scheduled", "attempts": event.attempts, "error": event.last_error}


def enqueue_webhook_processing(event_id: str, *, countdown: int = 0) -> None:
    from app.workers.tasks import process_webhook

    try:
        process_webhook.apply_async(args=[event_id], countdown=countdown)
    except Exception:
        # In local tests where Redis is absent, execute eagerly in-process.
        process_webhook.apply(args=[event_id])

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas import WebhookEventOut, WebhookGatewayAcceptedOut, WebhookGatewayIn
from app.services.webhooks import (
    WebhookValidationError,
    enqueue_webhook_processing,
    ingest_webhook_event,
    list_webhook_events,
    replay_webhook_event,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/gateway", response_model=WebhookGatewayAcceptedOut, status_code=202)
def post_gateway_webhook(payload: WebhookGatewayIn, request: Request, session: Session = Depends(get_db)):
    try:
        result = ingest_webhook_event(session, payload)
    except WebhookValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    if result.created and request.app.state.settings.enqueue_webhooks:
        enqueue_webhook_processing(result.event.event_id)

    return {
        "event_id": result.event.event_id,
        "status": result.event.status.value,
        "deduplicated": not result.created,
    }


@router.get("/events", response_model=list[WebhookEventOut])
def read_webhook_events(session: Session = Depends(get_db)):
    events = list_webhook_events(session)
    return [
        {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "status": event.status.value,
            "attempts": event.attempts,
            "last_error": event.last_error,
            "occurred_at": event.occurred_at,
            "created_at": event.created_at,
            "updated_at": event.updated_at,
        }
        for event in events
    ]


@router.post("/events/{event_id}/replay", response_model=WebhookGatewayAcceptedOut, status_code=202)
def post_webhook_replay(event_id: str, request: Request, session: Session = Depends(get_db)):
    try:
        event = replay_webhook_event(session, event_id)
    except WebhookValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    if request.app.state.settings.enqueue_webhooks:
        enqueue_webhook_processing(event.event_id)
    return {
        "event_id": event.event_id,
        "status": event.status.value,
        "deduplicated": False,
    }

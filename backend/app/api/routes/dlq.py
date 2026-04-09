from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas import DlqEventOut, WebhookGatewayAcceptedOut
from app.services.webhooks import WebhookValidationError, enqueue_webhook_processing, list_dlq_events, replay_webhook_event

router = APIRouter(prefix="/dlq", tags=["dlq"])


@router.get("", response_model=list[DlqEventOut])
def read_dlq_events(session: Session = Depends(get_db)):
    events = list_dlq_events(session)
    return [
        {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "attempts": event.attempts,
            "last_error": event.last_error,
            "created_at": event.created_at,
            "updated_at": event.updated_at,
        }
        for event in events
    ]


@router.post("/{event_id}/replay", response_model=WebhookGatewayAcceptedOut, status_code=202)
def post_dlq_replay(event_id: str, session: Session = Depends(get_db)):
    try:
        event = replay_webhook_event(session, event_id)
    except WebhookValidationError as error:
        return JSONResponse(status_code=error.status_code, content={"code": error.code, "message": str(error)})

    enqueue_webhook_processing(event.event_id)
    return {
        "event_id": event.event_id,
        "status": event.status.value,
        "deduplicated": False,
    }

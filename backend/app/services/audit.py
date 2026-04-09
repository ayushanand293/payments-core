from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.models import AuditEvent


def write_audit_event(
    session: Session,
    *,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload_json: dict,
) -> None:
    session.add(
        AuditEvent(
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            payload_json=jsonable_encoder(payload_json),
        )
    )

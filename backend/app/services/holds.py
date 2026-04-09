from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.idempotency import request_hash
from app.models import (
    Account,
    EscrowAccount,
    Hold,
    HoldStatus,
    IdempotencyKey,
    LedgerEntry,
    LedgerEntryDirection,
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.schemas import HoldAuthorizeCreate, HoldCaptureCreate, HoldReleaseCreate
from app.services.audit import write_audit_event
from app.services.balances import account_balances_minor


DEFAULT_HOLD_TTL_SECONDS = 15 * 60


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


@dataclass(slots=True)
class HoldResult:
    payload: dict
    created: bool


class IdempotencyConflictError(Exception):
    pass


class HoldValidationError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _idempotent_replay_or_conflict(
    session: Session,
    *,
    idempotency_key: str,
    scope: str,
    payload: dict,
) -> HoldResult | None:
    payload_hash = request_hash(scope, payload)
    existing = session.get(IdempotencyKey, idempotency_key)
    if existing is None:
        return None
    if existing.scope != scope or existing.request_hash != payload_hash:
        raise IdempotencyConflictError("Idempotency key was reused with a different request payload")
    if existing.response_json is None:
        raise HoldValidationError("IDEMPOTENCY_INCOMPLETE", "Existing idempotency record is incomplete")
    return HoldResult(payload=existing.response_json, created=False)


def _store_idempotency_result(
    session: Session,
    *,
    idempotency_key: str,
    scope: str,
    request_payload: dict,
    payload: dict,
    status_code: int,
) -> None:
    session.add(
        IdempotencyKey(
            key=idempotency_key,
            scope=scope,
            request_hash=request_hash(scope, request_payload),
            response_json=payload,
            status_code=status_code,
        )
    )


def _hold_payload(hold: Hold) -> dict:
    return {
        "id": hold.id,
        "account_id": hold.account_id,
        "currency_code": hold.currency_code,
        "amount_minor": hold.amount,
        "status": hold.status.value,
        "expires_at": hold.expires_at,
        "captured_tx_id": hold.captured_tx_id,
        "created_at": hold.created_at,
        "updated_at": hold.updated_at,
    }


def _expire_hold_if_needed(session: Session, hold: Hold, *, reason: str) -> bool:
    now = _utcnow()
    expires_at_utc = _as_utc(hold.expires_at)
    if hold.status != HoldStatus.AUTHORIZED or expires_at_utc > now:
        return False

    hold.status = HoldStatus.EXPIRED
    hold.updated_at = now
    write_audit_event(
        session,
        event_type="HOLD_EXPIRED",
        entity_type="hold",
        entity_id=str(hold.id),
        payload_json={
            "hold_id": str(hold.id),
            "account_id": str(hold.account_id),
            "currency": hold.currency_code,
            "amount": hold.amount,
            "expired_at": now.isoformat(),
            "reason": reason,
        },
    )
    return True


def _ensure_hold_active_for_action(session: Session, hold: Hold, *, action_name: str) -> None:
    if _expire_hold_if_needed(session, hold, reason=action_name):
        session.commit()
        raise HoldValidationError("HOLD_EXPIRED", "Hold has expired", status_code=409)


def _load_hold_for_update(session: Session, hold_id: UUID) -> Hold:
    hold = session.execute(select(Hold).where(Hold.id == hold_id).with_for_update()).scalar_one_or_none()
    if hold is None:
        raise HoldValidationError("HOLD_NOT_FOUND", "Hold was not found", status_code=404)
    return hold


def list_holds(session: Session) -> list[dict]:
    holds = session.execute(select(Hold).order_by(Hold.created_at.desc(), Hold.id.desc())).scalars().all()
    changed = False
    for hold in holds:
        if _expire_hold_if_needed(session, hold, reason="holds.list"):
            changed = True
    if changed:
        session.commit()
    return [_hold_payload(hold) for hold in holds]


def authorize_hold(session: Session, *, idempotency_key: str, payload: HoldAuthorizeCreate) -> HoldResult:
    scope = "holds.authorize"
    request_payload = payload.model_dump(mode="json")
    replay = _idempotent_replay_or_conflict(session, idempotency_key=idempotency_key, scope=scope, payload=request_payload)
    if replay is not None:
        return replay

    account = session.get(Account, payload.account_id)
    if account is None:
        raise HoldValidationError("ACCOUNT_NOT_FOUND", "Account was not found")

    if account.currency_code != payload.currency_code:
        raise HoldValidationError("CURRENCY_MISMATCH", "Account currency does not match hold currency", status_code=409)

    _, _, available_minor = account_balances_minor(session, account.id)
    if available_minor < payload.amount_minor:
        raise HoldValidationError(
            "INSUFFICIENT_FUNDS",
            "Available balance is too low for this hold",
            status_code=409,
        )

    ttl_seconds = payload.ttl_seconds if payload.ttl_seconds is not None else DEFAULT_HOLD_TTL_SECONDS
    expires_at = _utcnow() + timedelta(seconds=ttl_seconds)

    hold = Hold(
        account_id=account.id,
        currency_code=payload.currency_code,
        amount=payload.amount_minor,
        status=HoldStatus.AUTHORIZED,
        expires_at=expires_at,
    )
    session.add(hold)
    session.flush()

    write_audit_event(
        session,
        event_type="HOLD_AUTHORIZED",
        entity_type="hold",
        entity_id=str(hold.id),
        payload_json={
            "hold_id": str(hold.id),
            "account_id": str(hold.account_id),
            "currency": hold.currency_code,
            "amount": hold.amount,
            "idempotency_key": idempotency_key,
            "expires_at": hold.expires_at.isoformat(),
            "created_at": hold.created_at.isoformat() if hold.created_at else None,
        },
    )

    posted_minor, held_minor, available_minor = account_balances_minor(session, account.id)
    response_payload = jsonable_encoder(
        {
            "hold": _hold_payload(hold),
            "account_balances": {
                "posted_balance_minor": posted_minor,
                "held_balance_minor": held_minor,
                "available_balance_minor": available_minor,
            },
        }
    )

    _store_idempotency_result(
        session,
        idempotency_key=idempotency_key,
        scope=scope,
        request_payload=request_payload,
        payload=response_payload,
        status_code=201,
    )

    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        existing = session.get(IdempotencyKey, idempotency_key)
        if existing and existing.scope == scope and existing.request_hash == request_hash(scope, request_payload) and existing.response_json is not None:
            return HoldResult(payload=existing.response_json, created=False)
        raise IdempotencyConflictError("Idempotency key was reused with a different request payload") from error

    return HoldResult(payload=response_payload, created=True)


def capture_hold(session: Session, *, hold_id: UUID, idempotency_key: str, payload: HoldCaptureCreate) -> HoldResult:
    scope = f"holds.capture:{hold_id}"
    request_payload = payload.model_dump(mode="json")
    replay = _idempotent_replay_or_conflict(session, idempotency_key=idempotency_key, scope=scope, payload=request_payload)
    if replay is not None:
        return replay

    hold = _load_hold_for_update(session, hold_id)
    _ensure_hold_active_for_action(session, hold, action_name="holds.capture")

    if hold.status != HoldStatus.AUTHORIZED:
        raise HoldValidationError("INVALID_HOLD_STATE", "Hold must be AUTHORIZED before capture", status_code=409)

    if payload.currency_code != hold.currency_code:
        raise HoldValidationError("CURRENCY_MISMATCH", "Capture currency does not match hold currency", status_code=409)

    account = session.execute(select(Account).where(Account.id == hold.account_id).with_for_update()).scalar_one()
    if account.currency_code != hold.currency_code:
        raise HoldValidationError("CURRENCY_MISMATCH", "Account currency does not match hold currency", status_code=409)

    escrow_link = session.get(EscrowAccount, hold.currency_code)
    if escrow_link is None:
        raise HoldValidationError("ESCROW_ACCOUNT_NOT_FOUND", "Escrow account for currency was not found")

    escrow_account = session.execute(select(Account).where(Account.id == escrow_link.account_id).with_for_update()).scalar_one()

    transaction = Transaction(
        type=TransactionType.HOLD_CAPTURE,
        status=TransactionStatus.POSTED,
        currency_code=hold.currency_code,
        idempotency_key=idempotency_key,
        description=f"Hold capture for {hold.id}",
    )
    session.add(transaction)
    session.flush()

    session.add_all(
        [
            LedgerEntry(
                tx_id=transaction.id,
                account_id=account.id,
                currency_code=hold.currency_code,
                direction=LedgerEntryDirection.DEBIT,
                amount=hold.amount,
            ),
            LedgerEntry(
                tx_id=transaction.id,
                account_id=escrow_account.id,
                currency_code=hold.currency_code,
                direction=LedgerEntryDirection.CREDIT,
                amount=hold.amount,
            ),
        ]
    )

    hold.status = HoldStatus.CAPTURED
    hold.captured_tx_id = transaction.id
    hold.updated_at = _utcnow()

    write_audit_event(
        session,
        event_type="HOLD_CAPTURED",
        entity_type="hold",
        entity_id=str(hold.id),
        payload_json={
            "hold_id": str(hold.id),
            "account_id": str(hold.account_id),
            "currency": hold.currency_code,
            "amount": hold.amount,
            "tx_id": str(transaction.id),
            "idempotency_key": idempotency_key,
            "captured_at": hold.updated_at.isoformat(),
        },
    )
    write_audit_event(
        session,
        event_type="TX_CREATED",
        entity_type="transaction",
        entity_id=str(transaction.id),
        payload_json={
            "tx_id": str(transaction.id),
            "tx_type": transaction.type.value,
            "currency": transaction.currency_code,
            "amount": hold.amount,
            "hold_id": str(hold.id),
            "idempotency_key": idempotency_key,
            "created_at": transaction.created_at.isoformat() if transaction.created_at else None,
        },
    )

    response_payload = jsonable_encoder(
        {
            "hold": _hold_payload(hold),
            "transaction_id": transaction.id,
        }
    )

    _store_idempotency_result(
        session,
        idempotency_key=idempotency_key,
        scope=scope,
        request_payload=request_payload,
        payload=response_payload,
        status_code=201,
    )

    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        existing = session.get(IdempotencyKey, idempotency_key)
        if existing and existing.scope == scope and existing.request_hash == request_hash(scope, request_payload) and existing.response_json is not None:
            return HoldResult(payload=existing.response_json, created=False)
        raise IdempotencyConflictError("Idempotency key was reused with a different request payload") from error

    return HoldResult(payload=response_payload, created=True)


def release_hold(session: Session, *, hold_id: UUID, idempotency_key: str, payload: HoldReleaseCreate) -> HoldResult:
    scope = f"holds.release:{hold_id}"
    request_payload = payload.model_dump(mode="json")
    replay = _idempotent_replay_or_conflict(session, idempotency_key=idempotency_key, scope=scope, payload=request_payload)
    if replay is not None:
        return replay

    hold = _load_hold_for_update(session, hold_id)
    _ensure_hold_active_for_action(session, hold, action_name="holds.release")

    if hold.status != HoldStatus.AUTHORIZED:
        raise HoldValidationError("INVALID_HOLD_STATE", "Hold must be AUTHORIZED before release", status_code=409)

    if payload.currency_code != hold.currency_code:
        raise HoldValidationError("CURRENCY_MISMATCH", "Release currency does not match hold currency", status_code=409)

    hold.status = HoldStatus.RELEASED
    hold.updated_at = _utcnow()

    write_audit_event(
        session,
        event_type="HOLD_RELEASED",
        entity_type="hold",
        entity_id=str(hold.id),
        payload_json={
            "hold_id": str(hold.id),
            "account_id": str(hold.account_id),
            "currency": hold.currency_code,
            "amount": hold.amount,
            "idempotency_key": idempotency_key,
            "released_at": hold.updated_at.isoformat(),
        },
    )

    response_payload = jsonable_encoder({"hold": _hold_payload(hold)})

    _store_idempotency_result(
        session,
        idempotency_key=idempotency_key,
        scope=scope,
        request_payload=request_payload,
        payload=response_payload,
        status_code=200,
    )

    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        existing = session.get(IdempotencyKey, idempotency_key)
        if existing and existing.scope == scope and existing.request_hash == request_hash(scope, request_payload) and existing.response_json is not None:
            return HoldResult(payload=existing.response_json, created=False)
        raise IdempotencyConflictError("Idempotency key was reused with a different request payload") from error

    return HoldResult(payload=response_payload, created=True)

from __future__ import annotations

from dataclasses import dataclass

from fastapi.encoders import jsonable_encoder
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.idempotency import request_hash
from app.models import Account, IdempotencyKey, LedgerEntry, LedgerEntryDirection, Transaction, TransactionStatus, TransactionType
from app.schemas import TransferCreate


@dataclass(slots=True)
class TransferResult:
    payload: dict
    created: bool


class IdempotencyConflictError(Exception):
    pass


class TransferValidationError(Exception):
    def __init__(self, message: str, *, code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message)
        self.code = code


class TransferConflictError(Exception):
    def __init__(self, code: str, message: str, *, available_balance: int | None = None, required: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.available_balance = available_balance
        self.required = required


def _account_posted_balance(session: Session, account_id: str) -> int:
    posted_balance = func.coalesce(
        func.sum(
            case(
                (LedgerEntry.direction == LedgerEntryDirection.CREDIT, LedgerEntry.amount),
                else_=-LedgerEntry.amount,
            )
        ),
        0,
    )
    value = session.execute(select(posted_balance).where(LedgerEntry.account_id == account_id)).scalar_one()
    return int(value or 0)


def create_transfer(session: Session, *, idempotency_key: str, transfer: TransferCreate) -> TransferResult:
    scope = "transfers.create"
    payload_hash = request_hash(scope, transfer.model_dump(mode="json"))

    existing = session.get(IdempotencyKey, idempotency_key)
    if existing is not None:
        if existing.scope != scope or existing.request_hash != payload_hash:
            raise IdempotencyConflictError("IDEMPOTENCY_KEY_REUSED")
        if existing.response_json is None:
            raise TransferValidationError("Existing idempotency record is incomplete", code="IDEMPOTENCY_INCOMPLETE")
        return TransferResult(payload=existing.response_json, created=False)

    source = session.get(Account, transfer.from_account_id)
    destination = session.get(Account, transfer.to_account_id)

    if source is None or destination is None:
        raise TransferValidationError("Source or destination account not found", code="ACCOUNT_NOT_FOUND")
    if transfer.currency_code is None:
        if source.currency_code != destination.currency_code:
            raise TransferValidationError(
                "Transfer currency could not be inferred because account currencies do not match",
                code="CURRENCY_MISMATCH",
            )
        currency_code = source.currency_code
    else:
        currency_code = transfer.currency_code
        if source.currency_code != currency_code or destination.currency_code != currency_code:
            raise TransferValidationError("Currency code does not match both accounts", code="CURRENCY_MISMATCH")
    if source.id == destination.id:
        raise TransferValidationError("Source and destination must be different", code="INVALID_TRANSFER")

    locked_source = session.execute(select(Account).where(Account.id == source.id).with_for_update()).scalar_one()
    locked_destination = session.execute(select(Account).where(Account.id == destination.id).with_for_update()).scalar_one()

    available_balance = _account_posted_balance(session, locked_source.id)
    if available_balance < transfer.amount_minor:
        raise TransferConflictError(
            "INSUFFICIENT_FUNDS",
            "Available balance is too low for this transfer",
            available_balance=available_balance,
            required=transfer.amount_minor,
        )

    transaction = Transaction(
        type=TransactionType.TRANSFER,
        status=TransactionStatus.POSTED,
        currency_code=currency_code,
        idempotency_key=idempotency_key,
        description=transfer.description,
    )
    session.add(transaction)
    session.flush()

    session.add_all(
        [
            LedgerEntry(
                tx_id=transaction.id,
                account_id=locked_source.id,
                currency_code=currency_code,
                direction=LedgerEntryDirection.DEBIT,
                amount=transfer.amount_minor,
            ),
            LedgerEntry(
                tx_id=transaction.id,
                account_id=locked_destination.id,
                currency_code=currency_code,
                direction=LedgerEntryDirection.CREDIT,
                amount=transfer.amount_minor,
            ),
        ]
    )

    payload = jsonable_encoder(
        {
            "id": transaction.id,
            "type": transaction.type.value,
            "status": transaction.status.value,
            "currency_code": transaction.currency_code,
            "idempotency_key": transaction.idempotency_key,
            "description": transaction.description,
            "created_at": transaction.created_at,
            "ledger_entries": [
                {
                    "account_id": locked_source.id,
                    "direction": LedgerEntryDirection.DEBIT.value,
                    "amount_minor": transfer.amount_minor,
                    "currency_code": currency_code,
                },
                {
                    "account_id": locked_destination.id,
                    "direction": LedgerEntryDirection.CREDIT.value,
                    "amount_minor": transfer.amount_minor,
                    "currency_code": currency_code,
                },
            ],
        }
    )

    session.add(
        IdempotencyKey(
            key=idempotency_key,
            scope=scope,
            request_hash=payload_hash,
            response_json=payload,
            status_code=201,
        )
    )

    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        existing = session.get(IdempotencyKey, idempotency_key)
        if existing and existing.scope == scope and existing.request_hash == payload_hash and existing.response_json is not None:
            return TransferResult(payload=existing.response_json, created=False)
        raise IdempotencyConflictError("IDEMPOTENCY_KEY_REUSED") from error

    return TransferResult(payload=payload, created=True)

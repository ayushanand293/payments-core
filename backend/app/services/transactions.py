from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LedgerEntry, LedgerEntryDirection, Transaction


def list_transactions(session: Session) -> list[dict]:
    rows = session.execute(select(Transaction).order_by(Transaction.created_at.desc(), Transaction.id.desc())).scalars().all()
    payload: list[dict] = []

    for transaction in rows:
        entries = session.execute(
            select(LedgerEntry).where(LedgerEntry.tx_id == transaction.id).order_by(LedgerEntry.created_at, LedgerEntry.id)
        ).scalars().all()
        credit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.CREDIT)
        debit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.DEBIT)

        payload.append(
            {
                "id": transaction.id,
                "type": transaction.type.value,
                "status": transaction.status.value,
                "currency_code": transaction.currency_code,
                "idempotency_key": transaction.idempotency_key,
                "description": transaction.description,
                "created_at": transaction.created_at,
                "balanced": credit_total == debit_total,
            }
        )

    return payload


def get_transaction_detail(session: Session, transaction_id: UUID) -> dict | None:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        return None

    entries = session.execute(
        select(LedgerEntry).where(LedgerEntry.tx_id == transaction_id).order_by(LedgerEntry.created_at, LedgerEntry.id)
    ).scalars().all()
    credit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.CREDIT)
    debit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.DEBIT)

    return {
        "id": transaction.id,
        "type": transaction.type.value,
        "status": transaction.status.value,
        "currency_code": transaction.currency_code,
        "idempotency_key": transaction.idempotency_key,
        "description": transaction.description,
        "created_at": transaction.created_at,
        "balanced": credit_total == debit_total,
        "ledger_entries": [
            {
                "id": entry.id,
                "tx_id": entry.tx_id,
                "account_id": entry.account_id,
                "currency_code": entry.currency_code,
                "direction": entry.direction.value,
                "amount_minor": entry.amount,
                "created_at": entry.created_at,
            }
            for entry in entries
        ],
    }

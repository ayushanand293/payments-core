from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LedgerEntry, LedgerEntryDirection, Transaction


def assert_tx_balanced(session: Session, tx_id: UUID, *, expected_entry_count: int | None = None) -> list[LedgerEntry]:
    transaction = session.get(Transaction, tx_id)
    assert transaction is not None

    entries = session.execute(
        select(LedgerEntry).where(LedgerEntry.tx_id == tx_id).order_by(LedgerEntry.created_at, LedgerEntry.id)
    ).scalars().all()
    assert entries, "Transaction has no ledger entries"

    debit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.DEBIT)
    credit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.CREDIT)
    assert debit_total == credit_total

    currencies = {entry.currency_code for entry in entries}
    assert currencies == {transaction.currency_code}

    if expected_entry_count is not None:
        assert len(entries) == expected_entry_count

    return entries

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, LedgerEntry, LedgerEntryDirection, Transaction, TransactionStatus, TransactionType
from app.services.audit import write_audit_event


class DemoFundingError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def fund_account(session: Session, *, account_id: UUID, amount: int, currency: str) -> dict:
    target = session.get(Account, account_id)
    if target is None:
        raise DemoFundingError("ACCOUNT_NOT_FOUND", "Target account was not found")
    if target.currency_code != currency:
        raise DemoFundingError("CURRENCY_MISMATCH", "Funding currency does not match account currency")

    mint = session.execute(
        select(Account).where(
            Account.currency_code == currency,
            Account.name == f"{currency} Mint Source",
        )
    ).scalar_one_or_none()
    if mint is None:
        raise DemoFundingError("MINT_ACCOUNT_MISSING", "Mint source account is missing for this currency")

    transaction = Transaction(
        type=TransactionType.DEPOSIT,
        status=TransactionStatus.POSTED,
        currency_code=currency,
        idempotency_key=f"demo:fund:{uuid4()}",
        description=f"Demo funding for account {target.id}",
    )
    session.add(transaction)
    session.flush()

    session.add_all(
        [
            LedgerEntry(
                tx_id=transaction.id,
                account_id=mint.id,
                currency_code=currency,
                direction=LedgerEntryDirection.DEBIT,
                amount=amount,
            ),
            LedgerEntry(
                tx_id=transaction.id,
                account_id=target.id,
                currency_code=currency,
                direction=LedgerEntryDirection.CREDIT,
                amount=amount,
            ),
        ]
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
            "amount": amount,
            "idempotency_key": transaction.idempotency_key,
            "created_at": transaction.created_at.isoformat() if transaction.created_at else None,
        },
    )
    session.commit()

    return jsonable_encoder(
        {
            "id": transaction.id,
            "type": transaction.type.value,
            "status": transaction.status.value,
            "currency_code": transaction.currency_code,
            "description": transaction.description,
            "amount": amount,
            "funded_account_id": str(target.id),
        }
    )
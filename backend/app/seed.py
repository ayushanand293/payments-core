from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountType,
    AuditEvent,
    Currency,
    DlqEvent,
    EscrowAccount,
    Hold,
    IdempotencyKey,
    LedgerEntry,
    LedgerEntryDirection,
    Transaction,
    TransactionStatus,
    TransactionType,
    WebhookEvent,
)


def seed_demo_data(session: Session) -> None:
    if session.execute(select(func.count()).select_from(Currency)).scalar_one():
        return

    session.add_all([Currency(code="INR", minor_unit=2), Currency(code="USD", minor_unit=2), Currency(code="EUR", minor_unit=2)])
    session.flush()

    for currency_code in ["INR", "USD", "EUR"]:
        mint = Account(name=f"{currency_code} Mint Source", currency_code=currency_code, type=AccountType.MERCHANT)
        treasury = Account(name=f"{currency_code} Treasury", currency_code=currency_code, type=AccountType.MERCHANT)
        alice = Account(name=f"{currency_code} Alice Wallet", currency_code=currency_code, type=AccountType.USER)
        merchant = Account(name=f"{currency_code} Corner Shop", currency_code=currency_code, type=AccountType.MERCHANT)
        escrow = Account(name=f"{currency_code} Escrow", currency_code=currency_code, type=AccountType.ESCROW)
        session.add_all([mint, treasury, alice, merchant, escrow])
        session.flush()

        session.add(EscrowAccount(currency_code=currency_code, account_id=escrow.id))

        opening_tx = Transaction(
            type=TransactionType.DEPOSIT,
            status=TransactionStatus.POSTED,
            currency_code=currency_code,
            idempotency_key=f"seed:{currency_code}:opening",
            description=f"Opening balance for {currency_code} demo accounts",
        )
        session.add(opening_tx)
        session.flush()

        session.add_all(
            [
                LedgerEntry(
                    tx_id=opening_tx.id,
                    account_id=mint.id,
                    currency_code=currency_code,
                    direction=LedgerEntryDirection.DEBIT,
                    amount=500000,
                ),
                LedgerEntry(
                    tx_id=opening_tx.id,
                    account_id=alice.id,
                    currency_code=currency_code,
                    direction=LedgerEntryDirection.CREDIT,
                    amount=500000,
                ),
            ]
        )

    session.commit()


def reset_demo_data(session: Session) -> None:
    # Ordered deletes keep this path portable across Postgres and SQLite.
    session.execute(delete(AuditEvent))
    session.execute(delete(DlqEvent))
    session.execute(delete(WebhookEvent))
    session.execute(delete(Hold))
    session.execute(delete(LedgerEntry))
    session.execute(delete(IdempotencyKey))
    session.execute(delete(EscrowAccount))
    session.execute(delete(Transaction))
    session.execute(delete(Account))
    session.execute(delete(Currency))
    session.commit()
    seed_demo_data(session)

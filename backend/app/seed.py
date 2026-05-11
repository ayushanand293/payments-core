from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256

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
    HoldStatus,
    IdempotencyKey,
    LedgerEntry,
    LedgerEntryDirection,
    ReconcileRun,
    Transaction,
    TransactionStatus,
    TransactionType,
    WebhookEvent,
    WebhookEventStatus,
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


def seed_public_demo_data(session: Session) -> None:
    if session.execute(select(func.count()).select_from(Currency)).scalar_one():
        return

    seed_demo_data(session)

    alice = session.execute(select(Account).where(Account.name == "INR Alice Wallet")).scalar_one()
    merchant = session.execute(select(Account).where(Account.name == "INR Corner Shop")).scalar_one()

    transfer_tx = Transaction(
        type=TransactionType.TRANSFER,
        status=TransactionStatus.POSTED,
        currency_code="INR",
        idempotency_key="public-seed:inr:transfer",
        description="Public demo transfer",
    )
    session.add(transfer_tx)
    session.flush()

    session.add_all(
        [
            LedgerEntry(
                tx_id=transfer_tx.id,
                account_id=alice.id,
                currency_code="INR",
                direction=LedgerEntryDirection.DEBIT,
                amount=1250,
            ),
            LedgerEntry(
                tx_id=transfer_tx.id,
                account_id=merchant.id,
                currency_code="INR",
                direction=LedgerEntryDirection.CREDIT,
                amount=1250,
            ),
            Hold(
                account_id=alice.id,
                currency_code="INR",
                amount=900,
                status=HoldStatus.AUTHORIZED,
                expires_at=datetime.now(UTC) + timedelta(days=7),
            ),
        ]
    )

    processed_payload = {"account_id": str(merchant.id), "currency_code": "INR", "amount_minor": 500}
    dlq_payload = {"account_id": str(alice.id), "currency_code": "INR", "amount_minor": -100}
    session.add_all(
        [
            WebhookEvent(
                event_id="evt-public-seed-processed",
                event_type="demo.fund",
                payload_json=processed_payload,
                payload_hash=sha256(repr(processed_payload).encode("utf-8")).hexdigest(),
                status=WebhookEventStatus.PROCESSED,
                attempts=1,
                occurred_at=datetime.now(UTC),
            ),
            WebhookEvent(
                event_id="evt-public-seed-dlq",
                event_type="demo.fund",
                payload_json=dlq_payload,
                payload_hash=sha256(repr(dlq_payload).encode("utf-8")).hexdigest(),
                status=WebhookEventStatus.DLQ,
                attempts=5,
                last_error="Seeded validation failure for DLQ visibility",
                occurred_at=datetime.now(UTC),
            ),
            DlqEvent(
                event_id="evt-public-seed-dlq",
                event_type="demo.fund",
                payload_json=dlq_payload,
                attempts=5,
                last_error="Seeded validation failure for DLQ visibility",
            ),
            ReconcileRun(
                report_json={
                    "run_id": "seed-public-demo",
                    "ran_at": datetime.now(UTC).isoformat(),
                    "summary": {
                        "unbalanced_transactions": 0,
                        "currency_mismatches": 0,
                        "invalid_holds": 0,
                        "negative_available_balances": 0,
                        "webhook_state_anomalies": 0,
                        "dlq_state_anomalies": 0,
                    },
                    "details": {
                        "unbalanced_transactions": [],
                        "currency_mismatches": [],
                        "invalid_holds": [],
                        "negative_available_balances": [],
                        "webhook_state_anomalies": [],
                        "dlq_state_anomalies": [],
                    },
                },
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

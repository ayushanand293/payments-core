from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4
from uuid import UUID

from sqlalchemy import select

from app.models import (
    Account,
    Hold,
    HoldStatus,
    LedgerEntry,
    LedgerEntryDirection,
    Transaction,
    TransactionStatus,
    TransactionType,
    WebhookEvent,
    WebhookEventStatus,
)


def _account_by_name(client, name: str) -> dict:
    accounts = client.get("/accounts").json()
    return next(account for account in accounts if account["name"] == name)


def test_reconcile_detects_unbalanced_transaction(client):
    account = _account_by_name(client, "INR Alice Wallet")

    with client.app.state.session_factory() as session:
        tx = Transaction(
            type=TransactionType.TRANSFER,
            status=TransactionStatus.POSTED,
            currency_code="INR",
            idempotency_key=f"reconcile-unbalanced-{uuid4()}",
            description="Intentional unbalanced transaction",
        )
        session.add(tx)
        session.flush()

        session.add(
            LedgerEntry(
                tx_id=tx.id,
                account_id=UUID(account["id"]),
                currency_code="INR",
                direction=LedgerEntryDirection.DEBIT,
                amount=123,
            )
        )
        session.commit()
        tx_id = str(tx.id)

    response = client.post("/reconcile/run")
    assert response.status_code == 200
    report = response.json()

    assert report["summary"]["unbalanced_transactions"] >= 1
    assert any(item["tx_id"] == tx_id for item in report["details"]["unbalanced_transactions"])


def test_reconcile_detects_negative_available_balance(client):
    account = client.post(
        "/accounts",
        json={"name": "INR Reconcile Negative", "currency_code": "INR", "type": "USER"},
    ).json()

    with client.app.state.session_factory() as session:
        hold = Hold(
            account_id=UUID(account["id"]),
            currency_code="INR",
            amount=500,
            status=HoldStatus.AUTHORIZED,
            expires_at=datetime.now(UTC) + timedelta(minutes=20),
        )
        session.add(hold)
        session.commit()

    response = client.post("/reconcile/run")
    assert response.status_code == 200
    report = response.json()

    assert report["summary"]["negative_available_balances"] >= 1
    assert any(item["account_id"] == account["id"] for item in report["details"]["negative_available_balances"])


def test_reconcile_detects_dlq_state_anomaly(client):
    payload = {"account_id": "demo", "currency_code": "INR", "amount_minor": 1}
    payload_hash = sha256(b'{"account_id":"demo","amount_minor":1,"currency_code":"INR"}').hexdigest()

    with client.app.state.session_factory() as session:
        event = WebhookEvent(
            event_id="evt-reconcile-dlq-anomaly",
            event_type="demo.fund",
            payload_json=payload,
            payload_hash=payload_hash,
            status=WebhookEventStatus.DLQ,
            attempts=5,
            last_error="forced",
        )
        session.add(event)
        session.commit()

    response = client.post("/reconcile/run")
    assert response.status_code == 200
    report = response.json()

    assert report["summary"]["dlq_state_anomalies"] >= 1
    assert any(item["event_id"] == "evt-reconcile-dlq-anomaly" for item in report["details"]["dlq_state_anomalies"])

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select

from app.models import EscrowAccount, LedgerEntry
from backend.tests.helpers import assert_tx_balanced


def test_account_creation_and_currency_listing(client):
    currencies = client.get("/currencies").json()
    assert {currency["code"] for currency in currencies} == {"INR", "USD", "EUR"}

    account_response = client.post(
        "/accounts",
        json={"name": "INR User A", "currency_code": "INR", "type": "USER"},
    )
    assert account_response.status_code == 201
    account = account_response.json()
    assert account["name"] == "INR User A"
    assert account["posted_balance_minor"] == 0

    detail = client.get(f"/accounts/{account['id']}").json()
    assert detail["id"] == account["id"]
    assert detail["available_balance_minor"] == 0

    escrow_response = client.post(
        "/accounts",
        json={"name": "Bad Escrow", "currency_code": "INR", "type": "ESCROW"},
    )
    assert escrow_response.status_code == 400

    with client.app.state.session_factory() as session:
        escrow_rows = session.execute(select(EscrowAccount)).scalars().all()
    assert len(escrow_rows) == 3
    assert {row.currency_code for row in escrow_rows} == {"INR", "USD", "EUR"}


def test_transfer_is_idempotent_and_balanced(client):
    accounts = client.get("/accounts").json()
    source_account = next(account for account in accounts if account["name"] == "INR Alice Wallet")
    destination_account = next(account for account in accounts if account["name"] == "INR Corner Shop")

    payload = {
        "from_account_id": source_account["id"],
        "to_account_id": destination_account["id"],
        "currency_code": "INR",
        "amount_minor": 1250,
        "description": "Lunch payment",
    }

    first_response = client.post("/transfers", json=payload, headers={"Idempotency-Key": "transfer-demo-001"})
    second_response = client.post("/transfers", json=payload, headers={"Idempotency-Key": "transfer-demo-001"})

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_response.json()["id"] == second_response.json()["id"]

    tx_id = first_response.json()["id"]
    transaction = client.get(f"/transactions/{tx_id}").json()
    assert transaction["balanced"] is True
    assert len(transaction["ledger_entries"]) == 2

    with client.app.state.session_factory() as session:
        assert_tx_balanced(session, UUID(tx_id), expected_entry_count=2)
        entry_count = session.execute(
            select(func.count()).select_from(LedgerEntry).where(LedgerEntry.tx_id == UUID(tx_id))
        ).scalar_one()
    assert entry_count == 2


def test_transfer_rejects_insufficient_funds(client):
    source = client.post(
        "/accounts",
        json={"name": "INR User Source", "currency_code": "INR", "type": "USER"},
    ).json()
    destination = client.post(
        "/accounts",
        json={"name": "INR User Destination", "currency_code": "INR", "type": "USER"},
    ).json()

    response = client.post(
        "/transfers",
        json={
            "from_account_id": source["id"],
            "to_account_id": destination["id"],
            "amount_minor": 100,
            "description": "Should fail",
        },
        headers={"Idempotency-Key": "transfer-insufficient-001"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "INSUFFICIENT_FUNDS"
    assert body["available_balance"] == 0
    assert body["required"] == 100


def test_demo_fund_creates_balanced_deposit_entries(client):
    created = client.post(
        "/accounts",
        json={"name": "INR User Funded", "currency_code": "INR", "type": "USER"},
    ).json()

    fund_response = client.post(
        "/demo/fund",
        json={
            "account_id": created["id"],
            "amount": 2500,
            "currency": "INR",
        },
        headers={"X-DEMO-SECRET": "change-me"},
    )

    assert fund_response.status_code == 200
    payload = fund_response.json()
    tx_id = UUID(payload["id"])

    with client.app.state.session_factory() as session:
        assert_tx_balanced(session, tx_id, expected_entry_count=2)

    account_detail = client.get(f"/accounts/{created['id']}").json()
    assert account_detail["posted_balance_minor"] == 2500


def test_ledger_invariant_holds_for_all_transactions(client):
    transactions = client.get("/transactions").json()
    for transaction in transactions:
        detail = client.get(f"/transactions/{transaction['id']}").json()
        credit_total = sum(entry["amount_minor"] for entry in detail["ledger_entries"] if entry["direction"] == "CREDIT")
        debit_total = sum(entry["amount_minor"] for entry in detail["ledger_entries"] if entry["direction"] == "DEBIT")
        assert credit_total == debit_total

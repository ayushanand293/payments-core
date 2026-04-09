from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select

from app.models import EscrowAccount, Hold, HoldStatus
from backend.tests.helpers import assert_tx_balanced


def _account_by_name(client, name: str) -> dict:
    accounts = client.get("/accounts").json()
    return next(account for account in accounts if account["name"] == name)


def test_authorize_reduces_available_not_posted(client):
    source = _account_by_name(client, "INR Alice Wallet")

    authorize_response = client.post(
        "/holds/authorize",
        json={
            "account_id": source["id"],
            "currency_code": "INR",
            "amount_minor": 1250,
            "ttl_seconds": 900,
        },
        headers={"Idempotency-Key": "hold-authorize-001"},
    )

    assert authorize_response.status_code == 201
    account_after = client.get(f"/accounts/{source['id']}").json()
    assert account_after["posted_balance_minor"] == source["posted_balance_minor"]
    assert account_after["held_balance_minor"] == 1250
    assert account_after["available_balance_minor"] == source["available_balance_minor"] - 1250


def test_capture_creates_balanced_entries_and_credits_escrow(client):
    source = _account_by_name(client, "INR Alice Wallet")

    authorize_response = client.post(
        "/holds/authorize",
        json={
            "account_id": source["id"],
            "currency_code": "INR",
            "amount_minor": 2300,
            "ttl_seconds": 900,
        },
        headers={"Idempotency-Key": "hold-authorize-002"},
    )
    hold_id = authorize_response.json()["hold"]["id"]

    capture_response = client.post(
        f"/holds/{hold_id}/capture",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-capture-002"},
    )

    assert capture_response.status_code == 201
    payload = capture_response.json()
    assert payload["hold"]["status"] == "CAPTURED"
    tx_id = UUID(payload["transaction_id"])

    with client.app.state.session_factory() as session:
        assert_tx_balanced(session, tx_id, expected_entry_count=2)
        escrow_account_id = session.get(EscrowAccount, "INR").account_id

    tx_detail = client.get(f"/transactions/{tx_id}").json()
    assert tx_detail["balanced"] is True
    debit_entry = next(entry for entry in tx_detail["ledger_entries"] if entry["direction"] == "DEBIT")
    credit_entry = next(entry for entry in tx_detail["ledger_entries"] if entry["direction"] == "CREDIT")
    assert debit_entry["account_id"] == source["id"]
    assert credit_entry["account_id"] == str(escrow_account_id)


def test_release_restores_availability(client):
    source = _account_by_name(client, "INR Alice Wallet")

    authorize_response = client.post(
        "/holds/authorize",
        json={
            "account_id": source["id"],
            "currency_code": "INR",
            "amount_minor": 900,
            "ttl_seconds": 900,
        },
        headers={"Idempotency-Key": "hold-authorize-003"},
    )
    hold_id = authorize_response.json()["hold"]["id"]

    after_authorize = client.get(f"/accounts/{source['id']}").json()
    assert after_authorize["held_balance_minor"] == 900

    release_response = client.post(
        f"/holds/{hold_id}/release",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-release-003"},
    )
    assert release_response.status_code == 200

    after_release = client.get(f"/accounts/{source['id']}").json()
    assert after_release["posted_balance_minor"] == source["posted_balance_minor"]
    assert after_release["held_balance_minor"] == 0
    assert after_release["available_balance_minor"] == source["available_balance_minor"]


def test_hold_endpoints_are_idempotent(client):
    source = _account_by_name(client, "INR Alice Wallet")

    authorize_payload = {
        "account_id": source["id"],
        "currency_code": "INR",
        "amount_minor": 1100,
        "ttl_seconds": 900,
    }
    first_authorize = client.post("/holds/authorize", json=authorize_payload, headers={"Idempotency-Key": "hold-authorize-004"})
    second_authorize = client.post("/holds/authorize", json=authorize_payload, headers={"Idempotency-Key": "hold-authorize-004"})
    assert first_authorize.status_code == 201
    assert second_authorize.status_code == 201
    hold_id = first_authorize.json()["hold"]["id"]
    assert hold_id == second_authorize.json()["hold"]["id"]

    first_capture = client.post(
        f"/holds/{hold_id}/capture",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-capture-004"},
    )
    second_capture = client.post(
        f"/holds/{hold_id}/capture",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-capture-004"},
    )
    assert first_capture.status_code == 201
    assert second_capture.status_code == 201
    assert first_capture.json()["transaction_id"] == second_capture.json()["transaction_id"]

    new_authorize = client.post(
        "/holds/authorize",
        json={
            "account_id": source["id"],
            "currency_code": "INR",
            "amount_minor": 700,
            "ttl_seconds": 900,
        },
        headers={"Idempotency-Key": "hold-authorize-005"},
    )
    releasable_hold_id = new_authorize.json()["hold"]["id"]
    first_release = client.post(
        f"/holds/{releasable_hold_id}/release",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-release-005"},
    )
    second_release = client.post(
        f"/holds/{releasable_hold_id}/release",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-release-005"},
    )
    assert first_release.status_code == 200
    assert second_release.status_code == 200
    assert first_release.json()["hold"]["id"] == second_release.json()["hold"]["id"]



def test_expired_hold_is_persisted_and_blocks_capture(client):
    source = _account_by_name(client, "INR Alice Wallet")

    authorize_response = client.post(
        "/holds/authorize",
        json={
            "account_id": source["id"],
            "currency_code": "INR",
            "amount_minor": 500,
            "ttl_seconds": 900,
        },
        headers={"Idempotency-Key": "hold-authorize-006"},
    )
    hold_id = UUID(authorize_response.json()["hold"]["id"])

    with client.app.state.session_factory() as session:
        hold = session.get(Hold, hold_id)
        hold.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()

    capture_response = client.post(
        f"/holds/{hold_id}/capture",
        json={"currency_code": "INR"},
        headers={"Idempotency-Key": "hold-capture-006"},
    )
    assert capture_response.status_code == 409
    assert capture_response.json()["code"] == "HOLD_EXPIRED"

    with client.app.state.session_factory() as session:
        hold = session.get(Hold, hold_id)
        assert hold.status == HoldStatus.EXPIRED

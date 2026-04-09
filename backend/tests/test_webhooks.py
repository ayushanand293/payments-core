from __future__ import annotations

from sqlalchemy import select

from app.models import DlqEvent, WebhookEvent, WebhookEventStatus
from app.services.webhooks import process_webhook_event


def _account_by_name(client, name: str) -> dict:
    accounts = client.get("/accounts").json()
    return next(account for account in accounts if account["name"] == name)


def _webhook_payload(event_id: str, account_id: str, currency_code: str, amount_minor: int) -> dict:
    return {
        "event_id": event_id,
        "event_type": "demo.fund",
        "occurred_at": "2026-04-06T12:00:00Z",
        "payload": {
            "account_id": account_id,
            "currency_code": currency_code,
            "amount_minor": amount_minor,
        },
    }


def _drain_processing(client, event_id: str) -> None:
    pending = [event_id]
    while pending:
        current = pending.pop(0)
        with client.app.state.session_factory() as session:
            process_webhook_event(
                session,
                event_id=current,
                enqueue_retry=lambda next_event_id, _countdown: pending.append(next_event_id),
            )


def test_webhook_ingest_dedupes_without_double_apply(client):
    account = _account_by_name(client, "INR Alice Wallet")
    starting_balance = account["posted_balance_minor"]

    first = client.post("/webhooks/gateway", json=_webhook_payload("evt-week3-001", account["id"], "INR", 700))
    assert first.status_code == 202
    assert first.json()["deduplicated"] is False
    _drain_processing(client, "evt-week3-001")

    second = client.post("/webhooks/gateway", json=_webhook_payload("evt-week3-001", account["id"], "INR", 700))
    assert second.status_code == 202
    assert second.json()["deduplicated"] is True

    account_after = client.get(f"/accounts/{account['id']}").json()
    assert account_after["posted_balance_minor"] == starting_balance + 700

    with client.app.state.session_factory() as session:
        event = session.get(WebhookEvent, "evt-week3-001")
        assert event is not None
        assert event.status == WebhookEventStatus.PROCESSED
        assert event.attempts >= 1


def test_webhook_moves_to_dlq_after_retry_limit(client):
    account = _account_by_name(client, "INR Alice Wallet")

    response = client.post(
        "/webhooks/gateway",
        json={
            "event_id": "evt-week3-002",
            "event_type": "demo.fund",
            "occurred_at": "2026-04-06T12:00:00Z",
            "payload": {
                "account_id": account["id"],
                "currency_code": "USD",
                "amount_minor": 100,
            },
        },
    )
    assert response.status_code == 202
    _drain_processing(client, "evt-week3-002")

    with client.app.state.session_factory() as session:
        event = session.get(WebhookEvent, "evt-week3-002")
        assert event is not None
        assert event.status == WebhookEventStatus.DLQ
        assert event.attempts == 5

        dlq = session.execute(select(DlqEvent).where(DlqEvent.event_id == "evt-week3-002")).scalar_one_or_none()
        assert dlq is not None
        assert "Currency does not match account" in dlq.last_error


def test_replay_from_dlq_succeeds(client):
    account = _account_by_name(client, "INR Alice Wallet")

    failed = client.post(
        "/webhooks/gateway",
        json={
            "event_id": "evt-week3-003",
            "event_type": "demo.fund",
            "occurred_at": "2026-04-06T12:00:00Z",
            "payload": {
                "account_id": account["id"],
                "currency_code": "USD",
                "amount_minor": 100,
            },
        },
    )
    assert failed.status_code == 202
    _drain_processing(client, "evt-week3-003")

    starting_balance = client.get(f"/accounts/{account['id']}").json()["posted_balance_minor"]

    update_response = client.post(
        "/webhooks/gateway",
        json=_webhook_payload("evt-week3-003", account["id"], "INR", 450),
    )
    assert update_response.status_code == 409

    with client.app.state.session_factory() as session:
        event = session.get(WebhookEvent, "evt-week3-003")
        event.payload_json = {
            "account_id": account["id"],
            "currency_code": "INR",
            "amount_minor": 450,
        }
        session.commit()

    replay_response = client.post("/dlq/evt-week3-003/replay")
    assert replay_response.status_code == 202
    _drain_processing(client, "evt-week3-003")

    account_after = client.get(f"/accounts/{account['id']}").json()
    assert account_after["posted_balance_minor"] == starting_balance + 450

    with client.app.state.session_factory() as session:
        event = session.get(WebhookEvent, "evt-week3-003")
        assert event is not None
        assert event.status == WebhookEventStatus.PROCESSED
        assert event.last_error is None

        dlq = session.execute(select(DlqEvent).where(DlqEvent.event_id == "evt-week3-003")).scalar_one_or_none()
        assert dlq is None

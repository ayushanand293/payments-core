from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.metrics import mark_reconcile_run, metrics_snapshot, refresh_runtime_gauges, sync_derived_counters
from app.models import (
    Account,
    AccountType,
    DlqEvent,
    Hold,
    HoldStatus,
    LedgerEntry,
    LedgerEntryDirection,
    ReconcileRun,
    Transaction,
    TransactionType,
    WebhookEvent,
    WebhookEventStatus,
)
from app.services.balances import account_balances_minor

PROCESSING_STALE_THRESHOLD = timedelta(minutes=5)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _ledger_checks(session: Session) -> tuple[list[dict], list[dict]]:
    unbalanced: list[dict] = []
    mismatches: list[dict] = []

    transactions = session.execute(select(Transaction)).scalars().all()
    for tx in transactions:
        entries = session.execute(select(LedgerEntry).where(LedgerEntry.tx_id == tx.id)).scalars().all()
        debit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.DEBIT)
        credit_total = sum(entry.amount for entry in entries if entry.direction == LedgerEntryDirection.CREDIT)

        if debit_total != credit_total:
            unbalanced.append(
                {
                    "tx_id": str(tx.id),
                    "debit_total": debit_total,
                    "credit_total": credit_total,
                    "entry_count": len(entries),
                }
            )

        entry_currencies = sorted({entry.currency_code for entry in entries})
        if any(entry.currency_code != tx.currency_code for entry in entries):
            mismatches.append(
                {
                    "tx_id": str(tx.id),
                    "transaction_currency": tx.currency_code,
                    "entry_currencies": entry_currencies,
                }
            )

        if tx.type in {TransactionType.TRANSFER, TransactionType.HOLD_CAPTURE} and len(entries) != 2:
            unbalanced.append(
                {
                    "tx_id": str(tx.id),
                    "debit_total": debit_total,
                    "credit_total": credit_total,
                    "entry_count": len(entries),
                    "reason": "expected_2_entries",
                }
            )

    return unbalanced, mismatches


def _hold_checks(session: Session) -> list[dict]:
    invalid: list[dict] = []
    now = datetime.now(UTC)

    holds = session.execute(select(Hold)).scalars().all()
    for hold in holds:
        if hold.status == HoldStatus.CAPTURED and hold.captured_tx_id is None:
            invalid.append(
                {
                    "hold_id": str(hold.id),
                    "reason": "captured_without_captured_tx",
                    "status": hold.status.value,
                }
            )
        if hold.status == HoldStatus.RELEASED and hold.captured_tx_id is not None:
            invalid.append(
                {
                    "hold_id": str(hold.id),
                    "reason": "released_with_captured_tx",
                    "status": hold.status.value,
                }
            )
        if hold.status == HoldStatus.AUTHORIZED and _as_utc(hold.expires_at) < now:
            invalid.append(
                {
                    "hold_id": str(hold.id),
                    "reason": "authorized_but_expired",
                    "status": hold.status.value,
                    "expires_at": hold.expires_at.isoformat(),
                }
            )

    return invalid


def _negative_available_checks(session: Session) -> list[dict]:
    invalid: list[dict] = []
    accounts = session.execute(
        select(Account).where(
            Account.type.in_([AccountType.USER, AccountType.MERCHANT]),
            ~Account.name.like("% Mint Source"),
        )
    ).scalars().all()
    for account in accounts:
        posted, held, available = account_balances_minor(session, account.id)
        if available < 0:
            invalid.append(
                {
                    "account_id": str(account.id),
                    "currency_code": account.currency_code,
                    "posted_balance_minor": posted,
                    "held_balance_minor": held,
                    "available_balance_minor": available,
                }
            )
    return invalid


def _webhook_dlq_checks(session: Session) -> tuple[list[dict], list[dict]]:
    webhook_anomalies: list[dict] = []
    dlq_anomalies: list[dict] = []

    webhooks = session.execute(select(WebhookEvent)).scalars().all()
    dlq_rows = session.execute(select(DlqEvent)).scalars().all()

    dlq_by_event = {row.event_id: row for row in dlq_rows}
    webhook_by_event = {event.event_id: event for event in webhooks}

    stale_cutoff = datetime.now(UTC) - PROCESSING_STALE_THRESHOLD
    for event in webhooks:
        if event.status == WebhookEventStatus.DLQ and event.event_id not in dlq_by_event:
            dlq_anomalies.append(
                {
                    "event_id": event.event_id,
                    "reason": "webhook_dlq_without_dlq_row",
                }
            )

        created_at = _as_utc(event.created_at) if event.created_at else None
        if event.status == WebhookEventStatus.PROCESSING and created_at and created_at < stale_cutoff:
            webhook_anomalies.append(
                {
                    "event_id": event.event_id,
                    "reason": "processing_stale",
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                }
            )

    for dlq_row in dlq_rows:
        event = webhook_by_event.get(dlq_row.event_id)
        if event is None or event.status != WebhookEventStatus.DLQ:
            dlq_anomalies.append(
                {
                    "event_id": dlq_row.event_id,
                    "reason": "dlq_row_without_webhook_dlq_status",
                    "webhook_status": event.status.value if event is not None else None,
                }
            )

    return webhook_anomalies, dlq_anomalies


def run_reconciliation(session: Session) -> dict:
    unbalanced_transactions, currency_mismatches = _ledger_checks(session)
    invalid_holds = _hold_checks(session)
    negative_available_balances = _negative_available_checks(session)
    webhook_state_anomalies, dlq_state_anomalies = _webhook_dlq_checks(session)

    reconcile_run = ReconcileRun(
        report_json={},
    )
    session.add(reconcile_run)
    session.flush()

    report = {
        "run_id": str(reconcile_run.id),
        "ran_at": reconcile_run.ran_at.isoformat() if reconcile_run.ran_at else datetime.now(UTC).isoformat(),
        "summary": {
            "unbalanced_transactions": len(unbalanced_transactions),
            "currency_mismatches": len(currency_mismatches),
            "invalid_holds": len(invalid_holds),
            "negative_available_balances": len(negative_available_balances),
            "webhook_state_anomalies": len(webhook_state_anomalies),
            "dlq_state_anomalies": len(dlq_state_anomalies),
        },
        "details": {
            "unbalanced_transactions": unbalanced_transactions,
            "currency_mismatches": currency_mismatches,
            "invalid_holds": invalid_holds,
            "negative_available_balances": negative_available_balances,
            "webhook_state_anomalies": webhook_state_anomalies,
            "dlq_state_anomalies": dlq_state_anomalies,
        },
    }

    reconcile_run.report_json = report
    session.commit()

    mark_reconcile_run()
    refresh_runtime_gauges(session)
    return report


def latest_reconciliation(session: Session) -> dict | None:
    run = session.execute(select(ReconcileRun).order_by(ReconcileRun.ran_at.desc())).scalars().first()
    if run is None:
        return None
    return run.report_json


def dashboard_stats(session: Session) -> dict:
    sync_derived_counters(session)
    refresh_runtime_gauges(session)
    latest = session.execute(select(ReconcileRun).order_by(ReconcileRun.ran_at.desc())).scalars().first()
    latest_ran_at = latest.ran_at.isoformat() if latest and latest.ran_at else None

    snapshot = metrics_snapshot()
    return {
        "dlq_size": int(snapshot["dlq_size"]),
        "processed_webhooks": int(snapshot["webhooks_processed_total"]),
        "deduped_webhooks": int(snapshot["webhooks_deduped_total"]),
        "active_holds": int(snapshot["active_holds"]),
        "idempotency_replays": int(snapshot["idempotency_replays_total"]),
        "last_reconcile_at": latest_ran_at,
        "reconcile_runs_total": int(snapshot["reconcile_runs_total"]),
    }

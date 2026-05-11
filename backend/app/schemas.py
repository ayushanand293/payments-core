from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CurrencyOut(BaseModel):
    code: str
    minor_unit: int


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    currency_code: str = Field(min_length=3, max_length=3)
    type: str


class TransferCreate(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    amount_minor: int = Field(gt=0)
    description: str | None = None


class DemoFundCreate(BaseModel):
    account_id: UUID
    amount: int = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)


class LedgerEntryOut(BaseModel):
    id: UUID
    tx_id: UUID
    account_id: UUID
    currency_code: str
    direction: str
    amount_minor: int
    created_at: datetime | None = None


class TransactionOut(BaseModel):
    id: UUID
    type: str
    status: str
    currency_code: str
    idempotency_key: str
    description: str | None = None
    created_at: datetime | None = None
    balanced: bool | None = None


class TransactionDetailOut(TransactionOut):
    total_debit_minor: int | None = None
    total_credit_minor: int | None = None
    ledger_entries: list[LedgerEntryOut]


class AccountOut(BaseModel):
    id: UUID
    name: str
    currency_code: str
    type: str
    created_at: datetime | None = None
    posted_balance_minor: int
    held_balance_minor: int
    available_balance_minor: int


class AccountCreateResponse(AccountOut):
    pass


class AccountDetailOut(AccountOut):
    pass


class AccountStatementOut(BaseModel):
    account: AccountOut
    ledger_entries: list[LedgerEntryOut]


class HoldAuthorizeCreate(BaseModel):
    account_id: UUID
    currency_code: str = Field(min_length=3, max_length=3)
    amount_minor: int = Field(gt=0)
    ttl_seconds: int | None = Field(default=None, gt=0)


class HoldCaptureCreate(BaseModel):
    currency_code: str = Field(min_length=3, max_length=3)


class HoldReleaseCreate(BaseModel):
    currency_code: str = Field(min_length=3, max_length=3)


class HoldOut(BaseModel):
    id: UUID
    account_id: UUID
    currency_code: str
    amount_minor: int
    status: str
    expires_at: datetime
    captured_tx_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WebhookGatewayIn(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    event_type: str = Field(min_length=1, max_length=50)
    occurred_at: datetime | None = None
    payload: dict


class WebhookGatewayAcceptedOut(BaseModel):
    event_id: str
    status: str
    deduplicated: bool


class WebhookEventOut(BaseModel):
    event_id: str
    event_type: str
    status: str
    attempts: int
    last_error: str | None = None
    occurred_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DlqEventOut(BaseModel):
    event_id: str
    event_type: str
    attempts: int
    last_error: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DemoInjectFailureCreate(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)


class ReconcileSummaryOut(BaseModel):
    unbalanced_transactions: int
    currency_mismatches: int
    invalid_holds: int
    negative_available_balances: int
    webhook_state_anomalies: int
    dlq_state_anomalies: int


class ReconcileDetailsOut(BaseModel):
    unbalanced_transactions: list[dict]
    currency_mismatches: list[dict]
    invalid_holds: list[dict]
    negative_available_balances: list[dict]
    webhook_state_anomalies: list[dict]
    dlq_state_anomalies: list[dict]


class ReconcileReportOut(BaseModel):
    run_id: str
    ran_at: datetime
    summary: ReconcileSummaryOut
    details: ReconcileDetailsOut


class DashboardStatsOut(BaseModel):
    dlq_size: int
    processed_webhooks: int
    deduped_webhooks: int
    active_holds: int
    idempotency_replays: int
    last_reconcile_at: datetime | None = None
    reconcile_runs_total: int


class CapabilitiesOut(BaseModel):
    public_demo: bool
    read_only: bool
    demo_endpoints_enabled: bool
    writes_enabled: bool
    replay_enabled: bool
    reconcile_run_enabled: bool

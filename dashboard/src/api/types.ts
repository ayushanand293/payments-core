export type AccountType = "USER" | "MERCHANT" | "ESCROW";

export type AccountSummary = {
  id: string;
  name: string;
  currency_code: string;
  type: AccountType | string;
  created_at?: string | null;
  posted_balance_minor: number;
  held_balance_minor: number;
  available_balance_minor: number;
};

export type CurrencySummary = {
  code: string;
  minor_unit: number;
};

export type LedgerEntryDirection = "DEBIT" | "CREDIT";

export type LedgerEntry = {
  id: string;
  tx_id: string;
  account_id: string;
  currency_code: string;
  direction: LedgerEntryDirection;
  amount_minor: number;
  created_at: string;
};

export type TransactionSummary = {
  id: string;
  type: string;
  status: string;
  currency_code: string;
  idempotency_key: string;
  description?: string | null;
  created_at: string;
  balanced?: boolean;
};

export type TransactionDetail = TransactionSummary & {
  total_debit_minor?: number;
  total_credit_minor?: number;
  ledger_entries: LedgerEntry[];
};

export type AccountStatement = {
  account: AccountSummary;
  ledger_entries: LedgerEntry[];
};

export type HoldStatus = "AUTHORIZED" | "CAPTURED" | "RELEASED" | "EXPIRED";

export type HoldSummary = {
  id: string;
  account_id: string;
  currency_code: string;
  amount_minor: number;
  status: HoldStatus;
  expires_at: string;
  captured_tx_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WebhookStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "DLQ";

export type WebhookEventSummary = {
  event_id: string;
  event_type: string;
  status: WebhookStatus;
  attempts: number;
  payload_json?: Record<string, unknown>;
  last_error?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DlqEventSummary = {
  event_id: string;
  event_type: string;
  attempts: number;
  last_error: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ReconcileSummary = {
  unbalanced_transactions: number;
  currency_mismatches: number;
  invalid_holds: number;
  negative_available_balances: number;
  webhook_state_anomalies: number;
  dlq_state_anomalies: number;
};

export type ReconcileDetails = {
  unbalanced_transactions: Array<Record<string, unknown>>;
  currency_mismatches: Array<Record<string, unknown>>;
  invalid_holds: Array<Record<string, unknown>>;
  negative_available_balances: Array<Record<string, unknown>>;
  webhook_state_anomalies: Array<Record<string, unknown>>;
  dlq_state_anomalies: Array<Record<string, unknown>>;
};

export type ReconcileReport = {
  run_id: string;
  ran_at: string;
  summary: ReconcileSummary;
  details: ReconcileDetails;
};

export type DemoStats = {
  dlq_size: number;
  processed_webhooks: number;
  deduped_webhooks: number;
  active_holds: number;
  idempotency_replays: number;
  last_reconcile_at?: string | null;
  reconcile_runs_total: number;
};

export type Capabilities = {
  public_demo: boolean;
  read_only: boolean;
  demo_endpoints_enabled: boolean;
  writes_enabled: boolean;
  replay_enabled: boolean;
  reconcile_run_enabled: boolean;
};

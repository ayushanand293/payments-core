const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:18000";
const DEMO_SECRET = import.meta.env.VITE_DEMO_SECRET ?? "change-me";

type TransferPayload = {
  from_account_id: string;
  to_account_id: string;
  currency_code?: string;
  amount_minor: number;
  description?: string;
};

type AccountPayload = {
  name: string;
  currency_code: string;
  type: "USER" | "MERCHANT";
};

type HoldAuthorizePayload = {
  account_id: string;
  currency_code: string;
  amount_minor: number;
  ttl_seconds?: number;
};

type WebhookGatewayPayload = {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  payload: Record<string, unknown>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export type AccountSummary = {
  id: string;
  name: string;
  currency_code: string;
  type: string;
  created_at?: string | null;
  posted_balance_minor: number;
  held_balance_minor: number;
  available_balance_minor: number;
};

export type CurrencySummary = {
  code: string;
  minor_unit: number;
};

export type LedgerEntry = {
  id: string;
  tx_id: string;
  account_id: string;
  currency_code: string;
  direction: "DEBIT" | "CREDIT";
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
  ledger_entries: LedgerEntry[];
};

export type AccountStatement = {
  account: AccountSummary;
  ledger_entries: LedgerEntry[];
};

export type AccountDetail = AccountSummary;

export type HoldSummary = {
  id: string;
  account_id: string;
  currency_code: string;
  amount_minor: number;
  status: "AUTHORIZED" | "CAPTURED" | "RELEASED" | "EXPIRED";
  expires_at: string;
  captured_tx_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WebhookEventSummary = {
  event_id: string;
  event_type: string;
  status: "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "DLQ";
  attempts: number;
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

export async function getAccounts(): Promise<AccountSummary[]> {
  return request<AccountSummary[]>("/accounts");
}

export async function getCurrencies(): Promise<CurrencySummary[]> {
  return request<CurrencySummary[]>("/currencies");
}

export async function getAccount(accountId: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/accounts/${accountId}`);
}

export async function getAccountStatement(accountId: string): Promise<AccountStatement> {
  return request<AccountStatement>(`/accounts/${accountId}/statement?limit=50`);
}

export async function getTransactions(): Promise<TransactionSummary[]> {
  return request<TransactionSummary[]>("/transactions");
}

export async function getTransaction(transactionId: string): Promise<TransactionDetail> {
  return request<TransactionDetail>(`/transactions/${transactionId}`);
}

export async function postTransfer(payload: TransferPayload, idempotencyKey: string): Promise<TransactionDetail> {
  return request<TransactionDetail>("/transfers", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export async function postAccount(payload: AccountPayload): Promise<AccountDetail> {
  return request<AccountDetail>("/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postDemoFund(accountId: string, amount: number, currency: string): Promise<{ id: string }> {
  return request<{ id: string }>("/demo/fund", {
    method: "POST",
    headers: {
      "X-DEMO-SECRET": DEMO_SECRET,
    },
    body: JSON.stringify({
      account_id: accountId,
      amount,
      currency,
    }),
  });
}

export async function getHolds(): Promise<HoldSummary[]> {
  return request<HoldSummary[]>("/holds");
}

export async function postHoldAuthorize(payload: HoldAuthorizePayload, idempotencyKey: string): Promise<{ hold: HoldSummary }> {
  return request<{ hold: HoldSummary }>("/holds/authorize", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export async function postHoldCapture(holdId: string, currencyCode: string, idempotencyKey: string): Promise<{ hold: HoldSummary; transaction_id: string }> {
  return request<{ hold: HoldSummary; transaction_id: string }>(`/holds/${holdId}/capture`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ currency_code: currencyCode }),
  });
}

export async function postHoldRelease(holdId: string, currencyCode: string, idempotencyKey: string): Promise<{ hold: HoldSummary }> {
  return request<{ hold: HoldSummary }>(`/holds/${holdId}/release`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ currency_code: currencyCode }),
  });
}

export async function getWebhookEvents(): Promise<WebhookEventSummary[]> {
  return request<WebhookEventSummary[]>("/webhooks/events");
}

export async function postWebhookGateway(payload: WebhookGatewayPayload): Promise<{ event_id: string; status: string; deduplicated: boolean }> {
  return request<{ event_id: string; status: string; deduplicated: boolean }>("/webhooks/gateway", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postWebhookReplay(eventId: string): Promise<{ event_id: string; status: string; deduplicated: boolean }> {
  return request<{ event_id: string; status: string; deduplicated: boolean }>(`/webhooks/events/${eventId}/replay`, {
    method: "POST",
  });
}

export async function getDlqEvents(): Promise<DlqEventSummary[]> {
  return request<DlqEventSummary[]>("/dlq");
}

export async function postDlqReplay(eventId: string): Promise<{ event_id: string; status: string; deduplicated: boolean }> {
  return request<{ event_id: string; status: string; deduplicated: boolean }>(`/dlq/${eventId}/replay`, {
    method: "POST",
  });
}

export async function postInjectFailure(eventId: string): Promise<{ event_id: string; mode: string }> {
  return request<{ event_id: string; mode: string }>("/demo/inject-failure", {
    method: "POST",
    headers: {
      "X-DEMO-SECRET": DEMO_SECRET,
    },
    body: JSON.stringify({ event_id: eventId }),
  });
}

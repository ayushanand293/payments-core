import { ApiError, parseApiError } from "./errors";
import type {
  AccountStatement,
  AccountSummary,
  CurrencySummary,
  DemoStats,
  DlqEventSummary,
  HoldSummary,
  ReconcileReport,
  TransactionDetail,
  TransactionSummary,
  WebhookEventSummary,
} from "./types";

export type {
  AccountStatement,
  AccountSummary,
  CurrencySummary,
  DemoStats,
  DlqEventSummary,
  HoldSummary,
  ReconcileReport,
  TransactionDetail,
  TransactionSummary,
  WebhookEventSummary,
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:18000";
const DEMO_SECRET = import.meta.env.VITE_DEMO_SECRET;

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

function demoSecretHeaders(): Record<string, string> {
  if (!DEMO_SECRET) {
    throw new ApiError("Demo secret is not configured. Set VITE_DEMO_SECRET for demo actions.", 400, "DEMO_SECRET_MISSING");
  }
  return { "X-DEMO-SECRET": DEMO_SECRET };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as T;
}

export async function getAccounts(): Promise<AccountSummary[]> {
  return request<AccountSummary[]>("/accounts");
}

export async function getCurrencies(): Promise<CurrencySummary[]> {
  return request<CurrencySummary[]>("/currencies");
}

export async function getAccount(accountId: string): Promise<AccountSummary> {
  return request<AccountSummary>(`/accounts/${accountId}`);
}

export async function getAccountStatement(accountId: string, limit = 50): Promise<AccountStatement> {
  return request<AccountStatement>(`/accounts/${accountId}/statement?limit=${limit}`);
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

export async function postAccount(payload: AccountPayload): Promise<AccountSummary> {
  return request<AccountSummary>("/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postDemoFund(accountId: string, amount: number, currency: string): Promise<{ id: string }> {
  return request<{ id: string }>("/demo/fund", {
    method: "POST",
    headers: demoSecretHeaders(),
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
    headers: demoSecretHeaders(),
    body: JSON.stringify({ event_id: eventId }),
  });
}

export async function postDemoReset(): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/demo/reset", {
    method: "POST",
    headers: demoSecretHeaders(),
  });
}

export async function getDemoStats(): Promise<DemoStats> {
  return request<DemoStats>("/demo/stats");
}

export async function postReconcileRun(): Promise<ReconcileReport> {
  return request<ReconcileReport>("/reconcile/run", {
    method: "POST",
  });
}

export async function getReconcileLatest(): Promise<ReconcileReport> {
  return request<ReconcileReport>("/reconcile/latest");
}

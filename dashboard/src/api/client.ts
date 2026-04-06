const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
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

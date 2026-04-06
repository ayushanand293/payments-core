# API

## `GET /currencies`

Used by the dashboard account creation form.

Response:

```json
[
  { "code": "INR", "minor_unit": 2 },
  { "code": "USD", "minor_unit": 2 },
  { "code": "EUR", "minor_unit": 2 }
]
```

## `POST /accounts`

Used by the dashboard Accounts page to create USER and MERCHANT accounts.

Request:

```json
{
  "name": "INR User A",
  "currency_code": "INR",
  "type": "USER"
}
```

Response:

```json
{
  "id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
  "name": "INR User A",
  "currency_code": "INR",
  "type": "USER",
  "created_at": "2026-04-06T12:00:00Z",
  "posted_balance_minor": 0,
  "held_balance_minor": 0,
  "available_balance_minor": 0
}
```

## `GET /accounts`

Used by the dashboard Overview and Accounts pages.

Response:

```json
[
  {
    "id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
    "name": "INR Alice Wallet",
    "currency_code": "INR",
    "type": "USER",
    "created_at": "2026-04-06T12:00:00Z",
    "posted_balance_minor": 500000,
    "held_balance_minor": 0,
    "available_balance_minor": 500000
  }
]
```

## `GET /accounts/{account_id}`

Used by the dashboard account detail route.

## `POST /transfers`

Used by the dashboard Overview page for the sample transfer action.

Request:

```json
{
  "from_account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
  "to_account_id": "f1d7f2f2-9d4f-4d8a-9e1a-6c0c6e3d0a2d",
  "currency_code": "INR",
  "amount_minor": 1250,
  "description": "Lunch payment"
}
```

Headers:

```http
Idempotency-Key: transfer-demo-001
```

Rules:

- If `currency_code` is omitted, it is inferred from the source and destination accounts.
- Same-key reuse with the same scope and request hash replays the original response.
- Same-key reuse with a different payload or scope returns `409` with `IDEMPOTENCY_KEY_REUSED`.
- Insufficient funds returns `409` with `INSUFFICIENT_FUNDS`.

## `POST /demo/fund`

Used by the dashboard account detail page to fund demo accounts before holds/capture flows.

Headers:

```http
X-DEMO-SECRET: change-me
```

Request:

```json
{
  "account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
  "amount": 2500,
  "currency": "INR"
}
```

Behavior:

- Creates a `DEPOSIT` transaction.
- Ledger entries are double-entry and balanced:
  - `DEBIT` currency-specific mint source account.
  - `CREDIT` target account.

Response:

```json
{
  "id": "c3d4f1b4-4f08-4d9a-9f7f-6b2c2dd1ed1a",
  "type": "TRANSFER",
  "status": "POSTED",
  "currency_code": "INR",
  "idempotency_key": "transfer-demo-001",
  "description": "Lunch payment",
  "created_at": "2026-04-06T12:00:00Z",
  "ledger_entries": [
    {
      "account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
      "direction": "DEBIT",
      "amount_minor": 1250,
      "currency_code": "INR"
    },
    {
      "account_id": "f1d7f2f2-9d4f-4d8a-9e1a-6c0c6e3d0a2d",
      "direction": "CREDIT",
      "amount_minor": 1250,
      "currency_code": "INR"
    }
  ]
}
```

## `GET /accounts`

Used by the dashboard Overview and Accounts pages.

Response:

```json
[
  {
    "id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
    "name": "INR Alice Wallet",
    "currency_code": "INR",
    "type": "USER",
    "posted_balance_minor": 500000,
    "held_balance_minor": 0,
    "available_balance_minor": 500000
  }
]
```

## `GET /accounts/{account_id}/statement`

Used by the dashboard Accounts page when an account row is selected.

Query params:

- `limit` defaults to `50`

Response:

```json
{
  "account": {
    "id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
    "name": "INR Alice Wallet",
    "currency_code": "INR",
    "type": "USER",
    "posted_balance_minor": 498750,
    "held_balance_minor": 0,
    "available_balance_minor": 498750
  },
  "ledger_entries": []
}
```

## `GET /transactions`

Used by the dashboard Overview and Transactions pages.

Response:

```json
[
  {
    "id": "c3d4f1b4-4f08-4d9a-9f7f-6b2c2dd1ed1a",
    "type": "TRANSFER",
    "status": "POSTED",
    "currency_code": "INR",
    "idempotency_key": "transfer-demo-001",
    "description": "Lunch payment",
    "created_at": "2026-04-06T12:00:00Z",
    "balanced": true
  }
]
```

## `GET /transactions/{transaction_id}`

Used by the dashboard Transactions page when a row is selected.

## `GET /metrics`

Prometheus-format metrics for scraping and local inspection.

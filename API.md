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

## `GET /holds`

Used by the dashboard Holds page.

Response:

```json
[
  {
    "id": "a6c1a22f-c3a8-4e56-81a9-09fe51c529c8",
    "account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
    "currency_code": "INR",
    "amount_minor": 1250,
    "status": "AUTHORIZED",
    "expires_at": "2026-04-06T12:15:00",
    "captured_tx_id": null,
    "created_at": "2026-04-06T12:00:00",
    "updated_at": "2026-04-06T12:00:00"
  }
]
```

## `POST /holds/authorize`

Headers:

```http
Idempotency-Key: hold-authorize-001
```

Request:

```json
{
  "account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
  "currency_code": "INR",
  "amount_minor": 1250,
  "ttl_seconds": 900
}
```

Behavior:

- Creates `AUTHORIZED` hold if available balance is sufficient.
- Reduces available balance, but does not create ledger entries.
- Default `ttl_seconds` is 900 when omitted.

## `POST /holds/{hold_id}/capture`

Headers:

```http
Idempotency-Key: hold-capture-001
```

Request:

```json
{
  "currency_code": "INR"
}
```

Behavior:

- Requires hold in `AUTHORIZED` state and not expired.
- Creates `HOLD_CAPTURE` transaction.
- Ledger entries:
  - `DEBIT` user account
  - `CREDIT` escrow account for the same currency
- Marks hold `CAPTURED` and sets `captured_tx_id`.

## `POST /holds/{hold_id}/release`

Headers:

```http
Idempotency-Key: hold-release-001
```

Request:

```json
{
  "currency_code": "INR"
}
```

Behavior:

- Requires hold in `AUTHORIZED` state and not expired.
- Marks hold `RELEASED`.
- No ledger entries are created.

## Hold Error Codes

- `HOLD_NOT_FOUND` (404)
- `HOLD_EXPIRED` (409)
- `INVALID_HOLD_STATE` (409)
- `CURRENCY_MISMATCH` (409)
- `IDEMPOTENCY_KEY_REUSED` (409)

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

## `POST /webhooks/gateway`

Gateway ingress endpoint for asynchronous webhook processing.

Request:

```json
{
  "event_id": "evt-123",
  "event_type": "demo.fund",
  "occurred_at": "2026-04-06T12:00:00Z",
  "payload": {
    "account_id": "8f4f4c2f-58c4-4f8e-89a8-3efc3a0f9f0a",
    "currency_code": "INR",
    "amount_minor": 700
  }
}
```

Response (`202`):

```json
{
  "event_id": "evt-123",
  "status": "RECEIVED",
  "deduplicated": false
}
```

Behavior:

- Deduplicates by `event_id` + payload hash.
- Same `event_id` with different payload returns `409` (`WEBHOOK_EVENT_ID_REUSED`).
- New events are queued for worker processing.

## `GET /webhooks/events`

Returns webhook processing state.

Response item fields:

- `event_id`, `event_type`
- `status`: `RECEIVED | PROCESSING | PROCESSED | FAILED | DLQ`
- `attempts`, `last_error`, `occurred_at`, `created_at`, `updated_at`

## `POST /webhooks/events/{event_id}/replay`

Replays a failed webhook event.

Response (`202`):

```json
{
  "event_id": "evt-123",
  "status": "RECEIVED",
  "deduplicated": false
}
```

Behavior:

- Allowed only when status is `FAILED` or `DLQ`.
- Resets attempts and requeues processing.

## `GET /dlq`

Returns events that exceeded retry limits.

Response item fields:

- `event_id`, `event_type`, `attempts`, `last_error`, `created_at`, `updated_at`

## `POST /dlq/{event_id}/replay`

Replays an event from dead-letter queue.

Response (`202`) mirrors `/webhooks/events/{event_id}/replay`.

## `POST /demo/inject-failure`

Injects a one-time worker failure for a specific webhook event.

Headers:

```http
X-DEMO-SECRET: change-me
```

Request:

```json
{
  "event_id": "evt-123"
}
```

Response:

```json
{
  "event_id": "evt-123",
  "mode": "fail-once"
}
```

## `POST /demo/reset`

Resets local demo data and reseeds currencies, accounts, escrow mapping, and opening balances.

Headers:

```http
X-DEMO-SECRET: change-me
```

Response:

```json
{
  "status": "ok",
  "message": "Demo data reset complete"
}
```

## Week 3 Retry Policy

- Max attempts: `5`
- Backoff schedule (seconds): `1, 2, 4, 8, 16`
- On final failure: status moves to `DLQ` and a `dlq_events` row is created.

## `POST /reconcile/run`

Runs reconciliation checks, stores a row in `reconcile_runs`, and returns the full report.

Response shape:

```json
{
  "run_id": "2f8f79be-9962-4a9b-b7a1-4ef5429c6dd1",
  "ran_at": "2026-04-09T12:00:00Z",
  "summary": {
    "unbalanced_transactions": 0,
    "currency_mismatches": 0,
    "invalid_holds": 0,
    "negative_available_balances": 0,
    "webhook_state_anomalies": 0,
    "dlq_state_anomalies": 0
  },
  "details": {
    "unbalanced_transactions": [],
    "currency_mismatches": [],
    "invalid_holds": [],
    "negative_available_balances": [],
    "webhook_state_anomalies": [],
    "dlq_state_anomalies": []
  }
}
```

Checks include:

- ledger balancing and transaction-entry currency consistency
- hold state validity
- negative available balances
- webhook/DLQ state consistency anomalies

## `GET /reconcile/latest`

Returns the latest persisted reconciliation report.

- `404` if no run exists yet

## `GET /demo/stats`

Returns dashboard KPI values for the control center.

Response:

```json
{
  "dlq_size": 1,
  "processed_webhooks": 3,
  "deduped_webhooks": 1,
  "active_holds": 0,
  "idempotency_replays": 2,
  "last_reconcile_at": "2026-04-09T12:00:00Z",
  "reconcile_runs_total": 1
}
```

## Metrics

`GET /metrics` exposes Prometheus metrics, including:

- `payments_core_webhooks_received_total`
- `payments_core_webhooks_deduped_total`
- `payments_core_webhooks_processed_total`
- `payments_core_webhooks_failed_total`
- `payments_core_dlq_replays_total`
- `payments_core_idempotency_replays_total`
- `payments_core_reconcile_runs_total`
- `payments_core_dlq_size`
- `payments_core_active_holds`
- `payments_core_webhooks_processing`

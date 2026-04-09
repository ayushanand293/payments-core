# payments-core

Mini Stripe/Razorpay-style payments backend demo.

## Week 1-3

This milestone ships:

- Postgres, Redis, backend, worker, and dashboard in Docker Compose
- Currency, account, escrow, transaction, ledger, and idempotency schema
- Idempotent transfer API with immutable double-entry ledger postings
- Currency, account, statement, and transaction read APIs for the demo dashboard
- Account creation for USER and MERCHANT accounts
- Seeded demo data for INR, USD, and EUR
- Tests for ledger balance and idempotency replay
- Hold authorize/capture/release lifecycle with escrow movement
- Webhook ingestion pipeline with dedupe and asynchronous worker processing
- Exponential retry with dead-letter queue (`1, 2, 4, 8, 16` seconds; max 5 attempts)
- Replay APIs for failed and DLQ events
- Failure-injection endpoint for reliability demos
- Dashboard pages for holds, webhooks, and DLQ operations

## Run locally

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Start the stack with `make up`.
3. Open the dashboard at `http://localhost:5174` and the API at `http://localhost:18000`.

## Week 3.5 local ops

### Fresh start (recommended for demos)

1. Run `make reset-db`.
2. Verify API health: `curl -s http://localhost:18000/health`.
3. Optionally reseed on demand: `make seed`.

### Existing DB path

1. Start services: `make up`.
2. Apply migrations explicitly: `make migrate`.
3. Verify API health: `curl -s http://localhost:18000/health`.

### Helper commands

- `make up` starts all services in detached mode.
- `make migrate` runs `alembic upgrade head` in backend container.
- `make reset-db` drops Postgres volume, then rebuilds and restarts the stack.
- `make seed` calls `POST /demo/reset` with demo secret.
- `make smoke` runs `scripts/smoke_demo.sh` for an end-to-end verification.

Backend startup now waits for Postgres, then runs `alembic upgrade head`, then starts FastAPI.

## Week 3 quick checks

1. Open the dashboard Webhooks page and send a `demo.fund` webhook.
2. Confirm event transitions to `PROCESSED` in the Webhooks table.
3. Inject fail-once for an event and replay it to observe retry behavior.
4. Use the DLQ page to replay events that reached max retries.

## Key docs

- [Architecture](ARCHITECTURE.md)
- [API](API.md)
- [Demo script](DEMO_SCRIPT.md)

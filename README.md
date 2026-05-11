# payments-core

payments-core is a ledger-first payments platform demo that models core PSP behaviors with strong correctness guarantees:

- immutable double-entry ledger posting
- idempotent write APIs
- async webhook processing with retries and DLQ
- reconciliation for operational safety
- metrics and a control-plane dashboard for demo and debugging

The project is designed to feel like a compact internal fintech operations system rather than a toy CRUD app.

## What You Get

### Core payment primitives

- Multi-currency account model (USER, MERCHANT, ESCROW)
- Double-entry transactions (`DEPOSIT`, `TRANSFER`, `HOLD_CAPTURE`)
- Balance derivation from ledger state (`posted`, `held`, `available`)
- Idempotency keys for write safety and replay consistency

### Funds reservation lifecycle

- Hold authorize/capture/release flow
- Escrow movements tied to hold capture
- State invariants checked by reconciliation

### Reliability pipeline

- Webhook ingest endpoint with deduplication
- Asynchronous worker processing via Celery + Redis
- Exponential backoff retries: `1, 2, 4, 8, 16` seconds
- Dead-letter queue after max retries
- Replay endpoints for failed/DLQ events
- Failure injection for deterministic reliability demos

### Reconciliation + observability

- On-demand reconciliation run endpoint
- Persisted reconciliation history in `reconcile_runs`
- Anomaly detection for ledger/holds/webhooks/DLQ consistency
- Prometheus metrics endpoint (`/metrics`)
- Dashboard control center with live operational KPIs

### Frontend ops console

- React + Vite + TypeScript dashboard
- Unified component system (cards, tables, badges, modals, notices)
- Polling for async-sensitive pages (visibility-aware)
- Page set: Overview, Accounts, Account Detail, Transactions, Holds, Webhooks, DLQ, Reconciliation

## Architecture

Run-time services are composed via Docker:

- `backend`: FastAPI API server
- `worker`: Celery worker for async webhook processing
- `postgres`: relational storage
- `redis`: queue/broker for async jobs
- `dashboard`: React SPA

High-level flow:

1. API write request comes in with idempotency key.
2. Backend posts ledger entries atomically.
3. Webhook events are ingested and queued.
4. Worker processes events with retry + DLQ policy.
5. Reconciliation validates consistency and stores report.
6. Metrics and dashboard expose operational state.

See [ARCHITECTURE.md](ARCHITECTURE.md) for additional context.

## Quick Start (Docker)

### Prerequisites

- Docker + Docker Compose

### Start the stack

1. Optional: copy `.env.example` to `.env` and adjust values.
2. Run:

```bash
make up
```

3. Open:

- Dashboard: `http://localhost:5174`
- API: `http://localhost:18000`
- Health: `http://localhost:18000/health`

### Common commands

- `make up` start all services in detached mode
- `make down` stop services
- `make migrate` apply Alembic migrations in backend container
- `make reset-db` drop Postgres volume and rebuild stack
- `make seed` call demo reset endpoint
- `make test` run backend tests
- `make build-dashboard` build the dashboard
- `make ci` run backend tests and dashboard build
- `make smoke` run full end-to-end smoke verification

## Key API Areas

### Accounts and balances

- `GET /accounts`
- `POST /accounts`
- `GET /accounts/{id}`
- `GET /accounts/{id}/statement`

### Transactions and transfers

- `POST /transfers` (idempotent)
- `GET /transactions`
- `GET /transactions/{id}`

### Holds

- `POST /holds/authorize`
- `POST /holds/{id}/capture`
- `POST /holds/{id}/release`
- `GET /holds`

### Webhooks and DLQ

- `POST /webhooks/gateway`
- `GET /webhooks/events`
- `POST /webhooks/events/{event_id}/replay`
- `GET /dlq`
- `POST /dlq/{event_id}/replay`
- `POST /demo/inject-failure`

### Reconciliation and ops

- `POST /reconcile/run`
- `GET /reconcile/latest`
- `GET /demo/stats`
- `GET /metrics`

See [API.md](API.md) for full contracts and examples.

## Reconciliation Scope

Each reconciliation run checks:

- debit/credit balance per transaction
- transaction currency vs ledger entry currency
- hold state integrity
- negative available balances for non-system accounts
- webhook state anomalies (including stale processing)
- webhook/DLQ cross-state anomalies

Runs are persisted and latest report is queryable.

## Metrics

Prometheus metrics include webhook lifecycle, DLQ activity, idempotency replay counts, reconciliation runs, and runtime gauges such as active holds and processing webhook count.

Primary scrape endpoint:

- `GET /metrics`

## Demo and Validation

For a scripted walkthrough and expected outputs:

- [DEMO_SCRIPT.md](DEMO_SCRIPT.md)

For an automated confidence check:

```bash
make smoke
```

Smoke covers reset, transfers, holds, webhooks, DLQ, reconciliation, and metrics validation.

## Configuration

Important env vars (see `.env.example`):

- `PAYMENTS_BACKEND_PORT`
- `PAYMENTS_DASHBOARD_PORT`
- `PAYMENTS_POSTGRES_PORT`
- `PAYMENTS_REDIS_PORT`
- `PAYMENTS_DEMO_SECRET` (used by backend/worker/dashboard in compose)
- `DEMO_ENDPOINTS_ENABLED` (only needed to opt production into `/demo/*` endpoints)
- `ENQUEUE_WEBHOOKS` (set `false` for isolated backend tests that drain webhooks manually)

Demo secret notes:

- Local demo: a shared secret is fine.
- Public deployment: `/demo/*` endpoints are disabled when `APP_ENV=production` unless `DEMO_ENDPOINTS_ENABLED=true`.
- Do not rely on browser-exposed shared demo secrets for public admin controls.
- Prefer server-side auth/authorization for privileged demo/admin actions.

## Repository Layout

- `backend/` FastAPI app, services, models, migrations, tests
- `dashboard/` React TypeScript UI
- `infra/` Docker Compose topology
- `scripts/` smoke and helper scripts
- `API.md` endpoint-level documentation
- `ARCHITECTURE.md` architecture overview
- `DEMO_SCRIPT.md` demo runbook

## Quality and Testing

- Backend tests under `backend/tests/`
- Reconciliation-specific tests included
- Local backend suite: `.venv/bin/pytest`
- Dashboard build checked with `npm run build`
- Full-stack smoke path available via `make smoke`

## License

This project is released under the terms in [LICENSE](LICENSE).

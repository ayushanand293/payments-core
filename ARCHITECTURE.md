# Architecture

payments-core is a compact fintech operations system built around a ledger-first payments core. The repository is a monorepo with a FastAPI backend, a Celery worker pipeline, Postgres/Redis infrastructure, and a React control-plane dashboard.

## Runtime Topology

The Docker stack runs five services:

- `backend`: FastAPI API server for ledger operations, webhooks, reconciliation, metrics, and demo controls.
- `worker`: Celery worker that processes webhook events asynchronously.
- `postgres`: system of record for accounts, ledger entries, idempotency keys, holds, webhook state, DLQ rows, audit events, and reconciliation runs.
- `redis`: Celery broker/result backend and short-lived failure-injection state for local demos.
- `dashboard`: React/Vite single-page operations console.

Startup is Docker-first. Postgres and Redis expose healthchecks, and the backend startup script waits for Postgres, runs `alembic upgrade head`, then starts Uvicorn.

## Backend

The backend is organized into route, service, model, and core layers:

- `backend/app/api/routes/`: HTTP route handlers and response shaping.
- `backend/app/services/`: business workflows for accounts, balances, transfers, holds, webhooks, reconciliation, demo data, and audit events.
- `backend/app/models/`: SQLAlchemy models for persistent state.
- `backend/app/core/`: configuration, database setup, idempotency helpers, metrics, and logging.
- `backend/alembic/`: schema migrations.

Balances are derived from immutable ledger entries rather than stored directly on accounts. Money values are represented in minor units, and each account is scoped to a single currency.

## Dashboard

The dashboard is a React + TypeScript operations console. It talks directly to the backend over HTTP and covers:

- Overview: live KPIs, demo reset, sample transfer, reconciliation trigger.
- Accounts and Account Detail: balances, account creation, statements, demo funding.
- Transactions: transfer creation and transaction detail inspection.
- Holds: authorization, capture, release, and hold state visibility.
- Webhooks: gateway ingest, replay, and failure injection.
- DLQ: failed-event visibility and replay.
- Reconciliation: latest and on-demand reconciliation reports.

The dashboard is intentionally a local/demo control plane. Privileged demo actions use `X-DEMO-SECRET` and should not be treated as production admin authentication.

## Core Flows

### Transfers and Idempotency

Write APIs such as `POST /transfers` require an `Idempotency-Key` header. The backend stores the key, scope, request hash, status code, and response payload.

On repeat requests:

- Same key, same scope, same request hash: the original response is replayed without posting a duplicate transaction.
- Same key with a different payload or scope: the request is rejected with an idempotency conflict.

Successful transfers create a posted transaction with balanced debit and credit ledger entries in the same currency.

### Holds and Escrow

Holds reserve available funds without immediately posting ledger entries:

1. `POST /holds/authorize` checks available balance and creates an `AUTHORIZED` hold.
2. Authorized holds reduce available balance through balance derivation.
3. `POST /holds/{id}/capture` posts a `HOLD_CAPTURE` transaction that debits the user account and credits the currency-specific escrow account.
4. `POST /holds/{id}/release` marks the hold `RELEASED` without ledger movement.
5. Expired authorized holds are treated as invalid for capture/release and are flagged by reconciliation.

Escrow is currency-specific, so captured funds never cross currency boundaries.

### Webhooks, DLQ, and Replay

`POST /webhooks/gateway` persists inbound webhook events before worker processing. Events are deduplicated by `event_id` and payload hash:

- Same `event_id` and same payload: accepted as a dedupe replay.
- Same `event_id` and different payload: rejected as an event-id reuse conflict.

New events are queued to Celery. The worker processes `demo.fund` events by posting a deterministic mint-to-account deposit using webhook-scoped idempotency.

Failures are retried with exponential backoff: `1, 2, 4, 8, 16` seconds. After the max attempt count, the event moves to `DLQ` and a `dlq_events` row is written. Replay endpoints reset failed/DLQ events to `RECEIVED`, remove the DLQ row when present, and requeue processing.

### Reconciliation

`POST /reconcile/run` executes consistency checks and persists each run in `reconcile_runs`. `GET /reconcile/latest` returns the latest persisted report.

The reconciliation engine checks:

- unbalanced transactions
- transaction currency vs ledger-entry currency mismatches
- invalid hold state, including expired authorized holds
- negative available balances for non-system accounts
- stale or inconsistent webhook state
- webhook/DLQ cross-state anomalies

Clean demo state should report zero anomalies across all summary buckets.

### Metrics and Multi-Process Runtime

`GET /metrics` exposes Prometheus-format metrics for local inspection and scraping.

The API process and worker process are separate. Worker-side events such as processed webhooks, failed attempts, and reconciliation runs are therefore treated as DB-derived counters where needed. The metrics endpoint syncs derived counter deltas from persisted database state before rendering Prometheus output, so counters remain meaningful in the Docker multi-process deployment.

Runtime gauges such as active holds, DLQ size, and processing webhook count are refreshed from database state.

## Demo Mode vs Production Mode

The local demo intentionally includes privileged controls for reset, funding, and failure injection. These are useful for interviews and smoke tests, but they are not a production admin model.

Important environment variables:

- `APP_ENV`: runtime environment. Use `production` for deployed production-like environments.
- `DEMO_SECRET`: shared secret required by privileged demo endpoints.
- `DEMO_ENDPOINTS_ENABLED`: defaults to `false`; when `APP_ENV=production`, `/demo/*` endpoints return `404` unless this is explicitly `true`.
- `AUTO_SEED`: seeds demo currencies/accounts on startup when enabled.
- `ENQUEUE_WEBHOOKS`: controls whether API routes enqueue webhook work; tests can disable this and drain processing directly.
- `DATABASE_URL`: SQLAlchemy database URL.
- `REDIS_URL`: Celery broker/result backend URL.
- `CORS_ORIGINS`: allowed dashboard origins.

In local Docker compose, demo controls are enabled by development mode and shared with the dashboard through `VITE_DEMO_SECRET`. In public deployments, replace this with server-side authentication/authorization before exposing control-plane actions.

## Operational Entry Points

Common local commands:

- `make up`: build and start the Docker stack.
- `make migrate`: run Alembic migrations in the backend container.
- `make reset-db`: recreate the stack with a fresh Postgres volume.
- `make seed`: reset demo data through the API.
- `make test`: run backend pytest suite.
- `make build-dashboard`: build the dashboard.
- `make ci`: run backend tests and dashboard build.
- `make smoke`: run the full end-to-end smoke demo against a running API.
- `make down`: stop the stack.

## Design Principles

- The ledger is the source of truth for balances.
- Idempotency is part of write semantics, not just a client convention.
- Async webhook state is persisted before worker execution.
- Operational recovery paths, including DLQ replay and reconciliation history, are first-class product surfaces.
- Demo controls are isolated from production posture by environment mode.

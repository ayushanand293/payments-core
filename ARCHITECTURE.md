# Architecture

## Week 1 scope

The repository is a small monorepo with a FastAPI backend and a Vite dashboard.

### Backend

- FastAPI serves the API and metrics endpoint.
- SQLAlchemy models define currencies, accounts, escrow accounts, idempotency keys, transactions, and immutable ledger entries.
- Alembic owns schema migrations.
- Seed data creates INR, USD, and EUR demo accounts so the UI has live data immediately.

### Dashboard

- The dashboard is a single-page React app with three views: Overview, Accounts, and Transactions.
- It talks directly to the backend over HTTP.
- Week 1 focuses on ledger visibility and retry-safe transfer execution, not authentication or admin workflows.

## Design choices

- Balances are derived from ledger entries instead of stored on accounts.
- Transfer requests require an `Idempotency-Key` header.
- The dashboard uses minor units to avoid floating point money math.

# payments-core

Mini Stripe/Razorpay-style payments backend demo.

## Week 1

This milestone ships:

- Postgres, Redis, backend, worker, and dashboard in Docker Compose
- Currency, account, escrow, transaction, ledger, and idempotency schema
- Idempotent transfer API with immutable double-entry ledger postings
- Currency, account, statement, and transaction read APIs for the demo dashboard
- Account creation for USER and MERCHANT accounts
- Seeded demo data for INR, USD, and EUR
- Tests for ledger balance and idempotency replay

## Run locally

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Start the stack with `docker compose -f infra/docker-compose.yml up --build`.
3. Open the dashboard at `http://localhost:5173` and the API at `http://localhost:8000`.

## Key docs

- [Architecture](ARCHITECTURE.md)
- [API](API.md)
- [Demo script](DEMO_SCRIPT.md)

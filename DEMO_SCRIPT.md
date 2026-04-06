# Demo script

## Start

1. Run `docker compose -f infra/docker-compose.yml up --build`.
2. Wait for the backend and dashboard to become ready.
3. Open `http://localhost:5173`.

## Show the ledger-first model

1. Open the Accounts page.
2. Select an account and inspect the statement.
3. Open the Transactions page and verify the `Balanced` badge.

## Show idempotency

1. Use the Overview page sample transfer action twice.
2. The second call should replay the original response instead of creating a duplicate transfer.

## Show account creation

1. Open the Accounts page.
2. Create `INR User A` and `INR User B` from the form.
3. Open the account detail route for either account and inspect the statement.

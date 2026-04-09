# Demo script

## Start

1. Run `docker compose -f infra/docker-compose.yml up --build`.
2. Wait for the backend and dashboard to become ready.
3. Open `http://localhost:5174`.

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

## Show holds lifecycle (Week 2)

1. Open the Holds page.
2. Authorize a hold for an INR user account.
3. Capture it and confirm the hold status changes to `CAPTURED`.
4. Open Transactions and verify the capture transaction remains balanced.

## Show webhooks, retries, and DLQ (Week 3)

1. Open the Webhooks page.
2. Send a `demo.fund` webhook and verify it transitions to `PROCESSED`.
3. Click `Inject fail-once` for a webhook event, then replay it.
4. Create a failing webhook payload (for example currency mismatch) to push it to DLQ.
5. Open the DLQ page and replay the DLQ event after correcting payload in admin/testing flow.

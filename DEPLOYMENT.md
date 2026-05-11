# Deployment

This project is designed for a mostly-free hosted setup:

- Frontend: Render Static Site
- Backend: Render Web Service
- Worker: Render Background Worker, optional
- Postgres: Supabase
- Redis: Upstash

## Repo Layout

- Backend root: `backend`
- Dashboard root: `dashboard`
- Backend Dockerfile: `backend/Dockerfile`
- Dashboard Dockerfile: `dashboard/Dockerfile`
- Local Docker Compose: `infra/docker-compose.yml`
- Backend local startup script: `backend/scripts/start_backend.sh`
- Worker command: `celery -A app.workers.celery_app.celery_app worker --loglevel=info --concurrency=1`

## Render Web Service

Recommended Render service type: Web Service with the Python runtime.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `./scripts/start_backend.sh`
- Health check path: `/health`

Required environment variables:

```bash
APP_ENV=production
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/postgres?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
DEMO_ENDPOINTS_ENABLED=false
PUBLIC_DEMO=true
AUTO_SEED=false
AUTO_SEED_ON_EMPTY=true
ENQUEUE_WEBHOOKS=true
DEMO_SECRET=replace-with-random-secret
CORS_ORIGINS=["https://YOUR-STATIC-SITE.onrender.com"]
```

Use the Supabase connection string for `DATABASE_URL`. Keep the `postgresql+psycopg://` driver prefix because the backend installs `psycopg`.

If you do not deploy a worker, the public demo remains usable from seeded data. In that case, set `ENQUEUE_WEBHOOKS=false` to avoid queueing work that will not be processed.

## Render Background Worker

Recommended Render service type: Background Worker with the Python runtime.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `celery -A app.workers.celery_app.celery_app worker --loglevel=info --concurrency=1`

Use the same `DATABASE_URL`, `REDIS_URL`, `APP_ENV`, `PUBLIC_DEMO`, and `DEMO_ENDPOINTS_ENABLED` values as the backend. Set `AUTO_SEED=false` and `AUTO_SEED_ON_EMPTY=false` on the worker so only the web service seeds.

## Render Static Site

- Root directory: `dashboard`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Required environment variables:

```bash
VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com
```

Do not set `VITE_DEMO_SECRET` for the public deployment. The dashboard hides privileged controls when `/capabilities` reports read-only mode.

## Public Demo Mode

Production public demo mode is controlled by backend env vars:

```bash
APP_ENV=production
PUBLIC_DEMO=true
DEMO_ENDPOINTS_ENABLED=false
AUTO_SEED_ON_EMPTY=true
```

`PUBLIC_DEMO=true` blocks mutating endpoints and replay/run controls with `403 PUBLIC_DEMO_READ_ONLY`. `/capabilities` exposes read-only capability flags for the dashboard, and `/stats` exposes dashboard metrics without requiring `/demo/*`.

`AUTO_SEED_ON_EMPTY=true` seeds a production database only if it is empty. The seed includes currencies, escrow mappings, demo accounts, opening ledger entries, a transfer, an active hold, processed/DLQ webhook examples, and one reconciliation report.

## Verify

1. Open `https://YOUR-BACKEND.onrender.com/health` and expect `{"status":"ok"}`.
2. Open `https://YOUR-BACKEND.onrender.com/capabilities` and confirm `read_only` is `true`.
3. Open the Render Static Site and confirm Overview, Accounts, Transactions, Holds, Webhooks, DLQ, and Reconciliation load.
4. Confirm no reset/fund/inject/replay/run-reconcile buttons are visible in the public dashboard.
5. Confirm browser devtools show calls only to the backend URL in `VITE_API_BASE_URL`.

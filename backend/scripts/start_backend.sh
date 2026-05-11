#!/usr/bin/env sh
set -eu

python - <<'PY'
import os, sys, time
import psycopg
from urllib.parse import urlparse

url = os.environ["DATABASE_URL"]
url = url.replace("postgresql+psycopg://", "postgresql://", 1)
timeout_seconds = 90
start = time.time()

p = urlparse(url)
print(f"DB host={p.hostname} port={p.port} db={p.path.lstrip('/')} user={p.username}", flush=True)

while True:
    try:
        with psycopg.connect(url, connect_timeout=3) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
        print("postgres is reachable", flush=True)
        break
    except Exception as exc:
        if time.time() - start >= timeout_seconds:
            print(f"database not reachable after {timeout_seconds}s: {exc}", file=sys.stderr, flush=True)
            sys.exit(1)
        time.sleep(1)
PY

echo "Running alembic current..."
alembic current || true

echo "Running alembic upgrade head..."
alembic upgrade head

echo "Running alembic current after upgrade..."
alembic current

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
#!/usr/bin/env sh
set -eu

python - <<'PY'
import os
import sys
import time

import psycopg

url = os.environ["DATABASE_URL"]
url = url.replace("postgresql+psycopg://", "postgresql://", 1)
url = url.replace("postgresql+psycopg2://", "postgresql://", 1)
timeout_seconds = 90
sleep_seconds = 1
start = time.time()

while True:
    try:
        with psycopg.connect(url, connect_timeout=3) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
        print("postgres is reachable")
        break
    except Exception as exc:  # pragma: no cover - runtime startup guard
        elapsed = time.time() - start
        if elapsed >= timeout_seconds:
            print(f"database not reachable after {timeout_seconds}s: {exc}", file=sys.stderr)
            sys.exit(1)
        time.sleep(sleep_seconds)
PY

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

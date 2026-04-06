from __future__ import annotations

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

HTTP_REQUESTS = Counter("payments_http_requests_total", "HTTP requests processed", ["method", "path", "status"])
IDEMPOTENCY_REPLAYS = Counter("payments_idempotency_replays_total", "Idempotent replay responses", ["scope"])
TRANSACTIONS_CREATED = Counter("payments_transactions_created_total", "Transactions created", ["type"])


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

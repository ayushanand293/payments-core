#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:18000}"
DEMO_SECRET="${DEMO_SECRET:-change-me}"

log() {
  echo "[smoke] $*"
}

json_query() {
  local expr="$1"
  python3 - "$expr" <<'PY'
import json
import sys

expr = sys.argv[1]
data = json.loads(sys.stdin.read())
print(eval(expr, {"__builtins__": {}}, {"data": data}))
PY
}

wait_health() {
  log "Waiting for API health..."
  for _ in $(seq 1 60); do
    if curl -fsS "${API_BASE}/health" >/dev/null; then
      log "API is healthy"
      return 0
    fi
    sleep 1
  done
  log "API health timeout"
  return 1
}

wait_webhook_status() {
  local event_id="$1"
  local target_status="$2"
  local timeout_seconds="${3:-70}"

  local start
  start=$(date +%s)

  while true; do
    local body
    body=$(curl -fsS "${API_BASE}/webhooks/events")
    local current
    current=$(WEBHOOK_JSON="$body" EVENT_ID="$event_id" python3 - <<'PY'
import json
import os

items = json.loads(os.environ["WEBHOOK_JSON"])
event_id = os.environ["EVENT_ID"]
status = ""
for item in items:
    if item["event_id"] == event_id:
        status = item["status"]
        break
print(status)
PY
)

    if [[ "$current" == "$target_status" ]]; then
      log "Event ${event_id} reached status ${target_status}"
      return 0
    fi

    local now
    now=$(date +%s)
    if (( now - start > timeout_seconds )); then
      log "Timeout waiting for ${event_id} -> ${target_status}; current='${current}'"
      return 1
    fi
    sleep 1
  done
}

wait_health

log "Resetting demo data"
curl -fsS -X POST "${API_BASE}/demo/reset" \
  -H "X-DEMO-SECRET: ${DEMO_SECRET}" \
  -H "Content-Type: application/json" >/dev/null

log "Creating source account"
source_account=$(curl -fsS -X POST "${API_BASE}/accounts" \
  -H "Content-Type: application/json" \
  -d '{"name":"INR Smoke User","currency_code":"INR","type":"USER"}')
source_account_id=$(SOURCE_ACCOUNT_JSON="$source_account" python3 - <<'PY'
import json, os
print(json.loads(os.environ["SOURCE_ACCOUNT_JSON"])["id"])
PY
)

log "Creating destination account"
destination_account=$(curl -fsS -X POST "${API_BASE}/accounts" \
  -H "Content-Type: application/json" \
  -d '{"name":"INR Smoke Merchant","currency_code":"INR","type":"MERCHANT"}')
destination_account_id=$(DEST_ACCOUNT_JSON="$destination_account" python3 - <<'PY'
import json, os
print(json.loads(os.environ["DEST_ACCOUNT_JSON"])["id"])
PY
)

log "Funding source account"
curl -fsS -X POST "${API_BASE}/demo/fund" \
  -H "X-DEMO-SECRET: ${DEMO_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"account_id\":\"${source_account_id}\",\"amount\":5000,\"currency\":\"INR\"}" >/dev/null

log "Posting transfer"
curl -fsS -X POST "${API_BASE}/transfers" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-transfer-001" \
  -d "{\"from_account_id\":\"${source_account_id}\",\"to_account_id\":\"${destination_account_id}\",\"currency_code\":\"INR\",\"amount_minor\":700,\"description\":\"Smoke transfer\"}" >/dev/null

log "Authorizing hold"
auth_response=$(curl -fsS -X POST "${API_BASE}/holds/authorize" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-hold-auth-001" \
  -d "{\"account_id\":\"${source_account_id}\",\"currency_code\":\"INR\",\"amount_minor\":300,\"ttl_seconds\":900}")
hold_id=$(AUTH_RESPONSE_JSON="$auth_response" python3 - <<'PY'
import json, os
print(json.loads(os.environ["AUTH_RESPONSE_JSON"])["hold"]["id"])
PY
)

log "Capturing hold"
curl -fsS -X POST "${API_BASE}/holds/${hold_id}/capture" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-hold-capture-001" \
  -d '{"currency_code":"INR"}' >/dev/null

success_event="evt-smoke-success-$(date +%s)"
log "Posting success webhook ${success_event}"
curl -fsS -X POST "${API_BASE}/webhooks/gateway" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"${success_event}\",\"event_type\":\"demo.fund\",\"occurred_at\":\"2026-04-09T00:00:00Z\",\"payload\":{\"account_id\":\"${source_account_id}\",\"currency_code\":\"INR\",\"amount_minor\":250}}" >/dev/null
wait_webhook_status "${success_event}" "PROCESSED" 30

failure_event="evt-smoke-fail-$(date +%s)"
log "Posting failure webhook ${failure_event}"
curl -fsS -X POST "${API_BASE}/webhooks/gateway" \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"${failure_event}\",\"event_type\":\"demo.fund\",\"occurred_at\":\"2026-04-09T00:00:00Z\",\"payload\":{\"account_id\":\"${source_account_id}\",\"currency_code\":\"USD\",\"amount_minor\":100}}" >/dev/null
wait_webhook_status "${failure_event}" "DLQ" 80

log "Replaying failure webhook ${failure_event} from DLQ"
curl -fsS -X POST "${API_BASE}/dlq/${failure_event}/replay" >/dev/null
wait_webhook_status "${failure_event}" "DLQ" 80

log "Running reconciliation"
reconcile_report=$(curl -fsS -X POST "${API_BASE}/reconcile/run")
REPORT_JSON="$reconcile_report" python3 - <<'PY'
import json
import os
import sys

report = json.loads(os.environ["REPORT_JSON"])
summary = report["summary"]
expected_zero = [
  "unbalanced_transactions",
  "currency_mismatches",
  "invalid_holds",
  "negative_available_balances",
  "webhook_state_anomalies",
  "dlq_state_anomalies",
]
non_zero = {key: summary[key] for key in expected_zero if int(summary.get(key, 0)) != 0}
if non_zero:
  print(f"unexpected reconciliation anomalies: {non_zero}", file=sys.stderr)
  sys.exit(1)
print("reconciliation summary looks clean")
PY

log "Validating Week 4 metrics"
metrics_text=$(curl -fsS "${API_BASE}/metrics")
METRICS_TEXT="$metrics_text" python3 - <<'PY'
import os
import sys

lines = os.environ["METRICS_TEXT"].splitlines()
values = {}
for line in lines:
  if not line or line.startswith("#"):
    continue
  if " " not in line:
    continue
  name, value = line.split(" ", 1)
  try:
    values[name] = float(value)
  except ValueError:
    pass

required_positive = {
  "payments_core_webhooks_received_total": 2,
  "payments_core_webhooks_processed_total": 1,
  "payments_core_webhooks_failed_total": 1,
  "payments_core_dlq_replays_total": 1,
  "payments_core_reconcile_runs_total": 1,
}

for key, minimum in required_positive.items():
  if values.get(key, 0.0) < minimum:
    print(f"metric {key} expected >= {minimum}, got {values.get(key)}", file=sys.stderr)
    sys.exit(1)

if values.get("payments_core_dlq_size", 0.0) < 1:
  print(f"metric payments_core_dlq_size expected >= 1, got {values.get('payments_core_dlq_size')}", file=sys.stderr)
  sys.exit(1)

print("metrics validation passed")
PY

log "Smoke demo complete"
log "source_account_id=${source_account_id} destination_account_id=${destination_account_id} hold_id=${hold_id}"

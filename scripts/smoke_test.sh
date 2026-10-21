#!/usr/bin/env bash
# Submits one test report through the frontend proxy and checks it appears in the dashboard summary.
set -euo pipefail
FE="${FE_URL:-http://localhost:3200}"
D=$(curl -fsS "$FE/api/v1/master/diseases" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')
L=$(curl -fsS "$FE/api/v1/master/locations" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')
BEFORE=$(curl -fsS "$FE/api/v1/dashboard/summary" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["totals"]["cases"])')
curl -fsS -X POST "$FE/api/v1/case-reports" -H 'Content-Type: application/json' \
  -d "{\"disease_id\":$D,\"location_id\":$L,\"report_date\":\"$(date +%F)\",\"cases\":7,\"deaths\":1,\"notes\":\"smoke test\"}"
echo
AFTER=$(curl -fsS "$FE/api/v1/dashboard/summary" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["totals"]["cases"])')
echo "cases before=$BEFORE after=$AFTER"
[ "$AFTER" -eq $((BEFORE + 7)) ] && echo "SMOKE TEST PASS" || { echo "SMOKE TEST FAIL"; exit 1; }

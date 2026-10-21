#!/usr/bin/env bash
# Submits one report through the frontend proxy and checks the main-dashboard API picks it up (cards + map point).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
FE="${FE_URL:-http://localhost:${FRONTEND_HOST_PORT:-3200}}${NEXT_PUBLIC_BASE_PATH:-}"
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
D=$(curl -fsS "$FE/api/v1/master/diseases" | j 'd["data"][0]["id"]')
C=$(curl -fsS "$FE/api/v1/master/countries" | j '[c["id"] for c in d["data"] if c["iso2"]=="ID"][0]')
L=$(curl -fsS "$FE/api/v1/master/locations?country_iso2=ID" | j 'd["data"][0]["id"]')
Q="country=ASEAN&scope=asean11&start_year=$(date +%Y)&start_week=1&end_year=$(date +%Y)&end_week=53"
BEFORE=$(curl -fsS "$FE/api/v1/public-dashboard?$Q" | j 'd["data"]["kpis"]["cases"]')
curl -fsS -X POST "$FE/api/v1/case-reports" -H 'Content-Type: application/json' \
  -d "{\"disease_id\":$D,\"country_id\":\"$C\",\"location_id\":$L,\"report_date\":\"$(date +%F)\",\"cases\":7,\"deaths\":1,\"notes\":\"smoke test\",\"is_reviewed\":true}"; echo
R=$(curl -fsS "$FE/api/v1/public-dashboard?$Q")
AFTER=$(echo "$R" | j 'd["data"]["kpis"]["cases"]')
MAPPED=$(echo "$R" | j 'sum(1 for l in d["data"]["locations"] if l["latitude"] is not None)')
echo "cases before=$BEFORE after=$AFTER map_points=$MAPPED"
[ "$AFTER" -eq $((BEFORE + 7)) ] && [ "$MAPPED" -ge 1 ] && echo "SMOKE TEST PASS" || { echo "SMOKE TEST FAIL"; exit 1; }

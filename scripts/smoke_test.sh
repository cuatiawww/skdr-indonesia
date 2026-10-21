#!/usr/bin/env bash
# Submits one report (Provinsi + Kab/Kota) through the frontend proxy and checks the main-dashboard API picks it up
# (cards + map point), including the province and kab/kota filters.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
FE="${FE_URL:-http://localhost:${FRONTEND_HOST_PORT:-3200}}${NEXT_PUBLIC_BASE_PATH:-}"
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
NDIS=$(curl -fsS "$FE/api/v1/master/diseases" | j 'len(d["data"])')
NPROV=$(curl -fsS "$FE/api/v1/master/provinces" | j 'len(d["data"])')
NKAB=$(curl -fsS "$FE/api/v1/master/kabkota" | j 'len(d["data"])')
echo "master: diseases=$NDIS provinces=$NPROV kabkota=$NKAB"
D=$(curl -fsS "$FE/api/v1/master/diseases" | j '[x["id"] for x in d["data"] if x["code"]=="DENGUE"][0]')
P=$(curl -fsS "$FE/api/v1/master/provinces" | j '[x["id"] for x in d["data"] if x["code"]=="31"][0]')
K=$(curl -fsS "$FE/api/v1/master/kabkota?province_id=$P" | j 'd["data"][0]["id"]')
Q="start_year=$(date +%Y)&start_week=1&end_year=$(date +%Y)&end_week=53"
BEFORE=$(curl -fsS "$FE/api/v1/public-dashboard?$Q" | j 'd["data"]["kpis"]["cases"]')
BEFORE_K=$(curl -fsS "$FE/api/v1/public-dashboard?$Q&province_id=$P&kabkota_id=$K" | j 'd["data"]["kpis"]["cases"]')
curl -fsS -X POST "$FE/api/v1/case-reports" -H 'Content-Type: application/json' \
  -d "{\"disease_id\":$D,\"province_id\":$P,\"kabkota_id\":$K,\"report_date\":\"$(date +%F)\",\"cases\":7,\"deaths\":1,\"notes\":\"smoke test\",\"is_reviewed\":true}"; echo
R=$(curl -fsS "$FE/api/v1/public-dashboard?$Q")
AFTER=$(echo "$R" | j 'd["data"]["kpis"]["cases"]')
MAPPED=$(echo "$R" | j 'sum(1 for l in d["data"]["locations"] if l["latitude"] is not None)')
AFTER_K=$(curl -fsS "$FE/api/v1/public-dashboard?$Q&province_id=$P&kabkota_id=$K" | j 'd["data"]["kpis"]["cases"]')
BAD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$FE/api/v1/case-reports" -H 'Content-Type: application/json' \
  -d "{\"disease_id\":$D,\"province_id\":$P,\"report_date\":\"$(date +%F)\",\"cases\":1,\"deaths\":2,\"is_reviewed\":false}")
echo "cases before=$BEFORE after=$AFTER kabkota_before=$BEFORE_K kabkota_after=$AFTER_K map_points=$MAPPED invalid_post_http=$BAD"
[ "$NDIS" -eq 31 ] && [ "$NPROV" -eq 38 ] && [ "$NKAB" -eq 514 ] && [ "$AFTER" -eq $((BEFORE + 7)) ] && [ "$AFTER_K" -eq $((BEFORE_K + 7)) ] \
  && [ "$MAPPED" -ge 1 ] && [ "$BAD" = "400" ] && echo "SMOKE TEST PASS" || { echo "SMOKE TEST FAIL"; exit 1; }

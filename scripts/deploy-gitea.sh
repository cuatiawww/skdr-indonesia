#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR="${SKDR_DEPLOY_DIR:-/home/mcidev/docker/dashboard-skdr}"
ENV_FILE="${SKDR_ENV_FILE:-$DEPLOY_DIR/.env}"
LOCK_FILE="${SKDR_DEPLOY_LOCK:-/run/lock/skdr-dashboard-deploy.lock}"
TARGET_SHA="${DEPLOY_SHA:-${GITHUB_SHA:-}}"
PUBLIC_URL="${SKDR_PUBLIC_URL:-https://skdr.mediaciptainformasi.web.id/skdr}"
API_URL="${SKDR_API_URL:-https://skdr.mediaciptainformasi.web.id/skdr/api/v1/console/settings}"
BACKUP_DIR="${SKDR_BACKUP_DIR:-$DEPLOY_DIR/backups/migrations}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[ -n "$TARGET_SHA" ] || fail 'DEPLOY_SHA/GITHUB_SHA belum tersedia'
[ -d "$DEPLOY_DIR/.git" ] || fail "deployment checkout tidak ditemukan: $DEPLOY_DIR"
[ -f "$ENV_FILE" ] || fail "runtime env tidak ditemukan: $ENV_FILE"
[ "$(stat -c '%a' "$ENV_FILE")" = '600' ] || fail "mode $ENV_FILE harus 600"

# Load only the approved local runtime env. Values are never printed.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${DB_HOST:?DB_HOST belum diisi}"
: "${DB_PORT:?DB_PORT belum diisi}"
: "${DB_USER:?DB_USER belum diisi}"
: "${DB_PASSWORD:?DB_PASSWORD belum diisi}"
: "${DB_NAME:?DB_NAME belum diisi}"

mkdir -p "$(dirname "$LOCK_FILE")" "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || fail 'deployment lain masih berjalan'

cd "$DEPLOY_DIR"
git diff --quiet || fail 'deployment checkout memiliki perubahan tracked yang belum disimpan'
git diff --cached --quiet || fail 'deployment checkout memiliki perubahan staged yang belum disimpan'

previous_sha="$(git rev-parse HEAD)"
git fetch --prune origin main
git cat-file -e "$TARGET_SHA^{commit}" || fail "commit target tidak tersedia: $TARGET_SHA"

migration_changed=0
if [ "$previous_sha" != "$TARGET_SHA" ]; then
  if git diff --quiet "$previous_sha" "$TARGET_SHA" -- 'database/init/*.sql'; then
    migration_changed=0
  else
    migration_changed=1
  fi
fi

if [ "$migration_changed" = '1' ]; then
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_file="$BACKUP_DIR/skdr_indonesia-before-$timestamp-$TARGET_SHA.sql.gz"
  printf 'Migration berubah; membuat backup database ke %s\n' "$backup_file"
  umask 077
  docker exec -e "PGPASSWORD=${DB_PASSWORD}" postgres \
    pg_dump -h 127.0.0.1 -p 5432 -U "$DB_USER" -d "$DB_NAME" \
    --format=plain --no-owner --no-privileges | gzip -c > "$backup_file"
  gzip -t "$backup_file"
fi

# The tracked deployment configuration is part of the exact commit being deployed.
git checkout main
git reset --hard "$TARGET_SHA"

docker compose config --quiet
docker compose up -d --build --force-recreate

backend_container='skdr-indonesia-backend'
for _ in $(seq 1 60); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend_container" 2>/dev/null || true)"
  [ "$health" = 'healthy' ] && break
  sleep 5
done
health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend_container" 2>/dev/null || true)"
[ "$health" = 'healthy' ] || {
  docker compose ps >&2 || true
  docker compose logs --tail=120 skdr-indonesia-backend >&2 || true
  exit 1
}

for _ in $(seq 1 60); do
  if curl -fsS -k --max-time 10 -o /dev/null "$PUBLIC_URL" && \
     curl -fsS -k --max-time 10 -o /dev/null "$API_URL"; then
    printf 'DEPLOYMENT OK sha=%s\n' "$TARGET_SHA"
    exit 0
  fi
  sleep 5
done

docker compose ps >&2 || true
docker compose logs --tail=160 skdr-indonesia-frontend >&2 || true
fail 'public smoke test gagal'

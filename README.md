# SKDR Indonesia

Case report **Form + Dashboard** (no crawling / scraping / NLP).
Structure mirrors `NLP-PENYAKIT`: `services/frontend-next` (Next.js 15.1.3 + React 19 + Tailwind 3 + Recharts),
`services/backend-rust` (Rust, axum 0.7 + tokio-postgres + deadpool-postgres), `database/init` (SQL migrations),
`docs/PR`, `docs/CHANGE_LOG_MATRIX.md`, `docker-compose.yml`.

## Run (WSL, Docker)
```bash
cd /mnt/c/laragon/www/skdr-indonesia
cp .env.example .env     # then set passwords (never commit .env)
docker compose up -d --build
```
| Service | URL |
|---|---|
| Dashboard (Next.js) | http://localhost:3200 |
| Form | http://localhost:3200/form |
| Backend API (Rust) | http://localhost:8091/health |
| PostgreSQL | 127.0.0.1:5442 (container `skdr-postgres`, volume `skdr_pg_data`) |

Migrations in `database/init/*.sql` are applied automatically by the backend at start-up
(tracked in table `schema_migrations`). Add a new numbered file for every DB change.

## API
- `GET /api/v1/settings` – app name/tagline (table `app_settings`)
- `GET /api/v1/master/diseases`, `GET /api/v1/master/locations`
- `GET /api/v1/case-reports?from=&to=&disease_id=&location_id=&limit=`
- `POST /api/v1/case-reports` `{disease_id, location_id, report_date, cases, deaths, notes}`
- `GET /api/v1/dashboard/summary?from=&to=&disease_id=&location_id=`

Smoke test: `bash scripts/smoke_test.sh`

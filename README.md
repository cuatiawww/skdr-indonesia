# SKDR Indonesia

Case report **Form + Dashboard** (no crawling / scraping / NLP).
Structure mirrors `NLP-PENYAKIT`: `services/frontend-next` (Next.js 15.1.3 + React 19 + Tailwind 3 + Recharts),
`services/backend-rust` (Rust, axum 0.7 + tokio-postgres + deadpool-postgres), `database/init` (SQL migrations),
`docs/PR`, `docs/CHANGE_LOG_MATRIX.md`, `docker-compose.yml`.

## Run (Docker host existing resources)
```bash
cd /home/mcidev/docker/dashboard-skdr
cp .env.example .env     # isi credential database, jangan commit .env
docker compose config
docker compose up -d --build
```

Compose utama tidak membuat PostgreSQL baru. Backend memakai container PostgreSQL existing `postgres` melalui network external `backend`; frontend terhubung ke network external `proxy` untuk reverse proxy nginx.

| Service | Endpoint internal |
|---|---|
| Dashboard (Next.js) | `skdr-indonesia-frontend:3200` |
| Form | `/skdr/form` melalui reverse proxy |
| Backend API (Rust) | `skdr-indonesia-backend:8091/health` |
| PostgreSQL | `postgres:5432`, database `skdr_indonesia` |

`docker-compose-example.yml` adalah contoh stack mandiri lama yang masih membuat PostgreSQL sendiri.

Migrations di `database/init/*.sql` dijalankan otomatis oleh backend saat start-up dan dicatat pada tabel `schema_migrations`. Karena database target sudah existing, review migration terlebih dahulu sebelum menjalankan Compose.

## API
- `GET /api/v1/settings` – app name/tagline (table `app_settings`)
- `GET /api/v1/master/diseases`, `GET /api/v1/master/locations`
- `GET /api/v1/case-reports?from=&to=&disease_id=&location_id=&limit=`
- `POST /api/v1/case-reports` `{disease_id, location_id, report_date, cases, deaths, notes}`
- `GET /api/v1/dashboard/summary?from=&to=&disease_id=&location_id=`

Smoke test: `bash scripts/smoke_test.sh`

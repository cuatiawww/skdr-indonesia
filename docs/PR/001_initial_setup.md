# PR 001 – Initial setup (2026-10-21)

## Goal
New local project for SKDR Indonesia: case report form → Rust API → PostgreSQL → dashboard.

## Stack (same as NLP-PENYAKIT)
- Frontend: Next.js 15.1.3, React 19, Tailwind 3.4, Recharts, lucide-react, sonner. Layout (header, sidebar drawer,
  footer, metric cards, palette #0060A9 / #ED2939, Roboto fonts, header background) copied from NLP frontend-next,
  stripped of auth, console, crawling and NLP features.
- Backend: Rust axum 0.7 + tokio-postgres + deadpool-postgres (same crates as NLP backend-rust).
- DB: PostgreSQL 16 in its own docker container `skdr-postgres` (127.0.0.1:5442), separate from NLP `db-postgres`.

## DB
- `001_schema.sql`: master_diseases, master_locations, case_reports, app_settings.
- `002_seed_master.sql`: 14 diseases, 38 provinces, app settings.
- Rollback: `database/rollback/001_002_rollback.sql`.

## Validation
- Server and form: cases/deaths ≥ 0, deaths ≤ cases, date not in the future, disease/location must exist and be active.

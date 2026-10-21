# CHANGE LOG MATRIX – SKDR Indonesia

| PR | Date | Area | Change | Files | Migration | Tested | Pushed |
|---|---|---|---|---|---|---|---|
| 001 | 2026-10-21 | All | Initial setup: Next.js dashboard (NLP styling), case report form, Rust API, Postgres migrations, docker-compose | services/*, database/init/001-002, docker-compose.yml | 001_schema.sql, 002_seed_master.sql | smoke test form → dashboard | No (local git only) |
| 002 | 2026-10-21 | Frontend+Backend+DB | Pure copy of NLP main-dashboard (header, filter, KPI cards, signals, map + libs), no auth, full-width pages, NLP-shape endpoints fed by form | services/frontend-next/*, services/backend-rust/src/*, database/init/003-006 | 003_dashboard_schema, 004_seed_countries, 005_location_coords, 006_drop_auth | smoke test PASS, tsc OK, pages 200, screenshots | No (local git only) |

# PR 005 — EBS sync from the SKDR Kemenkes API

Date: 2026-10-21 · Git: local only

## Source & secret
- API: `POST https://skdr.surveilans.org/api/ebs`, multipart `tahun`, `limit`, `page`; header `User-Key`. Response `resultEbs.paging{total,page,limit,total_page}`, `resultEbs.data[]`.
- Key taken from Yosua's reference PHP script, written **only** to `.env` as `SKDR_EBS_USER_KEY` (git-ignored). `.env.example` has an empty placeholder. The key is never logged, printed or committed.
- Differences vs the PHP script: TLS verification **on** (system CA roots), **no Cookie header**, parameterized SQL (the PHP built SQL by string concatenation), retries with backoff, page size 1000 instead of 4000.
- Implementation notes: the API matches the header name case-sensitively (`User-Key`), so the client uses HTTP/1.1 with title-case headers; the multipart body is sent with Content-Length.

## Privacy
`nama_pelapor`, `telp_pelapor` and the undocumented field `informasi` (free text that contains patient names) are dropped before storage: not stored as columns and removed from `raw`. `kronologi`/`tindakan`/`saran` are stored but not returned by any endpoint. Verified: 0 rows with those keys in `raw`, 0 such columns, 0 occurrences in dashboard/EBS API responses.

## Database (012_ebs_sync.sql, rollback 012_rollback.sql)
- `ebs_reports` (upsert on `id_ebs`, `raw jsonb`, province/kabkota/disease links, indexes).
- `ebs_diagnosa_alias` (diagnosa lower/trim → master disease; NULL = unmapped, row kept). `match_source`: otomatis (name/English name/code/alias match), seed (013), manual (UI).
- `ebs_sync_log` (trigger jadwal/manual, years, status berjalan/sukses/gagal, pages, rows, retries, error).
- `app_settings.ebs_sync_config`: `{"enabled":true,"api_url":...,"years":["current","previous"],"interval_minutes":180,"page_size":1000,"max_retries":3,"retry_delay_secs":10,"timeout_secs":180}`.
- View `surveillance_reports` = form `case_reports` ∪ EBS (EBS coordinates: API lat/lng, else kab/kota centroid, else province; reviewed = `sts_rumor='Terverifikasi'`; deaths capped at cases).
- Menu: "Sinkronisasi EBS" (/ebs) under SURVEILANS.
- 013_ebs_diagnosa_seed.sql: unambiguous EBS diagnosa → master (suspek/probable/konfirm variants, Tifoid→Tifus, Anthraks, Ebola, AFP→Polio as in 008). Deliberately NOT mapped: GHPR (animal bite ≠ rabies case), syndromes (ISPA, ILI, diare, pneumonia, jaundice, meningitis...), diseases outside the 31 master (mumps, varicella, tetanus, influenza A, JE, kolera, legionellosis...). These can be mapped in the UI.

## Backend
`src/ebs.rs`: scheduler (checks every minute; runs when last run older than interval; interrupted runs marked gagal at startup), single-run guard, endpoints:
`GET /api/v1/admin/ebs/status`, `POST /api/v1/admin/ebs/sync` (202, 409 if running), `GET /api/v1/admin/ebs/diagnosa`, `PUT /api/v1/admin/ebs/diagnosa/:id {disease_id|null}`.
Dashboard endpoints read `surveillance_reports`; new `source=form|ebs` filter; unmapped EBS rows appear under their EBS diagnosa name.

## Frontend
Filter bar: **Sumber** (Semua Sumber / Formulir / EBS (SKDR Kemenkes)). New page `/skdr/ebs`: totals, coverage, config, sync log, "Sinkron sekarang", diagnosa mapping table. All text Bahasa Indonesia.

## Results (2026-10-21)
- Test request (tahun 2026, limit 5): HTTP 200, `paging.total` 43.570, 27 fields per row (the 25 documented + `informasi`, `update_date`).
- First full sync (log #4, manual, years 2026,2025): sukses, 152 pages, 150.781 rows fetched & upserted, 0 retries, ~29 min. Rows: 2026 = 43.570 (tgl_laporan up to 2026-04-09), 2025 = 107.211.
- Earlier failed attempts (#1–#3) are kept in the log: TLS/h2 connection closed, then HTTP 404 due to lower-cased header name; fixed.
- Coverage: province 150.781/150.781 (100%); kab/kota 150.648 (99,9%) — 133 rows unlinked with codes 9301/9302/9303/9401/9431/9671 (Merauke, Boven Digoel, Mappi, Nabire, Mamberamo Tengah, Kota Sorong) not present with that code in the kab/kota master; disease 63.773 (42,3%) after 013, 33 of 61 distinct diagnosa mapped; 87.008 rows unmapped (largest: GHPR 41.802, Diare Akut 12.752, Suspek Mumps, ILI, Suspek Varicella, ISPA, Pnemonia).
- With coordinates from API: 9.889 rows; others use kab/kota centroid.
- Dashboard (2025-W1…2026-W42): Semua 150.786 laporan / 342.657 kasus; Formulir 5 / 35; EBS 150.781 / 342.622. `public-dashboard` ≈1,4 s.

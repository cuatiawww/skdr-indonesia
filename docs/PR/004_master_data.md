# PR 004 — Master Data (Provinsi, Kabupaten/Kota, Penyakit)

Date: 2026-10-21 · Git: local only

## Scope
- Sidebar group **MASTER DATA** → "Master Data" with sub-menus *Data Provinsi* (`/skdr/master/provinsi`), *Data Kabupaten/Kota* (`/skdr/master/kabupaten`), *Data Penyakit* (`/skdr/master/penyakit`). Menu comes from `app_settings.navigation_menu` (migration 011), not hardcoded.
- Look & behaviour copied from NLP-PENYAKIT (read-only) `app/master-countries/page.tsx` and `app/disease-master/page.tsx`; `Modal`, `Pagination`, `SearchInput` copied from NLP `components/` (Pagination "Show / page" texts moved to i18n).
- Each page: table, debounced search, status filter (Semua/Aktif/Nonaktif), server-side pagination (10–100/halaman), add/edit dialog, active/inactive switch with confirmation. **No hard delete.** Kab/kota page also filters by Provinsi and Jenis.
- All text in Bahasa Indonesia (`skdr.master.*` in locales/id.json; en.json fallback). Pages full width.

## API (Rust, `src/master_admin.rs`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/master/{provinces,kabkota,diseases}` | `search`, `status=all|active|inactive`, `page`, `per_page` (≤600); kabkota also `province_id`, `kind` |
| POST | same | create → 201 |
| PUT | `.../:id` | edit → 200 / 404 |
| PATCH | `.../:id/status` `{is_active}` | soft delete / restore |

Validation (Indonesian messages): province code 2 digits; Kemendagri code `NN.NN` starting with the province code; BPS code 4 digits; kind kabupaten/kota; required names; coordinates required and inside Indonesia (lat -12..7, lng 94..142); disease code `A-Z0-9_` ≤40, not `OLD_`; duplicates → 409; parameterized SQL only.
Inactive rows disappear from the form/filter dropdowns and dashboard lists (public endpoints are active-only).

## Migration
`011_master_data_menu.sql`: `updated_at` on the 3 master tables, `created_at` on master_kabkota, name index, MASTER DATA menu group (backup `app_settings_bak_011`). Rollback: `database/rollback/011_rollback.sql`.

## Verification
- `python3 scripts/master_roundtrip.py http://localhost:8091` and via frontend proxy `http://localhost:3200/skdr`: PASS — per master: create 201, duplicate 409, invalid 400, edit, deactivate, activate, unknown id 404; kab/kota province filter.
- Test rows left **inactive** (soft delete): province `99` "UJI PR004 Provinsi (diubah)", kab/kota `99.01`, disease `UJI_PR004`.
- tsc OK; `/skdr/{main-dashboard,form,reports,master/provinsi,master/kabupaten,master/penyakit}` = 200; smoke test PASS.
- Screenshots: `docs/screenshots/skdr-master-{provinsi,kabupaten,kabupaten-form,penyakit}.png`, `skdr-sidebar-master-data.png`.
- Smoke-test case reports were not deleted (the smoke-test run added one more: now 5).

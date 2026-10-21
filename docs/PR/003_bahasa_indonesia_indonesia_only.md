# PR 003 — Bahasa Indonesia UI, Indonesia-only, 31 diseases, kab/kota master

Date: 2026-10-21 · Git: local only (no remote, no push)

## Changes
1. **Bahasa Indonesia UI** — default locale `id` (`NEXT_PUBLIC_DEFAULT_LOCALE`, default `id`) via `locales/id.json` / `en.json` and `lib/i18n/LanguageContext.tsx` (`t()` hook + non-hook `tr()`). New keys under `skdr.*`. `<html lang="id">`, language switcher hidden. Map controls (OpenLayers tooltips), legend, layer panel, KPI cards/modals, form, reports, header, sidebar, footer, toasts translated.
2. **Signals panel removed** — "Latest Surveillance Signals" gone; map is one full-width section **"Peta Sinyal Surveilans"**.
3. **Indonesia only** — region/country/ASEAN/GLOBAL filters and the 67-country master removed from UI and API (`/master/regions`, `/master/countries`, `/master/locations` routes removed). New `/api/v1/master/provinces`, `/api/v1/master/kabkota?province_id=`. Dashboard filters: Provinsi, Kab/Kota (dependent), penyakit, minggu epi. Dashboard returns `by_province`.
4. **Disease master** — 31 diseases from NLP.
5. **Kab/kota master** — 514 rows with province link, codes, centroid.
6. **Form** — Provinsi → Kab/Kota dropdowns auto-fill latitude/longitude (editable).
7. Unused components deleted: EpiFilterBar, AseanScopeBanner, CaseLocationHeatmap, DiseaseTrendOverview, MorbidityMortalitySection, CrawlingEnginePerformance, IbsSourcePerformance.

## Migrations (each with rollback in `database/rollback/`)
| File | Does | Rollback |
|---|---|---|
| 007_indonesia_only.sql | drops `case_reports.country_id`, `master_locations.country_iso2`, tables master_country_regions, master_countries, master_regions | recreates tables + 004 seed, re-adds columns (backfill ID) |
| 008_master_diseases_31.sql | replaces 14-disease seed with 31 NLP diseases (+canonical_name, english_name, category, is_zoonotic, description, aliases_id); backups `*_bak_008` | restores old ids/codes and each report's old disease |
| 009_master_kabkota.sql | province names/centroids from geojson; table `master_kabkota` (514); `case_reports.kabkota_id` | drops table/column, restores provinces from `master_locations_bak_009` |
| 010_settings_id.sql | Indonesian tagline, footer, navigation menu | restores from `app_settings_bak_010` |

Rollback: run `database/rollback/0NN_rollback.sql` in reverse order (010 → 007); each deletes its `schema_migrations` row.

## Data sources (no invented values)
- **Diseases: 31** — NLP-PENYAKIT `database/init/120_clean_and_inject_asean_master_diseases.sql` (31 diseases, 982 aliases). Indonesian name = NLP `locales/id.json` `diseases.<canonical>`, else first `language='id'` alias. (NLP's live API lists 40 incl. non-master entries; the master migration has 31.)
- **Kab/kota: 514** (416 kabupaten, 98 kota) — NLP-PENYAKIT `services/frontend-next/public/data/indonesia-kabupaten.geojson` (added in NLP commit 5a51074, 2026-09-05): `id` (Kemendagri, e.g. 11.71), `kode_kab` (BPS-style, e.g. 1171), `kode_prov`, `nama_kab`, `centerlat`, `centerlong`.
  - Source quirk: `kode_kab` 9504 appears for both Tolikara (91.14) and Yahukimo (91.13), so `code` is not unique; `kemendagri_code` is unique. Kept as in source.
- **Provinces: 38** — NLP `public/data/indonesia-38-provinces.geojson` (`centerlat`/`centerlong`).

## Existing report remap (008)
Same code kept (DENGUE, MEASLES, …); TB→TUBERCULOSIS, LEPTO→LEPTOSPIROSIS, AFP→POLIO; others → UNKNOWN_DISEASE. The 3 earlier smoke-test rows became "Penyakit Tidak Dikenal" (rollback restores them).

## Verification
- tsc --noEmit: OK · cargo build: OK
- /skdr/main-dashboard, /skdr/form, /skdr/reports: 200
- `scripts/smoke_test.sh`: PASS (masters 31/38/514, post DENGUE → +7 overall and +7 kab/kota filtered, map point, invalid post 400)
- Screenshot: `docs/screenshots/skdr-main-dashboard.png`
- Visible-text scan (Playwright, incl. open map settings panel): remaining Latin text is proper nouns / dataset names only (OSM, NASA FIRMS VIIRS, MODIS, GBIF, WorldPop, Open-Meteo, CAMS, Black Marble, COVID-19, MERS, West Nile, Zika, IBS, Instagram/YouTube/WhatsApp), basemap tile labels, the ABVC logo image text, and Next.js dev-only indicator.

# PR 027 — Dasbor Zoonosis Lite (one-screen dashboard for 4 zoonoses with Form PE)

## Summary
New simple page `/dasbor/zoonosis-lite` ("Dasbor Zoonosis Lite") for the 4 zoonoses that have a Form PE: Antraks (ANTHRAX), Rabies (GHPR/Rabies, RABIES), Leptospirosis (LEPTOSPIROSIS) and Flu Burung (Avian Influenza, AVIAN_INFLUENZA). Everything fits one desktop screen (1366x768 and 1920x1080) without long scrolling: a filter bar, 4 disease cards, the spread map (with optional public context layers for migratory birds and mosquitoes) and a small CFR comparison. This page has its own header (title and subtitle in the app header instead of "SKDR INDONESIA"). A sidebar entry is placed directly under "Dasbor Utama".

## Changes
- `services/frontend-next/app/dasbor/zoonosis-lite/page.tsx`: new route.
- `services/frontend-next/components/dashboard/ZoonosisLite.tsx`: the page.
  - Filter bar (one row on 1920, two short rows on 1366): segmented presets 4 / 8 / 12 minggu and YTD (applied immediately), a pill with year + week start–end, the resulting date range, coloured multi-select disease chips ("Semua" + Antraks, Rabies, Leptospirosis, Flu Burung), province select ("Seluruh Indonesia" + provinces from `/api/v1/master/provinces`, sent as `province_id` to all 4 endpoints) and a Reset button (back to YTD, all diseases, all provinces, layers off).
  - Map context layers (chips at the top-left of the map, off by default, with count and loading state): "Burung migran" (teal, GBIF) linked to Flu Burung (turned on automatically when only Flu Burung is selected) and "Nyamuk" (amber) labelled "Konteks vektor" because mosquitoes are not vectors of these 4 diseases. The legend explains both layers and states that they cover all of Indonesia for the selected period (the province filter does not apply to them). The map legend can be folded ("Legenda" toggle, `legendCollapsible`); it starts folded on screens lower than 900 px so it does not cover Java/Bali markers.
  - Period: year + start/end epi week (default week 1 to the current week, as Dasbor Utama). The period is always sent explicitly (`start_year/start_week/end_year/end_week/year`) together with `kategori=ZOONOSIS&disease=ANTHRAX,RABIES,LEPTOSPIROSIS,AVIAN_INFLUENZA` (resolved by `dashboard::resolve`).
  - Cards: cases, deaths, CFR with Wilson 95% CI per disease from `/api/v1/alert-skdr` (`by_disease`, `cfr.by_disease`), i.e. the same source and logic as the Dasbor Utama CFR card (`AlertCfr`); weekly sparkline from `/api/v1/epicurve` groups; EBS signals and Kasus PE per group from `/api/v1/dashboard/executive`. Clicking a card shows only that disease (click again to show all).
  - Map: `SpatialOutbreakMap` with `/api/v1/public-dashboard` locations limited to the 4 diseases, `markerPeriod` = backend `filters.start_date..end_date` (PR 026), filtered by the disease chips. The map frames all of Indonesia (`fitTo` 95..141°E, 11°S..6°N) and fits to the markers when a disease subset or a province is selected (all fits wait ~2.5 s until AseanMap's own country framing of new data has settled).
  - CFR panel: horizontal bars with Wilson CI whiskers (same colour thresholds as `AlertCfr`: ≥5% red, ≥1% amber, else teal) and a deaths/cases/CFR/CI table including the combined CFR of the 4 diseases.
- `services/frontend-next/lib/menu.ts`: `ZOONOSIS_LITE_MENU_ITEM` + `ensureZoonosisLiteMenu()` inserts the item right after `mod_main_dashboard` (order = main + 0.5) when the DB menu does not already contain it.
- `services/frontend-next/lib/nav.ts`: applies `ensureZoonosisLiteMenu` when building the sidebar (display only, never saved to `app_settings`); label from i18n key `skdr.lite.menu`.
- `services/frontend-next/components/layout/AppShell.tsx`: on `/dasbor/zoonosis-lite` only, passes `title`/`subtitle`/`compact` to `DashboardHeader` and hides the breadcrumb. All other routes keep the default header.
- `services/frontend-next/components/layout/DashboardHeader.tsx`: optional props `title`, `subtitle`, `compact` (default unchanged). With a title the h1 shows "Dasbor Zoonosis Lite" (not uppercase) and the subtitle "Antraks, Rabies, Leptospirosis dan Flu Burung (zoonosis dengan Form PE): kasus, kematian, CFR dan peta sebaran dalam satu layar." The title was removed from the page body.
- `services/frontend-next/lib/zoonosis-intel.ts` (new): browser fetchers for keyless public APIs (CORS `*`), filtered to the selected period (epi-week dates, end clamped to today):
  - Migratory birds: GBIF Occurrence API `https://api.gbif.org/v1/occurrence/search?country=ID&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&eventDate=<start>,<end>&orderKey=1108&orderKey=7192402&limit=300` (Anseriformes = ducks/geese, Charadriiformes = shorebirds; the main wild reservoirs of avian influenza; GBIF has no migratory flag, so these orders are the proxy). Up to 900 records, pages fetched in parallel. Same source as NLP-PENYAKIT `wildlife_layer.rs`.
  - Mosquitoes: iNaturalist API `https://api.inaturalist.org/v1/observations?taxon_id=52134&place_id=6966&d1=<start>&d2=<end>&geo=true&verifiable=true&per_page=200&order_by=observed_on` (Culicidae, Indonesia). Up to 400 records. Same source as NLP-PENYAKIT `external_layers.rs`.
- `services/frontend-next/components/AseanMap.tsx`: optional `intelLoaders` prop (exported type `IntelLoaders`): when set, the wildlife/vector layers use these loaders instead of the backend endpoints (`/api/v1/map/wildlife`, `/api/v1/map/vectors`), otherwise behaviour is unchanged. Popups for both layers now show the place and a "Buka sumber" link (GBIF occurrence / iNaturalist observation).
- `services/frontend-next/components/SpatialOutbreakMap.tsx`: optional `intelOverride`, `intelLoaders`, `legendExtra`, `legendCollapsible`, `legendDefaultOpen` props (defaults keep the old behaviour; other pages unaffected).
- `services/frontend-next/types/index.ts`: optional `url` on `VectorSighting`, `place`/`url` on `WildlifeOccurrence`.
- `services/frontend-next/next.config.mjs`: CSP `connect-src` adds `https://api.inaturalist.org` (GBIF API and both image hosts were already allowed).
- `services/frontend-next/locales/{en,id}.json`: keys `skdr.lite.*`.

## Migration
None. No backend or database change; only existing read-only GET endpoints plus the public GBIF/iNaturalist APIs (no API key). Not used because they need credentials: eBird API 2.0 (needs an API key) and Movebank (needs an account and per-study licence).

## Tests
- `npm run typecheck` (tsc --noEmit) on Node 20: 0 errors.
- `npm run build` (next build): success.
- No lint script or frontend unit tests exist in the repo.
- Manual: dev server (Node 20, Docker) proxied to the live read-only API, Playwright screenshots at 1366x768 and 1920x1080: header title/subtitle present, no h1 in the body, content ends above the fold (only the app footer is below), birds 815 / mosquitoes 245 for YTD 2026, 8-week preset, Flu Burung only, province Jawa Timur; no CSP or console errors.

## Verification
Open `/skdr/dasbor/zoonosis-lite` (sidebar: Dasbor → Dasbor Zoonosis Lite, directly under Dasbor Utama). The header shows "Dasbor Zoonosis Lite" and the subtitle; other pages still show SKDR INDONESIA. Click 4/8/12 mg or YTD, or change year/weeks: cards, CFR panel and markers update and the legend shows the period. Toggle disease chips and the province; Reset restores the defaults. Turn on "Burung migran" and "Nyamuk" on the map: points appear with counts, legend entries and popups with a source link.

# PR 027 — Dasbor Zoonosis Lite (one-screen dashboard for 4 zoonoses with Form PE)

## Summary
New simple page `/dasbor/zoonosis-lite` ("Dasbor Zoonosis Lite") for the 4 zoonoses that have a Form PE: Antraks (ANTHRAX), Rabies (GHPR/Rabies, RABIES), Leptospirosis (LEPTOSPIROSIS) and Flu Burung (Avian Influenza, AVIAN_INFLUENZA). Everything fits one desktop screen (1366x768 and 1920x1080) without long scrolling: a compact header with an epi-week period filter, 4 disease cards, the spread map and a small CFR comparison. A sidebar entry is placed directly under "Dasbor Utama".

## Changes
- `services/frontend-next/app/dasbor/zoonosis-lite/page.tsx`: new route.
- `services/frontend-next/components/dashboard/ZoonosisLite.tsx`: the page.
  - Period: year + start/end epi week (default week 1 to the current week, as Dasbor Utama). The period is always sent explicitly (`start_year/start_week/end_year/end_week/year`) together with `kategori=ZOONOSIS&disease=ANTHRAX,RABIES,LEPTOSPIROSIS,AVIAN_INFLUENZA` (resolved by `dashboard::resolve`).
  - Cards: cases, deaths, CFR with Wilson 95% CI per disease from `/api/v1/alert-skdr` (`by_disease`, `cfr.by_disease`), i.e. the same source and logic as the Dasbor Utama CFR card (`AlertCfr`); weekly sparkline from `/api/v1/epicurve` groups; EBS signals and Kasus PE per group from `/api/v1/dashboard/executive`. Clicking a card focuses the map on that disease.
  - Map: `SpatialOutbreakMap` with `/api/v1/public-dashboard` locations limited to the 4 diseases, `markerPeriod` = backend `filters.start_date..end_date` (PR 026), plus a disease toggle (All / per disease). The map frames all of Indonesia (`fitTo` 95..141°E, 11°S..6°N) and fits to the markers of a focused disease.
  - CFR panel: horizontal bars with Wilson CI whiskers (same colour thresholds as `AlertCfr`: ≥5% red, ≥1% amber, else teal) and a deaths/cases/CFR/CI table including the combined CFR of the 4 diseases.
- `services/frontend-next/lib/menu.ts`: `ZOONOSIS_LITE_MENU_ITEM` + `ensureZoonosisLiteMenu()` inserts the item right after `mod_main_dashboard` (order = main + 0.5) when the DB menu does not already contain it.
- `services/frontend-next/lib/nav.ts`: applies `ensureZoonosisLiteMenu` when building the sidebar (display only, never saved to `app_settings`); label from i18n key `skdr.lite.menu`.
- `services/frontend-next/components/layout/AppShell.tsx`: no breadcrumb on this route (saves vertical space, like Dasbor Utama).
- `services/frontend-next/locales/{en,id}.json`: keys `skdr.lite.*`.

## Migration
None. No backend or database change; only existing read-only GET endpoints are used.

## Tests
- `npm run typecheck` (tsc --noEmit) on Node 20: 0 errors.
- `npm run build` (next build): success.
- No lint script or frontend unit tests exist in the repo.
- Manual: dev server (Node 20, Docker) proxied to the live read-only API, screenshots at 1366x768 and 1920x1080.

## Verification
Open `/skdr/dasbor/zoonosis-lite` (sidebar: Dasbor → Dasbor Zoonosis Lite, directly under Dasbor Utama). Change the period and press Terapkan: cards, CFR panel and map markers update; the map legend shows the period. Click a card or a chip on the map to show only that disease.

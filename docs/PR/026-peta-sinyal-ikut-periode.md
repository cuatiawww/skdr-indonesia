# PR 026 — Peta Sinyal Surveilans: markers follow the dashboard period

## Summary
Outbreak markers on the "Peta sinyal surveilans" map (Dasbor Utama and `/dasbor/kategori/<kode>`) were always limited to a rolling 30-day window (`markerLookbackDays = 30` in `AseanMap`), independent of the dashboard period filter. Because EBS data currently ends in April 2026, a 2026 period such as weeks 1–44 showed almost no markers (only a single PE point in Aceh). Markers now follow the active dashboard period (`filters.start_date .. filters.end_date` resolved by the backend), and the map shows that period.

## Changes
- `services/frontend-next/components/AseanMap.tsx`: new optional prop `markerPeriod` (`{ start, end }`, YYYY-MM-DD) and helper `isWithinPeriod` (inclusive). When both dates are set, markers are filtered by `latest_date` within the period; otherwise the old rolling `markerLookbackDays` window is used (unchanged behavior for callers that do not pass a period).
- `services/frontend-next/components/SpatialOutbreakMap.tsx`: new optional prop `markerPeriod`, forwarded to `AseanMap`. When active, the legend shows "Markers: <start> – <end>" and the "Marker time range" control shows "Follows dashboard period: <start> – <end>" instead of the 7/14/30/90-day buttons.
- `services/frontend-next/app/main-dashboard/page.tsx`: passes `data.filters.start_date/end_date` as `markerPeriod`.
- `services/frontend-next/locales/{en,id}.json`: keys `skdr.map.markerRangeFollowsPeriod`, `skdr.map.markerPeriod`.

## Migration
None. No backend or database change.

## Tests
- `npm ci` + `npm run typecheck` (tsc --noEmit) on Node 20 (as CI): 0 errors (baseline origin/main also 0).
- `npm run build` (next build): success, 26/26 pages (baseline also success).
- No lint script or frontend unit tests exist in the repo.

## Verification
Open `/dasbor/kategori/zoonosis` (or Dasbor Utama) with a period, e.g. 2026 weeks 1–44: the map legend shows "Markers: 4 Jan 2026 – 7 Nov 2026" and markers for the whole period appear; Spatial controls → Marker time range shows "Follows dashboard period".

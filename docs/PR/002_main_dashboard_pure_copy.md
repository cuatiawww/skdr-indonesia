# PR 002 – Pure copy of NLP main-dashboard + form wiring (2026-10-21)

## Copied as-is from NLP-PENYAKIT services/frontend-next (read-only source)
- app/main-dashboard/page.tsx (page title + Refresh, Integrated Epidemiological Surveillance Filter, KPI cards
  Total Collected / Detected Cases / Deaths / Mapped Locations, Latest Surveillance Signals with tabs, Surveillance Signal Map)
- components: layout/* (AppShell, DashboardHeader, DashboardSidebar, Footer), EpiFilterBar, LivePipelineCard,
  SpatialOutbreakMap, AseanMap (OpenLayers + ol-wind, Map & Layer Settings), FlightRoutesLayer, CountryFlag,
  AseanScopeBanner, DiseaseDetailPanel, RelatedArticlesPanel, LanguageSwitcher, UnderDevelopment (+ unused copies)
- lib/* needed by these (api, i18n, epi-week, map libs, signal-feed, growth, ...), types/index.ts, locales, data/
- Next route handlers: boundaries, osm-tiles, wilayah-data, wind-data (+ app/api/gfs), not-found
- public: fonts, logos, header backgrounds, public/data (geojson, 31 MB)
- package.json + package-lock.json identical to NLP (same versions: next 15.1.3, react 19, ol 10, ol-wind 1.1.9,
  recharts, lucide-react, sonner, zustand, tiptap, jspdf, html2canvas, papaparse, tailwind 3.4 ...)
- next.config.mjs: NLP CSP kept; basePath/backend from env (NEXT_PUBLIC_BASE_PATH=/skdr, BACKEND_INTERNAL_URL)

## Changed vs NLP
- settings-context: settings URL uses PUBLIC_BASE_PATH instead of hard-coded /nlp.
- main-dashboard: removed below-map sections (Crawling Engine Performance, IBS Source Performance,
  Case Location Heatmap, Disease Trend Overview, Morbidity & Mortality) – no form-data endpoints yet.
- No login/logout (Yosua): AuthGuard, /login and the header user menu removed; LayoutContent renders AppShell for all pages.
- / and /tv redirect to /main-dashboard. Sidebar menu from app_settings.navigation_menu.
- Form and Case Reports pages full width (same padding as main-dashboard).

## Backend (Rust, NLP JSON shapes, data = form reports only)
- GET /api/v1/public-dashboard, /kpi-snapshot, /crawling-stats, /crawling-stats/live, /crawl-history/summary
- GET /api/v1/console/settings, /master/regions, /master/countries, /master/locations?country_iso2=, /disease-concepts
- POST /api/v1/case-reports: country, location (master or free text), lat/lng, reviewed flag.
- Card mapping: Collected = all form reports; Processed / Health stored = reviewed reports; crawler shows idle.
  Reviewed/Unreviewed and Geocoded/Unmapped are real counts. Severity/alerts = NORMAL/0 (no alert rules yet).

## DB
- 003 countries/regions/country_regions, coords on master_locations, case_reports country/location_name/lat/lng/is_reviewed.
- 004 67 countries + ASEAN / ASEAN+3 / GLOBAL regions (copied from NLP master).
- 005 province capital coordinates (approximate) + navigation menu.
- 006 drops auth tables (no login for now).

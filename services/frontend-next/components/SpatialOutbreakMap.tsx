'use client'

import { tr } from "@/lib/i18n/LanguageContext";
import { Layers, MapPin, Settings, Wind, X, Plane, Flame, Bird, ChevronDown } from "lucide-react";
import type { ExternalIntelLayers, MapLayerStatus } from "@/types";
import { useEffect, useState, type ReactNode } from "react";
import ChoroLegend from "./ChoroLegend";
import { buildChoroClasses, useChoroConfig, type ChoroClass } from "@/lib/choropleth-classes";
import AseanMap, { type BorderNeighborShape, type HazardEvent, type IntelLoaders, type MarkerPeriod, type RegionBorderLink } from "./AseanMap";
import type { OutbreakLocation } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { classifyLayerError } from "@/lib/map-layer-client.mjs";

type Base = "osm" | "terrain" | "satellite" | "light" | "dark";
type MarkerLookbackDays = 7 | 14 | 30 | 90;


export default function SpatialOutbreakMap({
  countries,
  locations,
  highlightCountry,
  borderNeighbors,
  regionLinks,
  regionalMode = false,
  hazardEvents = [],
  initialCenter,
  initialZoom,
  onSelectCountry,
  boundaryScope,
  prototypeMode = false,
  ebsOnly,
  hideSpreadRoute,
  sourceMode = "all",
  fitTo,
  markerPeriod,
  intelOverride,
  intelLoaders,
  legendExtra,
  legendCollapsible = false,
  legendDefaultOpen = true,
  onLayerStatus,
}: {
  countries: { name: string; cases: number; deaths?: number }[];
  locations: OutbreakLocation[];
  embedded?: boolean;
  highlightCountry?: string;
  borderNeighbors?: BorderNeighborShape[];
  regionLinks?: RegionBorderLink[];
  regionalMode?: boolean;
  hazardEvents?: HazardEvent[];
  initialCenter?: [number, number];
  initialZoom?: number;
  onSelectCountry?: (country: string) => void;
  boundaryScope?: "asean" | "asean3" | "global" | "indonesia";
  prototypeMode?: boolean;
  ebsOnly?: boolean;
  hideSpreadRoute?: boolean;
  /** PR 016: global Sumber filter; shown in the map legend and region popup. */
  sourceMode?: "all" | "ebs" | "pe";
  /** PR 018: bounds of the filtered provinces / kab-kota (auto-fit). */
  fitTo?: [number, number, number, number] | null;
  /** PR 026: active dashboard period (YYYY-MM-DD); when set, markers follow it instead of the 7/14/30/90-day window. */
  markerPeriod?: MarkerPeriod | null;
  /** PR 027: page-controlled intel layers (e.g. the Lite page's Burung / Nyamuk chips); wins over the settings panel for these keys. */
  intelOverride?: Partial<ExternalIntelLayers>;
  /** PR 027: custom (period-filtered) loaders for the vectors / wildlife layers, passed through to AseanMap. */
  intelLoaders?: IntelLoaders;
  /** PR 027: extra rows appended to the map legend. */
  legendExtra?: ReactNode;
  /** PR 027: legend can be folded to a small "Legenda" button (default: always open, as before). */
  legendCollapsible?: boolean;
  legendDefaultOpen?: boolean;
  onLayerStatus?: (key: string, status: MapLayerStatus) => void;
}) {
  const { t, locale } = useTranslation();
  const periodActive = !!(markerPeriod?.start && markerPeriod?.end);
  const fmtDay = (v: string) => {
    const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  };
  const periodLabel = periodActive ? `${fmtDay(markerPeriod!.start!)} – ${fmtDay(markerPeriod!.end!)}` : "";
  const [legendOpen, setLegendOpen] = useState(legendDefaultOpen);
  useEffect(() => { setLegendOpen(legendDefaultOpen); }, [legendDefaultOpen]);
  const [settings, setSettings] = useState(false),
    [windLegend, setWindLegend] = useState(false),
    [adminLevel, setAdminLevel] = useState(1),
    [regionClasses, setRegionClasses] = useState<ChoroClass[] | null>(null),
    choroCfg = useChoroConfig(),
    [base, setBase] = useState<Base>("osm"),
    [markers, setMarkers] = useState(true),
    [markerLookbackDays, setMarkerLookbackDays] = useState<MarkerLookbackDays>(30),
    [admin, setAdmin] = useState(true),
    [choropleth, setChoropleth] = useState(true),
    [wind, setWind] = useState(false),
    [bnpb, setBnpb] = useState({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    }),
    [intel, setIntel] = useState<ExternalIntelLayers>({
      vectors: false,
      flights: false,
      flightRoutes: false,
      fires: false,
      wildlife: false,
    });
  const [layerStatus, setLayerStatus] = useState<Record<string, MapLayerStatus>>({});

  const reset = () => {
    setBase("osm");
    setMarkers(true);
    setMarkerLookbackDays(30);
    setAdmin(true);
    setChoropleth(true);
    setWind(false);
    setWindLegend(false);
    setBnpb({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    });
    setIntel({
      vectors: false,
      flights: false,
      flightRoutes: false,
      fires: false,
      wildlife: false,
    });
  };



  const choroClasses = admin && regionClasses ? regionClasses : buildChoroClasses(choroCfg, (countries || []).map((c) => c.cases || 0));
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AseanMap
        embedded
        prototypeMode={prototypeMode}
        ebsOnly={ebsOnly ?? prototypeMode}
        hideSpreadRoute={hideSpreadRoute ?? prototypeMode}
        sourceMode={sourceMode}
        baseMap={base}
        showMarkers={markers}
        showAdmin={admin}
        countryData={choropleth ? countries : undefined}
        outbreakLocations={locations}
        markerLookbackDays={markerLookbackDays}
        markerPeriod={periodActive ? markerPeriod : null}
        bnpbLayers={bnpb}
        showWind={wind}
        highlightCountry={highlightCountry}
        borderNeighbors={borderNeighbors}
        regionLinks={regionLinks}
        hazardEvents={hazardEvents}
        showHazards={false}
        intelLayers={intelOverride ? { ...intel, ...intelOverride } : intel}
        intelLoaders={intelLoaders}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        fitTo={fitTo}
        boundaryScope={boundaryScope}
        onLayerStatus={(key, status) => {
          setLayerStatus((prev) => (prev[key]?.state === status.state && prev[key]?.message === status.message ? prev : { ...prev, [key]: status }));
          onLayerStatus?.(key, status);
        }}
        onSelectCountry={onSelectCountry}
        onAdminLevel={setAdminLevel}
        onChoroClasses={setRegionClasses}
      />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setSettings(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-slate-700 shadow-md transition hover:border-blue-300 hover:bg-blue-50 hover:text-primary"
        >
          <Settings className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-black tracking-wide">
            {t("map.spatialControls")}
          </span>
        </button>
      </div>

      {/* PR 016: single map legend — symbol shape + colour per source, choropleth meaning labelled. */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-md" data-testid="map-legend">
        {legendCollapsible ? (
          <button type="button" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen} className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800" data-testid="map-legend-toggle">
            {t("map.legend")}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${legendOpen ? "" : "-rotate-90"}`} />
          </button>
        ) : null}
        {legendCollapsible && !legendOpen ? null : <>
        {periodActive && markers ? <span className="text-slate-500" data-testid="map-marker-period">{tr("skdr.map.markerPeriod", { period: periodLabel })}</span> : null}
        {sourceMode !== "pe" ? <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white bg-ebs shadow" />{tr("skdr.map.legendEbs")}</span> : null}
        {sourceMode !== "ebs" ? <span className="flex items-center gap-1.5"><span className="mx-0.5 h-2.5 w-2.5 rotate-45 border border-white bg-pe shadow" />{tr("skdr.map.legendPe")}</span> : null}
        {choropleth ? <span className="text-slate-500">{tr(sourceMode === "all" ? "skdr.map.legendChoroAll" : sourceMode === "ebs" ? "skdr.map.legendChoroEbs" : "skdr.map.legendChoroPe")}</span> : null}
        {legendExtra}
        {choropleth && choroClasses ? <ChoroLegend classes={choroClasses} label={tr(adminLevel >= 3 ? "skdr.map.perKecamatan" : adminLevel === 2 ? "skdr.map.perKabkota" : "skdr.map.perProvinsi")} /> : null}
        </>}
      </div>

      {windLegend && wind && !prototypeMode && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[320px] space-y-3 rounded-2xl border border-blue-200/90 bg-white/95 p-3.5 shadow-[0_8px_30px_rgb(var(--brand-700)/.12)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                {t("map.windFlow")} (GFS)
              </span>
            </div>
            <button
              onClick={() => {
                setWindLegend(false);
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label={t("common.close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-[rgb(15,60,140)] via-[rgb(85,160,115)] via-[rgb(215,195,60)] via-[rgb(210,125,35)] to-[rgb(185,35,10)] shadow-inner" />
            <div className="flex justify-between px-0.5 text-[8.5px] font-bold text-slate-500">
              <span>0 km/h</span>
              <span>20 km/h</span>
              <span>40 km/h</span>
              <span>&gt;60 km/h</span>
            </div>
          </div>
        </div>
      )}

      {settings && (
        <>
          <button
            onClick={() => setSettings(false)}
            className="absolute inset-0 z-20 bg-black/10"
            aria-label={t("common.close")}
          />
          <aside className="absolute right-0 top-0 z-30 flex h-full w-[min(360px,100%)] flex-col border-l border-slate-200 bg-white/95 shadow-[-8px_0_40px_rgba(0,0,0,.08)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-slate-800">
                  {t("map.spatialControls")}
                </span>
              </div>
              <button
                onClick={() => setSettings(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {!prototypeMode && (
                <Group title={tr("skdr.map.mapLayers")}>
                  <Row
                    icon={<MapPin className="h-4 w-4" />}
                    title={t("map.outbreakMarkers")}
                    sub={t("map.outbreakMarkersSub")}
                    value={markers}
                    set={setMarkers}
                  />
                  <div className="ml-10 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{tr("skdr.map.markerRange")}</p>
                    {periodActive ? (
                      <p className="mt-2 text-[11px] font-semibold text-slate-700" data-testid="map-marker-range-period">
                        {tr("skdr.map.markerRangeFollowsPeriod")}: {periodLabel}
                      </p>
                    ) : (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {([7, 14, 30, 90] as const).map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setMarkerLookbackDays(days)}
                          className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${markerLookbackDays === days ? "border-primary bg-blue-50 text-primary" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200"}`}
                        >
                          {days === 90 ? tr("skdr.map.3months") : tr("skdr.map.days", { days })}
                        </button>
                      ))}
                    </div>
                    )}
                  </div>
                  <Row
                    icon={<Layers className="h-4 w-4" />}
                    title={t("map.adminBoundaries")}
                    sub={t("map.adminBoundariesSub")}
                    value={admin}
                    set={setAdmin}
                  />
                  <Row
                    icon={<Layers className="h-4 w-4" />}
                    title={t("map.casesChoropleth")}
                    sub={t("map.casesChoroplethSub")}
                    value={choropleth}
                    set={setChoropleth}
                  />
                  <Row
                    icon={<Wind className="h-4 w-4" />}
                    title={t("map.windFlow")}
                    sub={t("map.windFlowSub")}
                    value={wind}
                    set={(v) => {
                      // PR 117: one Wind Flow layer; the speed gradient legend is part of it.
                      setWind(v);
                      setWindLegend(v);
                    }}
                  />
                </Group>
              )}

              <Group title={t("map.baseMap")}>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    ["osm", "terrain", "satellite", "light", "dark"] as Base[]
                  ).map((x) => (
                    <button
                      key={x}
                      onClick={() => setBase(x)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold capitalize ${base === x ? "border-primary bg-blue-50 text-primary" : "border-slate-100 bg-slate-50 text-slate-600"}`}
                    >
                      {tr(`skdr.map.base_${x}`)}
                    </button>
                  ))}
                </div>
              </Group>

              {!prototypeMode && (
                <>
                  {/* ── Surveillance & Vector Intelligence ── */}
                  <Group title={tr("skdr.map.intelGroup")}>
                    <Row
                      icon={<Plane className="h-4 w-4 text-primary" />}
                      title={tr("skdr.map.flightsTitle")}
                      sub={tr("skdr.map.flightsSub")}
                      value={Boolean(intel.flightRoutes)}
                      set={(v) => setIntel((p) => ({ ...p, flightRoutes: v }))}
                      status={layerStatus.flightRoutes}
                    />
                    <Row
                      icon={<Flame className="h-4 w-4 text-rose-600" />}
                      title={tr("skdr.map.firesTitle")}
                      sub={tr("skdr.map.firesSub")}
                      value={Boolean(intel.fires)}
                      set={(v) => setIntel((p) => ({ ...p, fires: v }))}
                      status={layerStatus.fires}
                    />
                    <Row
                      icon={<Bird className="h-4 w-4 text-teal-600" />}
                      title={tr("skdr.map.wildlifeTitle")}
                      sub={tr("skdr.map.wildlifeSub")}
                      value={Boolean(intel.wildlife)}
                      set={(v) => setIntel((p) => ({ ...p, wildlife: v }))}
                      status={layerStatus.wildlife}
                    />
                  </Group>

                  <Group title={t("map.bnpbInarisk")}>
                    {(
                      [
                        ["flood", t("map.hazardFlood")],
                        ["earthquake", t("map.hazardQuake")],
                        ["landslide", t("map.hazardSlide")],
                        ["forestFire", t("map.hazardFire")],
                        ["hillshade", t("map.hillshade")],
                        ["population", t("map.population")],
                      ] as const
                    ).map(([k, l]) => (
                      <Row
                        key={k}
                        icon={<Layers className="h-4 w-4" />}
                        title={l}
                        sub={tr("skdr.map.bnpbSub")}
                        value={bnpb[k]}
                        set={(v) => setBnpb((p) => ({ ...p, [k]: v }))}
                      />
                    ))}
                  </Group>
                </>
              )}

            </div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={reset}
                className="w-full rounded-xl bg-primary py-2 text-xs font-bold text-white transition hover:bg-primary-dark"
              >
                {t("map.resetLayers")}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  title,
  sub,
  value,
  set,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  value: boolean;
  set: (v: boolean) => void;
  status?: MapLayerStatus;
}) {
  const statusText =
    !value || !status || status.state === "idle"
      ? null
      : status.state === "loading"
        ? status.message || tr("skdr.map.stLoading")
        : status.state === "timeout"
          ? status.message || tr("skdr.map.stTimeout")
          : status.state === "auth"
            ? status.message || tr("skdr.map.stAuth")
            : status.state === "unavailable"
              ? status.message || tr("skdr.map.stUnavail")
              : status.state === "upstream" || status.state === "error"
                ? status.message || tr("skdr.map.stUpstream")
                : status.state === "cached"
                  ? status.message || tr("skdr.map.stCached")
                  : status.state === "empty"
                    ? status.message || tr("skdr.map.stNoData")
                    : status.message;
  const statusClass =
    status?.state === "error" || status?.state === "upstream" || status?.state === "unavailable"
      ? "text-rose-600"
      : status?.state === "timeout"
        ? "text-orange-600"
        : status?.state === "auth"
          ? "text-violet-700"
          : status?.state === "empty"
            ? "text-amber-600"
            : status?.state === "loading"
              ? "text-primary"
              : status?.state === "cached"
                ? "text-teal-700"
                : "text-emerald-700";
  // PR 117: checkbox in a fixed right column; text wraps to its left and never pushes it.
  const id = `layer-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="-mx-1.5 grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_20px] items-start gap-x-2.5 rounded-lg px-1.5 py-1 transition hover:bg-slate-50">
      <span className="rounded-lg bg-slate-100 p-1.5 text-slate-600">{icon}</span>
      <span className="min-w-0">
        <span className="block break-words text-xs font-bold text-slate-800">{title}</span>
        <span className="block break-words text-[10px] text-slate-400">{sub}</span>
        {statusText && (
          <span className={`mt-0.5 block break-words text-[10px] font-semibold ${statusClass}`}>{statusText}</span>
        )}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
    </label>
  );
}

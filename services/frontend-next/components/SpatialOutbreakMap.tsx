'use client'

import { Layers, MapPin, Settings, Wind, X, Plane, Flame, Users, Globe, Sun, CloudRain, CloudSun, Droplets, Bird } from "lucide-react";
import type { NasaGibsLayers, ExternalIntelLayers, MapLayerStatus } from "@/types";
import { useEffect, useState } from "react";
import AseanMap, { type BorderNeighborShape, type HazardEvent, type RegionBorderLink } from "./AseanMap";
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
  boundaryScope?: "asean" | "asean3" | "global";
  prototypeMode?: boolean;
  ebsOnly?: boolean;
  hideSpreadRoute?: boolean;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(false),
    [windLegend, setWindLegend] = useState(false),
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
    [gibs, setGibs] = useState<NasaGibsLayers>({
      viirsTrueColor: false,
      modisTrueColor: false,
      aerosol: false,
      ndvi: false,
      nightLights: false,
      landSurfaceTemp: false,
    }),
    [intel, setIntel] = useState<ExternalIntelLayers>({
      vectors: false,
      flights: false,
      flightRoutes: false,
      fires: false,
      population: false,
      weather: false,
      airQuality: false,
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
    setGibs({
      viirsTrueColor: false,
      modisTrueColor: false,
      aerosol: false,
      ndvi: false,
      nightLights: false,
      landSurfaceTemp: false,
    });
    setIntel({
      vectors: false,
      flights: false,
      flightRoutes: false,
      fires: false,
      population: false,
      weather: false,
      airQuality: false,
      wildlife: false,
    });
  };



  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AseanMap
        embedded
        prototypeMode={prototypeMode}
        ebsOnly={ebsOnly ?? prototypeMode}
        hideSpreadRoute={hideSpreadRoute ?? prototypeMode}
        baseMap={base}
        showMarkers={markers}
        showAdmin={admin}
        countryData={choropleth ? countries : undefined}
        outbreakLocations={locations}
        markerLookbackDays={markerLookbackDays}
        bnpbLayers={bnpb}
        showWind={wind}
        highlightCountry={highlightCountry}
        borderNeighbors={borderNeighbors}
        regionLinks={regionLinks}
        hazardEvents={hazardEvents}
        showHazards={false}
        gibsLayers={gibs}
        intelLayers={intel}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        boundaryScope={boundaryScope}
        onLayerStatus={(key, status) =>
          setLayerStatus((prev) => (prev[key]?.state === status.state && prev[key]?.message === status.message ? prev : { ...prev, [key]: status }))
        }
        onSelectCountry={onSelectCountry}
      />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setSettings(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-slate-700 shadow-md transition hover:border-blue-300 hover:bg-blue-50 hover:text-[#0060A9]"
        >
          <Settings className="h-3.5 w-3.5 text-[#0060A9]" />
          <span className="text-xs font-black tracking-wide">
            {t("map.spatialControls")}
          </span>
        </button>
      </div>

      {windLegend && wind && !prototypeMode && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[320px] space-y-3 rounded-2xl border border-blue-200/90 bg-white/95 p-3.5 shadow-[0_8px_30px_rgba(0,96,169,.12)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-[#0060A9]" />
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
                <Settings className="h-4 w-4 text-[#0060A9]" />
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
                <Group title="Map Layers">
                  <Row
                    icon={<MapPin className="h-4 w-4" />}
                    title={t("map.outbreakMarkers")}
                    sub={t("map.outbreakMarkersSub")}
                    value={markers}
                    set={setMarkers}
                  />
                  <div className="ml-10 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Marker time range</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {([7, 14, 30, 90] as const).map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setMarkerLookbackDays(days)}
                          className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${markerLookbackDays === days ? "border-[#0060A9] bg-blue-50 text-[#0060A9]" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200"}`}
                        >
                          {days === 90 ? "3 Months" : `${days} Days`}
                        </button>
                      ))}
                    </div>
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
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold capitalize ${base === x ? "border-[#0060A9] bg-blue-50 text-[#0060A9]" : "border-slate-100 bg-slate-50 text-slate-600"}`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </Group>

              {!prototypeMode && (
                <>
                  {/* ── Surveillance & Vector Intelligence ── */}
                  <Group title="Surveillance & Vector Intelligence">
                    <Row
                      icon={<Plane className="h-4 w-4 text-[#0060A9]" />}
                      title="Flight Connection — Routes"
                      sub="Airports by non-stop destinations; click an airport to draw its routes with simulated aircraft (OpenFlights 2014, ODbL)"
                      value={Boolean(intel.flightRoutes)}
                      set={(v) => setIntel((p) => ({ ...p, flightRoutes: v }))}
                      status={layerStatus.flightRoutes}
                    />
                    <Row
                      icon={<Flame className="h-4 w-4 text-rose-600" />}
                      title="Active Fire Hotspots"
                      sub="NASA FIRMS VIIRS 24h (public SE Asia CSV if no MAP_KEY)"
                      value={Boolean(intel.fires)}
                      set={(v) => setIntel((p) => ({ ...p, fires: v }))}
                      status={layerStatus.fires}
                    />
                    <Row
                      icon={<Bird className="h-4 w-4 text-teal-600" />}
                      title="Wildlife / Bird Occurrences"
                      sub="GBIF bird records — avian influenza (H5N1) early warning"
                      value={Boolean(intel.wildlife)}
                      set={(v) => setIntel((p) => ({ ...p, wildlife: v }))}
                      status={layerStatus.wildlife}
                    />
                    <Row
                      icon={<Users className="h-4 w-4 text-indigo-600" />}
                      title="Population Denominators"
                      sub="WorldPop metadata + GPWv4 2020 density overlay"
                      value={Boolean(intel.population)}
                      set={(v) => setIntel((p) => ({ ...p, population: v }))}
                      status={layerStatus.population}
                    />
                    <Row
                      icon={<CloudSun className="h-4 w-4 text-sky-600" />}
                      title="Capital Weather"
                      sub="Open-Meteo current conditions at ASEAN capitals"
                      value={Boolean(intel.weather)}
                      set={(v) => setIntel((p) => ({ ...p, weather: v }))}
                      status={layerStatus.weather}
                    />
                    <Row
                      icon={<Droplets className="h-4 w-4 text-emerald-700" />}
                      title="Capital Air Quality"
                      sub="Open-Meteo / CAMS AQI, PM2.5, PM10"
                      value={Boolean(intel.airQuality)}
                      set={(v) => setIntel((p) => ({ ...p, airQuality: v }))}
                      status={layerStatus.airQuality}
                    />
                  </Group>

                  {/* ── NASA GIBS Satellite Imagery ── */}
                  <Group title="Satellite Earth Observation (NASA GIBS)">
                    <Row
                      icon={<Globe className="h-4 w-4 text-blue-500" />}
                      title="VIIRS True Color"
                      sub="SNPP satellite imagery overlay"
                      value={Boolean(gibs.viirsTrueColor)}
                      set={(v) => setGibs((p) => ({ ...p, viirsTrueColor: v }))}
                    />
                    <Row
                      icon={<Globe className="h-4 w-4 text-teal-500" />}
                      title="MODIS Terra True Color"
                      sub="Daily Terra satellite true color overlay"
                      value={Boolean(gibs.modisTrueColor)}
                      set={(v) => setGibs((p) => ({ ...p, modisTrueColor: v }))}
                    />
                    <Row
                      icon={<CloudRain className="h-4 w-4 text-amber-500" />}
                      title="Aerosol Index"
                      sub="OMPS smoke/haze aerosol index overlay"
                      value={Boolean(gibs.aerosol)}
                      set={(v) => setGibs((p) => ({ ...p, aerosol: v }))}
                    />
                    <Row
                      icon={<Layers className="h-4 w-4 text-emerald-500" />}
                      title="NDVI Vegetation Index"
                      sub="MODIS 8-day vegetation greenness"
                      value={Boolean(gibs.ndvi)}
                      set={(v) => setGibs((p) => ({ ...p, ndvi: v }))}
                    />
                    <Row
                      icon={<Sun className="h-4 w-4 text-yellow-500" />}
                      title="Nighttime Lights"
                      sub="VIIRS Black Marble urban illumination"
                      value={Boolean(gibs.nightLights)}
                      set={(v) => setGibs((p) => ({ ...p, nightLights: v }))}
                    />
                    <Row
                      icon={<Flame className="h-4 w-4 text-orange-500" />}
                      title="Land Surface Temp"
                      sub="MODIS daytime thermal climate"
                      value={Boolean(gibs.landSurfaceTemp)}
                      set={(v) => setGibs((p) => ({ ...p, landSurfaceTemp: v }))}
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
                        sub="Indonesia extent · gis.bnpb.go.id"
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
                className="w-full rounded-xl bg-[#0060A9] py-2 text-xs font-bold text-white transition hover:bg-[#004b85]"
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
        ? status.message || "Loading…"
        : status.state === "timeout"
          ? status.message || "Timed out"
          : status.state === "auth"
            ? status.message || "API key or authentication required"
            : status.state === "unavailable"
              ? status.message || "Service unavailable (503)"
              : status.state === "upstream" || status.state === "error"
                ? status.message || "Upstream error"
                : status.state === "cached"
                  ? status.message || "Cached"
                  : status.state === "empty"
                    ? status.message || "No data"
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
              ? "text-[#0060A9]"
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
        className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-[#0060A9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060A9] focus-visible:ring-offset-2"
      />
    </label>
  );
}

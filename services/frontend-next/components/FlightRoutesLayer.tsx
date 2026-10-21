"use client";

// PR 111: Flight Connection "Routes" mode (flightconnections.com style).
// Airports are dots coloured/sized by number of non-stop destinations (bands from the DB),
// clicking one draws great-circle arcs to its destinations and lists them in a side panel.
// Airports within the DB-configured radius of a recent outbreak get a red ring, and their routes
// are drawn red. That is an indication only, not a computed importation risk.

import { tr } from "@/lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import type Map from "ol/Map";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { unByKey } from "ol/Observable";
import type { FeatureLike } from "ol/Feature";
import { Plane, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { MapLayerStatus } from "@/types";
import { greatCirclePoints, bandForDegree } from "@/lib/flight-arc.mjs";
import {
  fetchFlightAirports,
  fetchFlightRoutes,
  REGION_LABELS,
  type FlightAirport,
  type FlightAirportsResponse,
  type FlightBand,
  type FlightRoutesResponse,
} from "@/lib/flight-network";

const OUTBREAK_RED = "#dc2626";
const ROUTE_BLUE = "rgba(37,99,235,0.75)";

type Props = {
  map: Map | null;
  visible: boolean;
  onStatus?: (status: MapLayerStatus) => void;
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export default function FlightRoutesLayer({ map, visible, onStatus }: Props) {
  const [region, setRegion] = useState<string>("");
  const [data, setData] = useState<FlightAirportsResponse | null>(null);
  const [routes, setRoutes] = useState<FlightRoutesResponse | null>(null);
  const [selectedIata, setSelectedIata] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const airportsLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const routesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  // PR 117: simulated aircraft along drawn arcs (visual only, not live traffic).
  const planesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const simPathsRef = useRef<number[][][]>([]);
  const bandsRef = useRef<FlightBand[]>([]);
  const selRef = useRef<{ hub: string | null; dests: Set<string> }>({ hub: null, dests: new Set() });
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  // Create the two layers once the map exists.
  useEffect(() => {
    if (!map) return;
    const styleCache: Record<string, Style> = {};
    const airportStyle = (f: FeatureLike, resolution: number) => {
      const a = f.get("airport") as FlightAirport;
      const band = bandForDegree(a.degree, bandsRef.current);
      const color = band?.color || "#64748b";
      const radius = band?.radius_px || 3;
      const { hub, dests } = selRef.current;
      const isHub = hub === a.iata;
      const isDest = dests.has(a.iata);
      const dim = Boolean(hub) && !isHub && !isDest;
      const showLabel = isHub || isDest || resolution < 2500;
      const key = `${a.iata}|${color}|${isHub}|${isDest}|${dim}|${a.near_outbreak}|${showLabel}`;
      if (styleCache[key]) return styleCache[key];
      const style = new Style({
        image: new CircleStyle({
          radius: isHub ? radius + 4 : isDest ? radius + 1 : radius,
          fill: new Fill({ color: dim ? hexToRgba(color, 0.18) : color }),
          stroke: a.near_outbreak
            ? new Stroke({ color: dim ? hexToRgba(OUTBREAK_RED, 0.35) : OUTBREAK_RED, width: isHub ? 4 : 2.5 })
            : new Stroke({ color: isHub ? "#0f172a" : dim ? "rgba(255,255,255,0.3)" : "#ffffff", width: isHub ? 3 : 1 }),
        }),
        text: showLabel && !dim
          ? new Text({
              text: a.iata,
              offsetY: -(radius + 9),
              font: isHub ? "bold 12px sans-serif" : "bold 10px sans-serif",
              fill: new Fill({ color: "#0f172a" }),
              stroke: new Stroke({ color: "#ffffff", width: 3 }),
            })
          : undefined,
        zIndex: isHub ? 3 : isDest ? 2 : a.degree / 1000,
      });
      styleCache[key] = style;
      return style;
    };
    const airportsLayer = new VectorLayer({
      source: new VectorSource(),
      style: airportStyle,
      zIndex: 62,
      visible: false,
      declutter: false,
      properties: { ownsClicks: true, name: "flight-airports" },
    });
    const routesLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 61,
      visible: false,
      style: (f) =>
        new Style({
          stroke: new Stroke({
            color: f.get("outbreak") ? OUTBREAK_RED : ROUTE_BLUE,
            width: f.get("outbreak") ? 2.2 : 1.4,
            lineDash: f.get("outbreak") ? [6, 4] : undefined,
          }),
        }),
      properties: { name: "flight-routes" },
    });
    const planeStyles: Record<string, Style> = {};
    const planesLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 63,
      visible: false,
      style: (f) => {
        const rot = Math.round(((f.get("rot") as number) || 0) * 20) / 20;
        const key = String(rot);
        if (!planeStyles[key]) {
          planeStyles[key] = new Style({
            image: new RegularShape({
              points: 3,
              radius: 6,
              rotation: rot,
              rotateWithView: true,
              fill: new Fill({ color: "#0f172a" }),
              stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
            }),
          });
        }
        return planeStyles[key];
      },
      properties: { name: "flight-sim-aircraft", simulated: true },
    });
    map.addLayer(routesLayer);
    map.addLayer(planesLayer);
    map.addLayer(airportsLayer);
    airportsLayerRef.current = airportsLayer;
    routesLayerRef.current = routesLayer;
    planesLayerRef.current = planesLayer;

    const clickKey = map.on("singleclick", (evt) => {
      if (!airportsLayer.getVisible()) return;
      let hit: FlightAirport | null = null;
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          hit = f.get("airport") as FlightAirport;
          return true;
        },
        { hitTolerance: 6, layerFilter: (l) => l === airportsLayer },
      );
      if (hit) setSelectedIata((hit as FlightAirport).iata);
    });
    const moveKey = map.on("pointermove", (evt) => {
      if (!airportsLayer.getVisible() || evt.dragging) return;
      const over = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 6, layerFilter: (l) => l === airportsLayer });
      if (over) (map.getTargetElement() as HTMLElement).style.cursor = "pointer";
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIata(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unByKey([clickKey, moveKey]);
      window.removeEventListener("keydown", onKey);
      map.removeLayer(airportsLayer);
      map.removeLayer(routesLayer);
      map.removeLayer(planesLayer);
      airportsLayerRef.current = null;
      routesLayerRef.current = null;
      planesLayerRef.current = null;
    };
  }, [map]);

  // Load airports for the region.
  useEffect(() => {
    const layer = airportsLayerRef.current;
    routesLayerRef.current?.setVisible(visible);
    layer?.setVisible(visible);
    if (!visible) {
      statusRef.current?.({ state: "idle" });
      setSelectedIata(null);
      return;
    }
    if (!layer) return;
    const ac = new AbortController();
    statusRef.current?.({ state: "loading", message: tr("skdr.flights.loading_airports_and_routes") });
    setError(null);
    fetchFlightAirports(region || undefined, { signal: ac.signal })
      .then((res) => {
        bandsRef.current = res.bands || [];
        setData(res);
        if (!region && res.region) setRegion(res.region);
        const src = layer.getSource();
        src?.clear();
        src?.addFeatures(
          (res.airports || []).map((a) => {
            const f = new Feature({ geometry: new Point(fromLonLat([a.longitude, a.latitude])) });
            f.set("airport", a);
            f.setId(a.iata);
            return f;
          }),
        );
        statusRef.current?.({
          state: res.airports?.length ? (res.cached ? "cached" : "ok") : "empty",
          count: res.airports?.length || 0,
          source: res.source,
        });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(String(err?.message || err));
        statusRef.current?.({ state: "upstream", message: String(err?.message || err) });
      });
    return () => ac.abort();
  }, [visible, region, map]);

  // Load and draw routes for the selected airport.
  useEffect(() => {
    const routesSrc = routesLayerRef.current?.getSource();
    const refresh = () => airportsLayerRef.current?.changed();
    if (!selectedIata || !visible) {
      selRef.current = { hub: null, dests: new Set() };
      routesSrc?.clear();
      simPathsRef.current = [];
      setRoutes(null);
      refresh();
      return;
    }
    const ac = new AbortController();
    selRef.current = { hub: selectedIata, dests: new Set() };
    refresh();
    fetchFlightRoutes(selectedIata, region || undefined, { signal: ac.signal })
      .then((res) => {
        setRoutes(res);
        selRef.current = { hub: res.origin.iata, dests: new Set(res.destinations.map((d) => d.iata)) };
        routesSrc?.clear();
        const o = res.origin;
        const paths: number[][][] = [];
        routesSrc?.addFeatures(
          res.destinations.map((d) => {
            const pts = greatCirclePoints(o.longitude, o.latitude, d.longitude, d.latitude, 64);
            const coords = pts.map((p) => fromLonLat(p));
            paths.push(coords);
            const f = new Feature({ geometry: new LineString(coords) });
            f.set("outbreak", o.near_outbreak || d.near_outbreak);
            return f;
          }),
        );
        simPathsRef.current = paths;
        refresh();
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(String(err?.message || err));
      });
    return () => ac.abort();
  }, [selectedIata, region, visible]);

  // PR 117: animate a few simulated aircraft along the selected airport's arcs.
  // Purely visual. Stops when the layer is off, no airport is selected, or the user prefers reduced motion.
  useEffect(() => {
    const layer = planesLayerRef.current;
    const src = layer?.getSource();
    src?.clear();
    const paths = simPathsRef.current;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!layer || !src || !visible || !routes || paths.length === 0 || reduced) {
      layer?.setVisible(false);
      return;
    }
    const maxPlanes = Math.min(8, paths.length);
    const step = paths.length / maxPlanes;
    const planes = Array.from({ length: maxPlanes }, (_, i) => {
      const path = paths[Math.floor(i * step)];
      const f = new Feature({ geometry: new Point(path[0]) });
      f.set("simulated", true);
      src.addFeature(f);
      return { f, path, offset: i / maxPlanes, periodMs: 14000 + (i % 3) * 3000 };
    });
    layer.setVisible(true);
    let raf = 0;
    const tick = (now: number) => {
      planes.forEach(({ f, path, offset, periodMs }) => {
        const t = ((now / periodMs) + offset) % 1;
        const pos = t * (path.length - 1);
        const k = Math.min(path.length - 2, Math.floor(pos));
        const a = path[k];
        const b = path[k + 1];
        const r = pos - k;
        (f.getGeometry() as Point).setCoordinates([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
        // Triangle points up by default; rotate it to face the direction of travel.
        f.set("rot", Math.atan2(b[0] - a[0], b[1] - a[1]), true);
        f.changed();
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      src.clear();
      layer.setVisible(false);
    };
  }, [routes, visible]);

  const filteredDests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = routes?.destinations || [];
    if (!q) return list;
    return list.filter((d) =>
      [d.iata, d.name, d.city, d.country_iso2].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [routes, search]);

  if (!visible) return null;
  const bands = data?.bands || [];
  const radius = data?.outbreak_radius_km;

  return (
    <div className="absolute right-4 top-16 z-30 w-[min(300px,calc(100%-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 text-slate-700 shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-bold text-slate-800">Flight Connection — Routes</span>
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Expand flight panel" : "Collapse flight panel"}
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto px-3 py-2 text-[11px]">
          <div className="flex gap-1">
            {(data?.regions || ["ASEAN", "ASEAN_PLUS_THREE", "GLOBAL"]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setSelectedIata(null);
                  setRegion(r);
                }}
                className={`flex-1 rounded-lg border px-2 py-1 font-bold ${region === r ? "border-primary bg-blue-50 text-primary" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                {REGION_LABELS[r] || r}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 font-semibold text-slate-500">Non-stop destinations</div>
            <div className="grid grid-cols-2 gap-1">
              {bands.map((b) => (
                <div key={b.code} className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full border border-white"
                    style={{ background: b.color, width: b.radius_px * 2, height: b.radius_px * 2 }}
                  />
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-start gap-1.5">
              <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border-[2.5px]" style={{ borderColor: OUTBREAK_RED }} />
              <span>
                Within {radius ?? "–"} km of a recent outbreak{data ? ` (${data.near_outbreak_count})` : ""}.
                <span className="text-slate-500"> {tr("skdr.flights.indication_only_not_a_confirmed_importat")}</span>
                <span className="mt-1 block text-slate-500" title={tr("skdr.flights.simulated_aircraft_visual_only_not_live_")}>{tr("skdr.flights.simulated_aircraft_visual_only_not_live_")}</span>
              </span>
            </div>
          </div>

          {error && <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">{error}</div>}

          {!routes && !error && (
            <div className="text-slate-500">
              {data ? tr("skdr.flights.nAirports", { count: data.total }) : tr("skdr.flights.loading")}{" "}{tr("skdr.flights.clickHint")}
            </div>
          )}

          {routes && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-bold text-slate-800">
                    {routes.origin.iata} · {routes.origin.city || routes.origin.name}
                  </div>
                  <div className="text-slate-500">{routes.origin.name}, {routes.origin.country_iso2}</div>
                  <div className="font-semibold text-primary">
                    {routes.total} destinations in {REGION_LABELS[routes.region] || routes.region}
                    {routes.total_all_regions !== routes.total ? ` (${routes.total_all_regions} worldwide)` : ""}
                  </div>
                  {routes.origin.near_outbreak && (
                    <div className="mt-0.5 flex items-center gap-1 text-[#dc2626]">
                      <AlertTriangle className="h-3 w-3" /> Near a recent outbreak (indication)
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={tr("skdr.flights.clear_selected_airport")}
                  onClick={() => setSelectedIata(null)}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("skdr.flights.search_destinations")}
                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-primary"
              />
              <ul className="divide-y divide-slate-100">
                {filteredDests.map((d) => (
                  <li key={d.iata}>
                    <button
                      type="button"
                      onClick={() => setSelectedIata(d.iata)}
                      className="flex w-full items-center justify-between gap-2 py-1 text-left hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            background: bandForDegree(d.degree, bands)?.color || "#64748b",
                            boxShadow: d.near_outbreak ? `0 0 0 2px ${OUTBREAK_RED}` : undefined,
                          }}
                        />
                        <span className="font-bold">{d.iata}</span>
                        <span className="truncate text-slate-600">{d.city || d.name}</span>
                      </span>
                      <span className="shrink-0 text-slate-400">{d.country_iso2}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-slate-100 pt-1.5 text-[10px] leading-snug text-slate-400">
            {(data?.sources || []).map((s) => (
              <div key={s.code}>{s.attribution}</div>
            ))}
            {(data?.sources || []).some((s) => s.code === "openflights_routes") && (
              <div>
                Route network as of {(data?.sources || []).find((s) => s.code === "openflights_routes")?.data_as_of}; it may differ from current schedules.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

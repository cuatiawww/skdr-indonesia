'use client'

import { tr } from "@/lib/i18n/LanguageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileArcGISRest from "ol/source/TileArcGISRest";
import { WindLayer } from "ol-wind";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke, Circle as CircleStyle, Icon, RegularShape } from "ol/style";
import { themeRgb } from "@/lib/theme";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import CircleGeom from "ol/geom/Circle";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import type { FeatureLike } from "ol/Feature";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";
import { getCenter } from "ol/extent";
import { getDistance } from "ol/sphere";
import { unByKey } from "ol/Observable";
import { defaults as defaultControls } from "ol/control";
import { X, MapPin, RotateCcw, Navigation, Activity, Skull, ChevronRight, Bug, Plane, Flame, ExternalLink, Globe } from "lucide-react";
import type {
  AnalyzeResponse,
  OutbreakLocation,
  ExternalIntelLayers,
  VectorSighting,
  LiveFlight,
  FireHotspot,
  MapLayerStatus,
  WildlifeOccurrence,
  VectorSightingsResponse,
} from "@/types";
import {
  fetchVectorSightings,
  fetchWildlifeOccurrences,
  fetchFireHotspots,
  fetchMasterCountries,
  type MasterCountry,
} from "@/lib/api";
import FlightRoutesLayer from "@/components/FlightRoutesLayer";
import { buildChoroClasses, choroClassFor, useChoroConfig, type ChoroClass, type ChoroConfig } from "@/lib/choropleth-classes";
import { adminLevelCode, countryInScope, nextAdminLevel, sameCountry } from "@/lib/map-boundary-scope.mjs";
import { classifyLayerError, statusFromPayload } from "@/lib/map-layer-client.mjs";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import DiseaseDetailPanel from "@/components/DiseaseDetailPanel";
import CountryFlag from "@/components/CountryFlag";
import RelatedArticlesPanel from "@/components/RelatedArticlesPanel";

import { ASEAN_GEOJSON } from "@/data/asean-countries";

const INDONESIA_CATALOG = [
  { id: "IDN", iso2: "ID", iso3: "IDN", name: "Indonesia", flag_code: "id", home_region: "INDONESIA", display_order: 1, is_active: true, regions: [], aliases: [] },
] as unknown as MasterCountry[];
import { PUBLIC_BASE_PATH } from "@/lib/public-path";

export type HazardEvent = {
  id?: string | number | null;
  source?: string | null;
  kind?: string | null;
  title?: string | null;
  latitude: number;
  longitude: number;
  magnitude?: number | null;
  alert_level?: string | null;
  when?: string | number | null;
  url?: string | null;
};

type Props = {
  result?: AnalyzeResponse | null;
  countryData?: { name: string; cases: number; deaths?: number }[];
  locationsData?: { name: string; cases: number; country?: string }[];
  outbreakLocations?: OutbreakLocation[];
  compact?: boolean;
  fullBleed?: boolean;
  baseMap?: "osm" | "terrain" | "satellite" | "light" | "dark";
  showAdmin?: boolean;
  showMarkers?: boolean;
  bnpbLayers?: {
    flood?: boolean;
    earthquake?: boolean;
    landslide?: boolean;
    forestFire?: boolean;
    hillshade?: boolean;
    population?: boolean;
  };
  showWind?: boolean;
  ewsRadiusKm?: number | null;
  markerLookbackDays?: 7 | 14 | 30 | 90;
  /** PR 026: when both dates are set (YYYY-MM-DD), markers follow this period instead of the rolling markerLookbackDays window. */
  markerPeriod?: MarkerPeriod | null;
  embedded?: boolean;
  highlightCountry?: string;
  borderNeighbors?: BorderNeighborShape[];
  regionLinks?: RegionBorderLink[];
  hazardEvents?: HazardEvent[];
  showHazards?: boolean;
  intelLayers?: ExternalIntelLayers;
  /** PR 027: optional custom loaders for the vectors / wildlife intel layers (e.g. period-filtered public APIs on
   *  Dasbor Zoonosis Lite). Without them the layers use the backend map-layer endpoints as before; a new `key` refetches. */
  intelLoaders?: IntelLoaders;
  onLayerStatus?: (key: string, status: MapLayerStatus) => void;
  onSelectCountry?: (country: string) => void;
  /** PR 018: reports the admin level whose polygons are coloured (1 = provinsi, 2 = kab/kota, …). */
  onAdminLevel?: (level: number) => void;
  /** PR 018: classes (quartile breaks) of the polygons currently coloured, for the legend. */
  onChoroClasses?: (classes: ChoroClass[] | null) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** PR 018: [minLon, minLat, maxLon, maxLat] of the filtered selection; the view auto-fits when it changes. */
  fitTo?: [number, number, number, number] | null;
  boundaryScope?: "asean" | "asean3" | "global" | "indonesia";
  prototypeMode?: boolean;
  ebsOnly?: boolean;
  /** PR 016: global Sumber filter (all | ebs | pe), drives the region popup split. */
  sourceMode?: "all" | "ebs" | "pe";
  hideSpreadRoute?: boolean;
};

type RegionMetric = {
  cases: number;
  deaths: number;
  eventCount: number;
  /** PR 016: per-source figures (EBS sinyal vs Kasus PE), never summed in the popup. */
  ebsSignals?: number;
  ebsCases?: number;
  ebsDeaths?: number;
  peCases?: number;
  peDeaths?: number;
};

const COUNTRY_ISO3: Record<string, string> = {
  brunei: "BRN",
  "brunei darussalam": "BRN",
  cambodia: "KHM",
  indonesia: "IDN",
  "laos": "LAO",
  "lao pdr": "LAO",
  malaysia: "MYS",
  myanmar: "MMR",
  philippines: "PHL",
  singapore: "SGP",
  thailand: "THA",
  "timor-leste": "TLS",
  "timor leste": "TLS",
  vietnam: "VNM",
  "viet nam": "VNM",
  // East Asia (+3) Dialogue Partners
  china: "CHN",
  "people's republic of china": "CHN",
  prc: "CHN",
  japan: "JPN",
  "south korea": "KOR",
  korea: "KOR",
  "republic of korea": "KOR",
};

// PR 016: canvas colours resolve the theme CSS variables at runtime (lib/theme.ts).
const HIGHLIGHT = () => themeRgb("brand-700");
const MARKER = () => themeRgb("brand-700");

export type BorderNeighborShape = {
  name: string;
  iso3?: string | null;
  crossRegion?: boolean;
};

export type RegionBorderLink = {
  regionName: string;
  neighborCountry: string;
  neighborRegion: string;
  notes?: string | null;
};

function foldPlace(value: string): string {
  return value.toLowerCase().replace(/[–—‐‑-]/g, " ").replace(/\s+/g, " ").trim();
}

function samePlace(left: string, right: string): boolean {
  const a = foldPlace(left);
  const b = foldPlace(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const strip = (value: string) => value.replace(/ (province|region|state)$/, "");
  return strip(a) === strip(b);
}

function linksForRegion(links: RegionBorderLink[], regionName: string) {
  const grouped = new globalThis.Map<string, { regions: string[]; notes: string[] }>();
  for (const link of links) {
    if (!samePlace(link.regionName, regionName)) continue;
    const row = grouped.get(link.neighborCountry) || { regions: [], notes: [] };
    if (!row.regions.includes(link.neighborRegion)) row.regions.push(link.neighborRegion);
    if (link.notes && !row.notes.includes(link.notes)) row.notes.push(link.notes);
    grouped.set(link.neighborCountry, row);
  }
  return [...grouped.entries()].map(([country, row]) => ({
    country,
    regions: row.regions,
    notes: row.notes,
  }));
}

function linksTouchingCountry(links: RegionBorderLink[], countryName: string) {
  const grouped = new globalThis.Map<string, string[]>();
  for (const link of links) {
    if (!samePlace(link.neighborCountry, countryName)) continue;
    const targets = grouped.get(link.regionName) || [];
    if (!targets.includes(link.neighborRegion)) targets.push(link.neighborRegion);
    grouped.set(link.regionName, targets);
  }
  return [...grouped.entries()].map(([region, targets]) => ({ region, targets }));
}

// Top-down aircraft silhouette (SVG) so live flights read as planes, not location dots.
let PLANE_ICON_CACHE = "";
function planeIcon(): string {
  if (PLANE_ICON_CACHE) return PLANE_ICON_CACHE;
  const plane =
    "M14 2c.8 0 1.4.9 1.4 2v6.3l8.6 5v2.2l-8.6-2.6v5.3l2.4 1.8v1.7L14 22.6l-3.8 1.1v-1.7l2.4-1.8v-5.3L4 17.5v-2.2l8.6-5V4c0-1.1.6-2 1.4-2z";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
    `<path d="${plane}" fill="#0891b2" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  PLANE_ICON_CACHE = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return PLANE_ICON_CACHE;
}

// Classic teardrop map pin (SVG) with a white glyph; the tip marks the exact location.
const PIN_ICON_CACHE: Record<string, string> = {};
function pinIcon(kind: string): string {
  if (PIN_ICON_CACHE[kind]) return PIN_ICON_CACHE[kind];
  const badges: Record<string, { bg: string; glyph: string }> = {
    bird: { bg: "#0d9488", glyph: '<path d="M9.5 14 Q12.2 9.8 15 13.3 Q17.8 9.8 20.5 14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>' },
    fire: { bg: "#ef4444", glyph: '<path d="M15 6.5c2.3 2.9 3.6 4.4 3.6 6.5a3.6 3.6 0 0 1-7.2 0c0-1.4.7-2.3 1.5-3 0 1.3.7 2.2 1.4 2.2.8 0 1-1.2.8-2.1C14.9 9 15 7.8 15 6.5z" fill="#fff"/>' },
    hospital: { bg: "#059669", glyph: '<rect x="13.4" y="8.2" width="3.2" height="10.6" rx="1" fill="#fff"/><rect x="10.2" y="11.4" width="9.6" height="3.2" rx="1" fill="#fff"/>' },
    vector: { bg: "#f59e0b", glyph: '<circle cx="15" cy="13.4" r="2.7" fill="#fff"/><path d="M15 8.2V6.4M11.3 9.7 10 8.4M18.7 9.7 20 8.4M10.9 13.4H9.1M20.9 13.4h-1.8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' },
    outbreak: { bg: "#be123c", glyph: '<circle cx="15" cy="13.4" r="3" fill="#fff"/>' },
  };
  const b = badges[kind] || badges.outbreak;
  const pin = "M15 1C8.9 1 4 5.9 4 12c0 7.6 11 25 11 25s11-17.4 11-25C26 5.9 21.1 1 15 1z";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">` +
    `<path d="${pin}" fill="${b.bg}" stroke="#ffffff" stroke-width="2"/>${b.glyph}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  PIN_ICON_CACHE[kind] = uri;
  return uri;
}

function pinStyle(kind: string): Style {
  return new Style({
    image: new Icon({
      src: pinIcon(kind),
      scale: 0.9,
      anchor: [0.5, 1],
      anchorXUnits: "fraction",
      anchorYUnits: "fraction",
    }),
  });
}

function neighborHatch(): string | CanvasPattern {
  if (typeof document === "undefined") return "rgba(251, 191, 36, 0.28)";
  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 12;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "rgba(251, 191, 36, 0.28)";
  ctx.fillStyle = "rgba(255, 247, 237, 0.78)";
  ctx.fillRect(0, 0, 12, 12);
  ctx.strokeStyle = "rgba(180, 83, 9, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(12, 0);
  ctx.moveTo(-3, 3);
  ctx.lineTo(3, -3);
  ctx.moveTo(9, 15);
  ctx.lineTo(15, 9);
  ctx.stroke();
  return ctx.createPattern(canvas, "repeat") || "rgba(251, 191, 36, 0.28)";
}

function paddedExtent(extent: number[], factor: number): number[] {
  const dx = (extent[2] - extent[0]) * factor;
  const dy = (extent[3] - extent[1]) * factor;
  return [extent[0] - dx, extent[1] - dy, extent[2] + dx, extent[3] + dy];
}

// Land borders meet. The Malacca Strait keeps Peninsular Malaysia about 20 km
// from Indonesia, so a 15 km test keeps Sabah/Sarawak and drops Penang.
const LAND_TOUCH_METERS = 15000;

function polygonParts(geometry: Geometry): Geometry[] {
  const type = geometry.getType();
  if (type === "Polygon") return [geometry];
  const nested = geometry as Geometry & { getPolygons?: () => Geometry[]; getGeometries?: () => Geometry[] };
  if (type === "MultiPolygon" && nested.getPolygons) return nested.getPolygons();
  if (nested.getGeometries) return nested.getGeometries().flatMap(polygonParts);
  return [];
}

// Bounding-box centre of a split country (Malaysia, Indonesia) falls in the sea.
// The interior of the largest land polygon is on land.
function largestLandInterior(geometries: Geometry[]): number[] | null {
  let best: (Geometry & { getArea?: () => number; getInteriorPoint?: () => Point }) | null = null;
  let bestArea = 0;
  for (const geometry of geometries) {
    for (const part of polygonParts(geometry)) {
      const polygon = part as Geometry & { getArea?: () => number; getInteriorPoint?: () => Point };
      const area = polygon.getArea?.() ?? 0;
      if (area > bestArea) {
        bestArea = area;
        best = polygon;
      }
    }
  }
  const coords = best?.getInteriorPoint?.().getCoordinates();
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  return [coords[0], coords[1]];
}

function partTouchesCountry(part: Geometry, countries: Geometry[]): boolean {
  const simple = part as Geometry & { getFlatCoordinates?: () => number[]; getStride?: () => number };
  const flat = simple.getFlatCoordinates?.();
  const stride = simple.getStride?.() || 2;
  if (!flat || flat.length < stride) return false;
  const count = Math.floor(flat.length / stride);
  const step = Math.max(1, Math.ceil(count / 700));
  for (let vertex = 0; vertex < count; vertex += step) {
    const index = vertex * stride;
    const point: [number, number] = [flat[index], flat[index + 1]];
    const here = toLonLat(point);
    for (const country of countries) {
      const nearest = toLonLat(country.getClosestPoint(point));
      if (getDistance(here, nearest) <= LAND_TOUCH_METERS) return true;
    }
  }
  return false;
}

// PR 018: classed fill from app_settings.map_choropleth (set each render by AseanMap); null = legacy graded fill.
let CHORO_CFG: ChoroConfig | null = null;
const countryClassCache = new WeakMap<object, ChoroClass[] | null>();
function countryClasses(data: { cases?: number }[] | undefined): ChoroClass[] | null {
  if (!CHORO_CFG || !data) return null;
  if (!countryClassCache.has(data)) countryClassCache.set(data, buildChoroClasses(CHORO_CFG, data.map((d) => d.cases || 0)));
  return countryClassCache.get(data) || null;
}
function hexAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

function heatFill(value: number, maximum: number, classes?: ChoroClass[] | null): string {
  if (classes?.length) return hexAlpha(choroClassFor(value, classes).color, 0.88);
  // PR 016: neutral slate choropleth (does not clash with the orange EBS / teal PE markers), graded 0.25–0.45 opacity
  // so markers and basemap stay readable. Regions without reports are almost transparent.
  if (value <= 0 || maximum <= 0) return "rgba(226, 232, 240, 0.12)";
  const intensity = Math.sqrt(Math.min(value / maximum, 1));
  return `rgba(71, 85, 105, ${(0.25 + intensity * 0.2).toFixed(3)})`;
}

function regionName(properties: Record<string, unknown>): string {
  for (const key of [
    "name",
    "shapeName",
    "NAME_1",
    "NAME_2",
    "NAME_3",
    "provinsi",
    "PROVINSI",
    "kabupaten",
    "KABUPATEN",
    "WADMPR",
    "WADMKK",
    "VARNAME_1",
  ]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return tr("skdr.amap.unknown_region");
}

function normalizedCountry(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function geometryInside(child: Geometry, parent: Geometry): boolean {
  return parent.intersectsCoordinate(getCenter(child.getExtent()));
}

/** PR 120: official IBS (MoH) points. */
const IBS_MARKER_COLOR = "#0F766E";

/** PR 026: inclusive date period (YYYY-MM-DD) used to filter outbreak markers. */
export type MarkerPeriod = { start?: string | null; end?: string | null };

/** PR 026: true when the item's date (first 10 chars, YYYY-MM-DD) lies within [start, end], inclusive. */
function isWithinPeriod(value: string | null | undefined, start: string, end: string): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= start.slice(0, 10) && day <= end.slice(0, 10);
}

function isWithinRecentWindowForDays(value: string | null | undefined, days: 7 | 14 | 30 | 90): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function fieldOrNone(value: unknown): string {
  if (value == null) return tr("skdr.amap.no_data");
  if (typeof value === "string" && !value.trim()) return tr("skdr.amap.no_data");
  if (typeof value === "number" && !Number.isFinite(value)) return tr("skdr.amap.no_data");
  if (typeof value === "boolean") return value ? tr("skdr.amap.yes") : tr("skdr.amap.no");
  return String(value);
}

function formatUnixSeconds(ts?: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return tr("skdr.amap.no_data");
  const ms = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? tr("skdr.amap.no_data") : date.toLocaleString();
}

function formatSpeedMs(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return tr("skdr.amap.no_data");
  return `${Math.round(ms)} m/s (${Math.round(ms * 3.6)} km/h)`;
}

function formatAltitudeM(m?: number | null): string {
  if (m == null || !Number.isFinite(m)) return tr("skdr.amap.no_data");
  return `${Math.round(m).toLocaleString()} m`;
}

function formatHeading(deg?: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return tr("skdr.amap.no_data");
  return `${Math.round(deg)}°`;
}

function layerOutcome(
  count: number,
  source?: string,
  error?: string | null,
  payload?: {
    status?: string;
    cached?: boolean;
    stale?: boolean;
    fromCache?: boolean;
  },
): MapLayerStatus {
  return statusFromPayload(count, {
    source,
    error: error || undefined,
    status: payload?.status,
    cached: payload?.cached,
    stale: payload?.stale,
    fromCache: payload?.fromCache,
  }) as MapLayerStatus;
}

function statusFromCatch(err: unknown): MapLayerStatus {
  const classified = classifyLayerError(err);
  if (classified.aborted) {
    return { state: "idle" };
  }
  return classified as MapLayerStatus;
}

/** PR 027: `wildlife` resolves to a GBIF occurrence-search payload ({ results: [...] }). */
export type IntelLoaders = {
  key?: string;
  vectors?: (signal: AbortSignal) => Promise<VectorSightingsResponse>;
  wildlife?: (signal: AbortSignal) => Promise<{ results?: any[]; source?: string; error?: string; status?: string; cached?: boolean; stale?: boolean }>;
};

export default function AseanMap({
  onAdminLevel,
  onChoroClasses,

  result,
  countryData,
  locationsData,
  outbreakLocations,
  compact,
  fullBleed,
  baseMap = "osm",
  showAdmin = true,
  showMarkers = true,
  bnpbLayers,
  showWind,
  ewsRadiusKm,
  markerLookbackDays = 30,
  markerPeriod,
  embedded,
  highlightCountry,
  borderNeighbors,
  regionLinks,
  intelLayers,
  intelLoaders,
  hazardEvents,
  showHazards = true,
  onLayerStatus,
  onSelectCountry,
  initialCenter,
  initialZoom,
  fitTo,
  boundaryScope,
  prototypeMode = false,
  ebsOnly = false,
  sourceMode = "all",
  hideSpreadRoute = false,
}: Props) {
  const isEbsOnly = prototypeMode || ebsOnly;
  const isNoSpread = prototypeMode || hideSpreadRoute;
  const effectiveOutbreaks = useMemo(() => {
    if (isEbsOnly) {
      return (outbreakLocations || []).filter((l) => (l.source_type || "").toUpperCase() !== "IBS");
    }
    return outbreakLocations || [];
  }, [outbreakLocations, isEbsOnly]);

  const { t, locale, translateDisease } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorRef = useRef<VectorLayer<VectorSource> | null>(null);
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const hazardRef = useRef<VectorLayer<VectorSource> | null>(null);
  const regionRef = useRef<VectorLayer<VectorSource> | null>(null);
  const currentCountryBoundaryRef = useRef<VectorLayer<VectorSource> | null>(null);
  const neighborBoundaryRef = useRef<VectorLayer<VectorSource> | null>(null);
  const spreadLinksRef = useRef<VectorLayer<VectorSource> | null>(null);
  const flowRef = useRef<VectorLayer<VectorSource> | null>(null);
  const [countryOutlineTick, setCountryOutlineTick] = useState(0);
  const tileRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const bnpbRef = useRef<Record<string, TileLayer<TileArcGISRest>>>({});
  const vectorSightingsRef = useRef<VectorLayer<VectorSource> | null>(null);
  const intelLoadersRef = useRef<IntelLoaders | undefined>(intelLoaders);
  intelLoadersRef.current = intelLoaders;
  const wildlifeRef = useRef<VectorLayer<VectorSource> | null>(null);
  const flightsRef = useRef<VectorLayer<VectorSource> | null>(null);
  const firesRef = useRef<VectorLayer<VectorSource> | null>(null);
  const statusCbRef = useRef(onLayerStatus);
  useEffect(() => {
    statusCbRef.current = onLayerStatus;
  }, [onLayerStatus]);
  const reportStatus = (key: string, status: MapLayerStatus) => {
    statusCbRef.current?.(key, status);
  };

  const [selectedIntel, setSelectedIntel] = useState<
    | { type: "vector_sighting"; data: VectorSighting }
    | { type: "live_flight"; data: LiveFlight }
    | { type: "fire_hotspot"; data: FireHotspot }
    | { type: "hazard_event"; data: HazardEvent }
    | null
  >(null);
  const radiusRef = useRef<VectorLayer<VectorSource> | null>(null);
  const windRef = useRef<any>(null);

  const [selected, setSelected] = useState<{
    name: string;
    totalCases: number;
    locations: { name: string; cases: number }[];
  } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<OutbreakLocation | null>(null);
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  useEffect(() => {
    setIsNavigating(false);
  }, [selected]);
  const [selectedRegion, setSelectedRegion] = useState<{
    metric?: RegionMetric;
    name: string;
    country: string;
    cases: number;
    deaths: number;
    eventCount: number;
    adminLevel?: number;
  } | null>(null);
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
    lines: { label: string; value: string; note?: string }[];
    empty: string;
  } | null>(null);
  const hoverKeyRef = useRef("");
  const hoverCardRef = useRef<HTMLDivElement | null>(null);
  // Disease spread flow: a disease picked by clicking one of its events; traces how it
  // spread from mapped location to location over time (from the crawled articles).
  const [flowDisease, setFlowDisease] = useState<string | null>(null);
  // Cross-border disease matrix popup (click a spread hub/node).
  const [spreadPopup, setSpreadPopup] = useState<{
    x: number;
    y: number;
    country: string;
    isHub: boolean;
    neighbors: string[];
  } | null>(null);
  const [adminDrill, setAdminDrill] = useState<{ iso3: string; countryName: string; level: number } | null>(null);
  const choroCfg = useChoroConfig();
  CHORO_CFG = choroCfg;
  const onChoroRef = useRef(onChoroClasses);
  onChoroRef.current = onChoroClasses;
  useEffect(() => { onAdminLevel?.(adminDrill?.level || 1); }, [adminDrill?.level, onAdminLevel]);
  useEffect(() => { vectorRef.current?.changed(); regionRef.current?.changed(); }, [choroCfg]);
  const [adminCrumbs, setAdminCrumbs] = useState<{ name: string; level: number }[]>([]);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [boundaryStatus, setBoundaryStatus] = useState<string | null>(null);
  const [catalogTick, setCatalogTick] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  // PR 117: docked disease panel. Keep the last disease mounted so the panel can slide out.
  const [panelDisease, setPanelDisease] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => { if (flowDisease) setPanelDisease(flowDisease); }, [flowDisease]);
  // PR 134: map point whose related news is highlighted in the Disease Detail panel.
  // Set on a marker click; cleared when the panel closes or the selection is cleared.
  const [newsFocus, setNewsFocus] = useState<OutbreakLocation | null>(null);
  useEffect(() => { if (!flowDisease) setNewsFocus(null); }, [flowDisease]);
  useEffect(() => { if (!selectedLocation) setNewsFocus(null); }, [selectedLocation]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const panelDocked = !!flowDisease && isDesktop;
  const DOCK_W = 320;
  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.updateSize(), 320);
    return () => window.clearTimeout(id);
  }, [panelDocked]);
  const drillParentRef = useRef<Geometry | null>(null);
  const drillGeomRef = useRef<Record<number, Geometry | null>>({});
  const skipOutlineFitRef = useRef(false);
  const catalogRef = useRef<MasterCountry[]>([]);

  const latestPropsRef = useRef({ countryData, outbreakLocations: effectiveOutbreaks, locationsData, onSelectCountry });
  const regionLinksRef = useRef<RegionBorderLink[]>(regionLinks || []);
  const adminCrumbsRef = useRef<{ name: string; level: number }[]>([]);
  useEffect(() => {
    latestPropsRef.current = { countryData, outbreakLocations: effectiveOutbreaks, locationsData, onSelectCountry };
  }, [countryData, effectiveOutbreaks, locationsData, onSelectCountry]);
  useEffect(() => {
    regionLinksRef.current = regionLinks || [];
  }, [regionLinks]);
  useEffect(() => {
    adminCrumbsRef.current = adminCrumbs;
  }, [adminCrumbs]);

  function iso3For(name?: string | null): string | undefined {
    const key = normalizedCountry(name);
    if (!key) return undefined;
    if (COUNTRY_ISO3[key]) return COUNTRY_ISO3[key];
    const row = catalogRef.current.find(
      (country) =>
        sameCountry(country.name, name) ||
        country.iso3.toLowerCase() === key ||
        (country.aliases || []).some((alias) => sameCountry(alias.alias, name)),
    );
    return row?.iso3;
  }

  useEffect(() => {
    if (!boundaryScope || !mapReady) return;
    const source = vectorRef.current?.getSource();
    if (!source) return;
    let cancelled = false;
    setBoundaryStatus(tr("skdr.amap.loading_country_boundaries"));
    if (boundaryScope !== "asean") source.clear();

    const run = async () => {
      let catalog: MasterCountry[] = [];
      try {
        // SKDR: Indonesia only (no country master API).
        catalog = INDONESIA_CATALOG;
      } catch {
        catalog = [];
      }
      if (cancelled) return;
      catalogRef.current = catalog;
      setCatalogTick((value) => value + 1);

      const response = await fetch(`${PUBLIC_BASE_PATH}/data/master-country-adm0.geojson`);
      if (!response.ok) throw new Error(`Country polygon HTTP ${response.status}`);
      const payload = await response.json();
      let features = new GeoJSON().readFeatures(payload, { featureProjection: "EPSG:3857" }) as Feature[];
      const scoped = catalog.length ? catalog.filter((country) => countryInScope(country, boundaryScope)) : [];
      if (scoped.length) {
        const allowed = new Set(scoped.map((country) => country.iso3));
        features = features.filter((feature) => allowed.has(String(feature.get("iso3") || "")));
        features.forEach((feature) => {
          const row = scoped.find((country) => country.iso3 === feature.get("iso3"));
          if (row) feature.set("name", row.name);
        });
        const present = new Set(features.map((feature) => String(feature.get("iso3") || "")));
        const missing = scoped.filter((country) => country.iso3 && !present.has(country.iso3));
        const extras = await Promise.all(
          missing.map(async (country) => {
            const adm = await fetch(`${PUBLIC_BASE_PATH}/boundaries?country=${country.iso3}&level=ADM0`);
            if (!adm.ok) return [];
            const body = await adm.json();
            if (!body?.geojson) return [];
            const loaded = new GeoJSON().readFeatures(body.geojson, { featureProjection: "EPSG:3857" }) as Feature[];
            loaded.forEach((feature) => {
              feature.set("name", country.name);
              feature.set("iso3", country.iso3);
            });
            return loaded;
          }),
        );
        features = features.concat(extras.flat());
      } else if (boundaryScope !== "global") {
        if (!cancelled) setBoundaryStatus(null);
        return;
      }

      if (cancelled) return;
      source.clear();
      source.addFeatures(features);
      setBoundaryStatus(null);
      const focusName = normalizedCountry(highlightCountry);
      const focus = focusName
        ? features.find((feature) => sameCountry(String(feature.get("name") || ""), focusName))
        : undefined;
      const extent = focus?.getGeometry()?.getExtent() || (!initialCenter ? source.getExtent() : null);
      if (extent && extent.every(Number.isFinite)) {
        mapRef.current?.getView().fit(extent, {
          padding: [48, 48, 48, 48],
          duration: 450,
          maxZoom: focus ? 6 : boundaryScope === "global" ? 3 : 5,
        });
      }
    };

    void run().catch(() => {
      if (!cancelled) setBoundaryStatus(null);
    });
    return () => {
      cancelled = true;
    };
  }, [boundaryScope, mapReady]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;

    const vectorSrc = new VectorSource({
      features: new GeoJSON().readFeatures(ASEAN_GEOJSON, {
        featureProjection: "EPSG:3857",
      }),
    });

    const vectorLayer = new VectorLayer({
      source: vectorSrc,
      style: (f: FeatureLike) => {
        const name = String(f.get("name") || "").toLowerCase();
        const item = countryData?.find((d) => sameCountry(d.name, name));
        const maximum = Math.max(...(countryData || []).map((d) => d.cases || 0), 0);
        const fill = heatFill(item?.cases || 0, maximum, countryClasses(countryData));
        return new Style({
          fill: new Fill({ color: fill }),
          // PR 016: one thin neutral outline; deaths are no longer drawn as a second crimson dashed border.
          stroke: new Stroke({ color: "rgba(100, 116, 139, 0.55)", width: 0.7 }),
        });
      },
    });
    vectorRef.current = vectorLayer;

    const currentCountryBoundaryLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 12,
      style: new Style({
        // PR 016: outline only (no second fill stacked on the choropleth).
        stroke: new Stroke({ color: themeRgb("brand-700", 0.7), width: 1.2 }),
      }),
    });
    currentCountryBoundaryRef.current = currentCountryBoundaryLayer;

    const neighborBoundaryLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 8,
      style: new Style({
        fill: new Fill({ color: neighborHatch() }),
        stroke: new Stroke({ color: "#d97706", width: 2.2, lineDash: [8, 5] }),
      }),
    });
    neighborBoundaryRef.current = neighborBoundaryLayer;

    // Spread connectors: red lines radiating from the focused country (hub) to each land
    // neighbour, with a hub node and destination nodes. Populated by the neighbour effect.
    const spreadLinksLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 13,
      style: (f: FeatureLike) => {
        const kind = String(f.get("spreadKind") || "");
        if (kind === "hub") {
          return new Style({
            image: new CircleStyle({
              radius: 7,
              fill: new Fill({ color: themeRgb("brand-700") }),
              stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
            }),
          });
        }
        if (kind === "node") {
          return new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: "#1d4ed8" }),
              stroke: new Stroke({ color: "#ffffff", width: 2 }),
            }),
          });
        }
        // link line
        const hasSpread = Boolean(f.get("hasSpread"));
        return new Style({
          stroke: new Stroke({
            color: hasSpread ? "rgba(225,29,72,0.75)" : "rgba(244,114,182,0.6)",
            width: hasSpread ? 2.2 : 1.4,
          }),
        });
      },
    });
    spreadLinksRef.current = spreadLinksLayer;

    // Disease spread flow: chronological from→to connectors for one disease.
    const flowLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 14,
      style: (f: FeatureLike) => {
        const kind = String(f.get("flowKind") || "");
        if (kind === "origin") {
          return new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color: "#16a34a" }),
              stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
            }),
          });
        }
        if (kind === "node") {
          return new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: "#ea580c" }),
              stroke: new Stroke({ color: "#ffffff", width: 1.8 }),
            }),
          });
        }
        return new Style({
          stroke: new Stroke({ color: "rgba(234,88,12,0.8)", width: 2.2 }),
        });
      },
    });
    flowRef.current = flowLayer;

    const regionSource = new VectorSource();
    const regionLayer = new VectorLayer({
      source: regionSource,
      visible: false,
      zIndex: 11,
      style: (f: FeatureLike) => {
        const metric = (f.get("regionMetric") as RegionMetric | undefined) || {
          cases: 0,
          deaths: 0,
          eventCount: 0,
        };
        const maximum = Number(f.get("regionMaximumCases")) || 0;
        return new Style({
          fill: new Fill({ color: heatFill(metric.cases, maximum, f.get("regionClasses") as ChoroClass[] | null) }),
          stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 0.5 }),
        });
      },
    });
    regionRef.current = regionLayer;

    const markerSrc = new VectorSource();

    // Pre-allocated cached styles to eliminate GC pressure and main thread stalls
    const normalExactStyle = [new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: themeRgb("brand-700") }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    })];

    const normalApproxStyle = [new Style({
      image: new CircleStyle({
        radius: 5.5,
        fill: new Fill({ color: themeRgb("brand-700") }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    })];

    const hotExactStyle = [
      new Style({
        image: new CircleStyle({
          radius: 15,
          fill: new Fill({ color: themeRgb("brand-700", 0.16) }),
          stroke: new Stroke({ color: themeRgb("brand-700", 0.45), width: 1.5 }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: themeRgb("brand-700", 0.28) }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: themeRgb("brand-700") }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      }),
    ];

    const hotApproxStyle = [
      new Style({
        image: new CircleStyle({
          radius: 13,
          fill: new Fill({ color: themeRgb("brand-700", 0.16) }),
          stroke: new Stroke({ color: themeRgb("brand-700", 0.45), width: 1.5 }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 9,
          fill: new Fill({ color: themeRgb("brand-700", 0.28) }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 5.5,
          fill: new Fill({ color: themeRgb("brand-700") }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      }),
    ];

    const nationalStyles: Record<string, Style[]> = {};
    const nationalStyle = (color: string) => {
      const cached = nationalStyles[color];
      if (cached) return cached;
      const styles = [new Style({
        image: new CircleStyle({
          radius: 11,
          fill: new Fill({ color: "rgba(255, 255, 255, 0.55)" }),
          stroke: new Stroke({ color, width: 3 }),
        }),
      }), new Style({
        image: new CircleStyle({ radius: 3, fill: new Fill({ color }) }),
      })];
      nationalStyles[color] = styles;
      return styles;
    };
    const ibsStyle = [new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: IBS_MARKER_COLOR }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    })];

    // PR 016: EBS = orange circle, Kasus PE = teal diamond (shape + colour, colour-blind safe).
    // Larger, with a white halo and a faint dark ring so they stay visible on any polygon fill.
    const ebsStyle = [
      new Style({ image: new CircleStyle({ radius: 10.5, fill: new Fill({ color: "rgba(255,255,255,0)" }), stroke: new Stroke({ color: "rgba(15,23,42,0.35)", width: 1 }) }) }),
      new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: themeRgb("src-ebs") }), stroke: new Stroke({ color: "#ffffff", width: 2.5 }) }) }),
    ];
    const peStyle = [
      new Style({ image: new RegularShape({ points: 4, radius: 13.5, angle: 0, fill: new Fill({ color: "rgba(255,255,255,0)" }), stroke: new Stroke({ color: "rgba(15,23,42,0.35)", width: 1 }) }) }),
      new Style({ image: new RegularShape({ points: 4, radius: 11, angle: 0, fill: new Fill({ color: themeRgb("src-pe") }), stroke: new Stroke({ color: "#ffffff", width: 2.5 }) }) }),
    ];
    const getMarkerStyle = (f: FeatureLike) => {
      const exact = f.get("type") === "exact";
      const srcType = String(f.get("srcType") || "");
      if (f.get("national") !== true && srcType === "PE") return peStyle;
      if (f.get("national") !== true && srcType === "EBS") return ebsStyle;
      const isHot = f.get("isHot") === true;
      const ibs = f.get("ibs") === true;
      if (f.get("national") === true) return nationalStyle(ibs ? IBS_MARKER_COLOR : themeRgb("brand-700"));
      if (ibs) return ibsStyle;
      if (isHot) {
        return exact ? hotExactStyle : hotApproxStyle;
      }
      return exact ? normalExactStyle : normalApproxStyle;
    };

    const markerLayer = new VectorLayer({
      source: markerSrc,
      // PR 016: markers sit above every polygon layer (region 11, country outline 12, links/flow 13–14).
      zIndex: 40,
      style: getMarkerStyle,
    });
    markerRef.current = markerLayer;

    const hazardLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 21,
      style: (f: FeatureLike) => {
        const source = String(f.get("source") || "");
        const color = source === "usgs" ? "#ea580c" : "#be123c";
        return new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        });
      },
    });
    hazardRef.current = hazardLayer;

    const radiusLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 19,
    });
    radiusRef.current = radiusLayer;

    const tileLayer = new TileLayer({
      source: new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: "anonymous" }),
      opacity: fullBleed ? 1 : 0.35,
    });
    tileRef.current = tileLayer;
    // ── External Intel Vector Layers ─────────────────────────
    const vectorSightingsLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 22,
      style: () => pinStyle("vector"),
    });
    vectorSightingsRef.current = vectorSightingsLayer;

    // GBIF wildlife (bird) occurrences — zoonotic / avian influenza early warning.
    const wildlifeLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 23,
      style: () => pinStyle("bird"),
    });
    wildlifeRef.current = wildlifeLayer;

    const flightsLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 23,
      style: (f: FeatureLike) => {
        const heading = Number(f.get("intelData")?.heading);
        return new Style({
          image: new Icon({
            src: planeIcon(),
            scale: 0.95,
            rotateWithView: true,
            rotation: Number.isFinite(heading) ? (heading * Math.PI) / 180 : 0,
          }),
        });
      },
    });
    flightsRef.current = flightsLayer;

    const firesLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 24,
      style: () => pinStyle("fire"),
    });
    firesRef.current = firesLayer;

    const makeBnpb = (key: string, url: string, opacity = 0.58) => {
      const layer = new TileLayer({
        source: new TileArcGISRest({ url }),
        visible: false,
        opacity,
        zIndex: 5,
      });
      bnpbRef.current[key] = layer;
      return layer;
    };
    const externalLayers = [
      makeBnpb(
        "hillshade",
        "https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer",
        0.45,
      ),
      makeBnpb(
        "population",
        "https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer",
        0.5,
      ),
      makeBnpb(
        "flood",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer",
      ),
      makeBnpb(
        "earthquake",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer",
        0.65,
      ),
      makeBnpb(
        "landslide",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer",
      ),
      makeBnpb(
        "forestFire",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer",
      ),
    ];

    const map = new Map({
      target: el.current,
      layers: [
        tileLayer,
        ...externalLayers,
        vectorLayer,
        neighborBoundaryLayer,
        spreadLinksLayer,
        flowLayer,
        currentCountryBoundaryLayer,
        regionLayer,
        radiusLayer,
        markerLayer,
        hazardLayer,
        vectorSightingsLayer,
        wildlifeLayer,
        flightsLayer,
        firesLayer,
      ],
      view: new View({
        center: fromLonLat(initialCenter || [110, 2]),
        zoom: initialZoom ?? 4,
        minZoom: 2,
        maxZoom: 16,
      }),
      controls: defaultControls({ attribution: false, zoomOptions: { zoomInTipLabel: t("skdr.map.zoomIn"), zoomOutTipLabel: t("skdr.map.zoomOut") }, rotateOptions: { tipLabel: t("skdr.map.resetRotation") } }),
    });

    const clickKey = map.on("singleclick", (evt) => {
      // PR 111: layers that handle their own clicks (Flight Connection airports) win.
      if (map.forEachFeatureAtPixel(evt.pixel, () => true, { hitTolerance: 6, layerFilter: (l) => Boolean(l.get("ownsClicks")) && l.getVisible() })) return;
      const intelHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          intelHits.push(f);
          return true;
        },
        {
          hitTolerance: 10,
          layerFilter: (l) =>
            l === vectorSightingsLayer ||
            l === wildlifeLayer ||
            l === flightsLayer ||
            l === firesLayer ||
            l === hazardLayer,
        },
      );

      if (intelHits.length > 0) {
        const f = intelHits[0];
        const intelType = f.get("intelType");
        const intelData = f.get("intelData");
        const hazard = f.get("hazard") as HazardEvent | undefined;
        if (intelType && intelData) {
          setSelected(null);
          setSelectedRegion(null);
          setSelectedLocation(null);
          setSelectedIntel({ type: intelType, data: intelData });
          return;
        }
        if (hazard) {
          setSelected(null);
          setSelectedRegion(null);
          setSelectedLocation(null);
          setSelectedIntel({ type: "hazard_event", data: hazard });
          return;
        }
      }

      // Spread hub/node → cross-border disease matrix popup.
      const spreadHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          spreadHits.push(f);
          return true;
        },
        { hitTolerance: 9, layerFilter: (l) => l === spreadLinksLayer },
      );
      const spreadFeat = spreadHits.find(
        (f) => f.get("spreadKind") === "hub" || f.get("spreadKind") === "node",
      );
      if (spreadFeat) {
        const isHub = spreadFeat.get("spreadKind") === "hub";
        const country = String(spreadFeat.get("borderName") || "");
        const neighborNames = (spreadLinksLayer.getSource()?.getFeatures() || [])
          .filter((f) => f.get("spreadKind") === "node")
          .map((f) => String(f.get("borderName") || ""))
          .filter(Boolean);
        setHoverCard(null);
        setSpreadPopup({ x: evt.pixel[0], y: evt.pixel[1], country, isHub, neighbors: neighborNames });
        return;
      }

      const markerHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          markerHits.push(f);
          return true;
        },
        { hitTolerance: 10, layerFilter: (l) => l === markerLayer },
      );

      const clickedLocation = markerHits[0]?.get("location") as OutbreakLocation | undefined;
      if (clickedLocation) {
        setSelected(null);
        setSelectedRegion(null);
        setSelectedIntel(null);
        setSelectedLocation(clickedLocation);
        setNewsFocus(clickedLocation);
        if (clickedLocation.disease && !isNoSpread) setFlowDisease(clickedLocation.disease);
        if (latestPropsRef.current.onSelectCountry && clickedLocation.country) {
          latestPropsRef.current.onSelectCountry(clickedLocation.country);
        }
        return;
      }

      const regionHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          regionHits.push(f);
          return true;
        },
        { hitTolerance: 8, layerFilter: (l) => l === regionLayer },
      );
      if (regionHits.length > 0) {
        const feature = regionHits[0];
        const metric = (feature.get("regionMetric") as RegionMetric | undefined) || {
          cases: 0,
          deaths: 0,
          eventCount: 0,
        };
        const regionCountry = String(feature.get("regionCountry") || "");
        const unitName = String(feature.get("regionName") || tr("skdr.amap.region"));
        const clickedLevel = Number(feature.get("adminLevel") || 1);
        const nextLevel = nextAdminLevel(clickedLevel);
        const geometry = (feature as Feature<Geometry>).getGeometry();
        const iso3 = String(feature.get("iso3") || iso3For(regionCountry) || "");
        skipOutlineFitRef.current = true;
        if (geometry) {
          map.getView().fit(geometry.getExtent(), {
            duration: 450,
            padding: [48, 400, 48, 48],
            maxZoom: Math.min(8 + clickedLevel, 14),
          });
        }
        if (nextLevel && geometry && iso3) {
          const clone = geometry.clone();
          drillGeomRef.current[clickedLevel] = clone;
          drillParentRef.current = clone;
          setAdminCrumbs((prev) => [
            ...prev.filter((crumb) => crumb.level < clickedLevel),
            { name: unitName, level: clickedLevel },
          ]);
          setAdminDrill({ iso3, countryName: regionCountry, level: nextLevel });
        } else {
          setAdminNote(tr("skdr.amap.lowest_admin_boundary"));
        }
        setSelected(null);
        setSelectedLocation(null);
        setSelectedIntel(null);
        setSelectedRegion({
          name: unitName,
          country: regionCountry,
          metric,
          cases: metric.cases,
          deaths: metric.deaths,
          eventCount: metric.eventCount,
          adminLevel: clickedLevel,
        });
        if (latestPropsRef.current.onSelectCountry && regionCountry) {
          latestPropsRef.current.onSelectCountry(regionCountry);
        }
        return;
      }

      const hits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          hits.push(f);
          return true;
        },
        { hitTolerance: 8, layerFilter: (l) => l === vectorLayer },
      );

      if (hits.length === 0) {
        setSelected(null);
        setSelectedRegion(null);
        setSelectedLocation(null);
        setSelectedIntel(null);
        setAdminDrill(null);
        setAdminCrumbs([]);
        setAdminNote(null);
        drillParentRef.current = null;
        return;
      }

      const name = hits[0].get("name") as string;
      const { countryData: curCountryData, outbreakLocations: curOutbreaks, locationsData: curLocs } = latestPropsRef.current;
      const item = curCountryData?.find((d) => sameCountry(d.name, name));
      
      const matchingOutbreaks = curOutbreaks?.filter(
        (l) => sameCountry(l.country, name)
      ) ?? [];

      const locs = (curLocs && curLocs.length > 0)
        ? curLocs.filter((l) => sameCountry(l.country, name))
        : matchingOutbreaks.map((l) => ({
            name: l.location_name || l.disease || tr("skdr.amap.monitored_location"),
            cases: l.cases || 1,
          }));

      const totalCases = (item && item.cases > 0)
        ? item.cases
        : matchingOutbreaks.reduce((sum, cur) => sum + (cur.cases || 1), 0);

      const iso3 = String(hits[0].get("iso3") || iso3For(name) || "");
      skipOutlineFitRef.current = false;
      drillParentRef.current = null;
      drillGeomRef.current = {};
      setAdminCrumbs([]);
      setAdminNote(null);
      if (iso3) setAdminDrill({ iso3, countryName: name, level: 1 });
      setSelected({
        name,
        totalCases,
        locations: locs.sort((a, b) => b.cases - a.cases),
      });
      setSelectedRegion(null);
      setSelectedLocation(null);
      setSelectedIntel(null);

      if (latestPropsRef.current.onSelectCountry && name) {
        latestPropsRef.current.onSelectCountry(name);
      }

      const geom = (hits[0] as Feature<Geometry>).getGeometry();
      if (geom) {
        const outline = currentCountryBoundaryRef.current?.getSource();
        if (outline) {
          outline.clear();
          outline.addFeature(new Feature(geom.clone()));
        }
        map.getView().fit(geom.getExtent(), {
          duration: 450,
          padding: [60, 400, 60, 60],
          maxZoom: 6,
        });
      }
    });

    const hoverKey = map.on("pointermove", (evt) => {
      if (evt.dragging) {
        if (hoverKeyRef.current) {
          hoverKeyRef.current = "";
          setHoverCard(null);
        }
        return;
      }
      const hit = map.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 8,
        layerFilter: (l) =>
          l === vectorLayer ||
          l === regionLayer ||
          l === neighborBoundaryLayer ||
          l === markerLayer ||
          l === vectorSightingsLayer ||
          l === flightsLayer ||
          l === firesLayer ||
          l === hazardLayer,
      });
      (map.getTargetElement() as HTMLElement).style.cursor = hit
        ? "pointer"
        : "";

      const regionHit = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => feature,
        { hitTolerance: 8, layerFilter: (l) => l === regionLayer },
      );
      const neighborHit = regionHit
        ? null
        : map.forEachFeatureAtPixel(
            evt.pixel,
            (feature) => feature,
            { hitTolerance: 8, layerFilter: (l) => l === neighborBoundaryLayer },
          );
      if (!regionHit && !neighborHit) {
        if (hoverKeyRef.current) {
          hoverKeyRef.current = "";
          setHoverCard(null);
        }
        return;
      }

      const links = regionLinksRef.current;
      let key = "";
      let title = "";
      let subtitle = "";
      let lines: { label: string; value: string; note?: string }[] = [];
      let empty = tr("skdr.amap.no_cross_border_province_pair_for_this_u");
      if (regionHit) {
        const unit = String(regionHit.get("regionName") || tr("skdr.amap.region"));
        const country = String(regionHit.get("regionCountry") || "");
        const level = Number(regionHit.get("adminLevel") || 1);
        const parent = level > 1
          ? adminCrumbsRef.current.find((crumb) => crumb.level === 1)?.name || ""
          : unit;
        const touches = linksForRegion(links, parent || unit);
        key = `region:${country}:${level}:${unit}`;
        title = unit;
        subtitle = level > 1 && parent
          ? `${country} · ${adminLevelCode(level)} inside ${parent}`
          : `${country} · ${adminLevelCode(level)}`;
        lines = touches.map((row) => ({
          label: row.country,
          value: row.regions.join(", "),
          note: row.notes[0],
        }));
        if (level > 1 && parent) empty = tr("skdr.amap.noAcross", { parent });
      } else if (neighborHit) {
        const country = String(neighborHit.get("borderName") || tr("skdr.amap.neighbor"));
        const touched = linksTouchingCountry(links, country);
        key = `neighbor:${country}`;
        title = country;
        subtitle = tr("skdr.amap.land_neighbor");
        lines = touched.map((row) => ({
          label: row.region,
          value: row.targets.join(", "),
        }));
        empty = tr("skdr.amap.no_home_province_in_the_matrix_touches_t");
      }
      const [x, y] = evt.pixel;
      const box = el.current?.getBoundingClientRect();
      let left = x + 16;
      let top = y + 16;
      if (box && left > box.width - 290) left = Math.max(8, x - 296);
      if (box && top > box.height - 180) top = Math.max(8, y - 168);
      if (hoverKeyRef.current === key && hoverCardRef.current) {
        hoverCardRef.current.style.left = `${left}px`;
        hoverCardRef.current.style.top = `${top}px`;
        return;
      }
      hoverKeyRef.current = key;
      setHoverCard({ x: left, y: top, title, subtitle, lines, empty });
    });

    mapRef.current = map;
    setMapReady(true);
    const mapTarget = map.getTargetElement() as HTMLElement;
    const leaveHover = () => {
      if (!hoverKeyRef.current) return;
      hoverKeyRef.current = "";
      setHoverCard(null);
    };
    mapTarget.addEventListener("pointerleave", leaveHover);

    // Dynamically update OpenLayers canvas size when container dimensions change
    let resizeObserver: ResizeObserver | null = null;
    if (el.current && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        map.updateSize();
      });
      resizeObserver.observe(el.current);
    }

    return () => {
      resizeObserver?.disconnect();
      mapTarget.removeEventListener("pointerleave", leaveHover);
      unByKey([clickKey, hoverKey]);
      map.setTarget(undefined);
      if (windRef.current) {
        try {
          windRef.current.setVisible?.(false);
          windRef.current.stop?.();
          windRef.current.dispose?.();
        } catch {}
        windRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (windRef.current) {
      windRef.current.setVisible?.(showWind);
      if (showWind) windRef.current.start?.();
      else windRef.current.stop?.();
      return;
    }
    if (!showWind) return;
    let cancelled = false;
    const start = async () => {
      try {
        const response = await fetch(`${PUBLIC_BASE_PATH}/wind-data`);
        if (!response.ok || cancelled) return;
        const windData = await response.json();
        const layer = new WindLayer(
          windData as any,
          {
            zIndex: 18,
            windOptions: {
              velocityScale: 0.015,
              paths: 350,
              colorScale: [
                "rgb(15,60,140)",
                "rgb(70,150,145)",
                "rgb(85,160,115)",
                "rgb(215,195,60)",
                "rgb(210,125,35)",
                "rgb(185,35,10)",
                "rgb(155,8,12)",
              ],
              lineWidth: 2.2,
              generateParticleOption: true,
            },
            fieldOptions: { wrapX: true },
          } as any,
        );
        map.addLayer(layer as any);
        windRef.current = layer;
        layer.setVisible?.(true);
        (layer as any).start?.();
      } catch {}
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [showWind]);

  useEffect(() => {
    const layer = tileRef.current;
    if (!layer) return;
    const sources = {
      osm: () => new OSM({ url: `${PUBLIC_BASE_PATH}/osm-tiles/{z}/{x}/{y}.png`, crossOrigin: "anonymous" }),
      terrain: () =>
        new XYZ({
          url: "https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
      satellite: () =>
        new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
        }),
      light: () =>
        new XYZ({
          url: "https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
      dark: () =>
        new XYZ({
          url: "https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
    };
    layer.setSource(sources[baseMap]());
    layer.setOpacity(fullBleed ? 1 : 0.35);
  }, [baseMap, fullBleed]);

  useEffect(() => {
    const drilldownCountry = selected?.name || adminDrill?.countryName || "";
    const hasRegionBoundary = Boolean(iso3For(drilldownCountry));
    vectorRef.current?.setVisible(Boolean(showAdmin && !hasRegionBoundary));
    regionRef.current?.setVisible(Boolean(showAdmin && hasRegionBoundary));
    markerRef.current?.setVisible(showMarkers);
  }, [showAdmin, showMarkers, selected?.name, adminDrill?.countryName, catalogTick]);

  useEffect(() => {
    Object.entries(bnpbRef.current).forEach(([key, layer]) =>
      layer.setVisible(Boolean(bnpbLayers?.[key as keyof typeof bnpbLayers])),
    );
  }, [bnpbLayers]);

  // iNaturalist Aedes Vector Sightings
  useEffect(() => {
    const layer = vectorSightingsRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.vectors);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("vectors", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("vectors", { state: "loading", message: tr("skdr.amap.loading_inaturalist_observations") });
    const vectorLoader = intelLoadersRef.current?.vectors;
    (vectorLoader ? vectorLoader(ac.signal) : fetchVectorSightings({ signal: ac.signal }))
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.sightings || []).map((s) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([s.longitude, s.latitude])),
          });
          f.set("intelType", "vector_sighting");
          f.set("intelData", s);
          return f;
        });
        src.addFeatures(features);
        reportStatus("vectors", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("vectors", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.vectors, intelLoaders?.key]);

  // GBIF wildlife (bird) occurrences across ASEAN — avian influenza early warning.
  useEffect(() => {
    const layer = wildlifeRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.wildlife);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("wildlife", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("wildlife", { state: "loading", message: tr("skdr.amap.loading_gbif_bird_occurrences") });
    const wildlifeLoader = intelLoadersRef.current?.wildlife;
    (wildlifeLoader ? wildlifeLoader(ac.signal) : fetchWildlifeOccurrences({ preset: "map" }, { signal: ac.signal }))
      .then((payload) => {
        if (cancelled) return;
        src.clear();
        const results: any[] = Array.isArray(payload?.results) ? payload.results : [];
        const features = results
          .filter((r) => Number.isFinite(r?.decimalLatitude) && Number.isFinite(r?.decimalLongitude))
          .map((r) => {
            const data: WildlifeOccurrence = {
              species: r.species || r.genericName || null,
              scientificName: r.scientificName || null,
              country: r.country || null,
              eventDate: r.eventDate || null,
              latitude: r.decimalLatitude,
              longitude: r.decimalLongitude,
              place: [r.locality, r.stateProvince].filter(Boolean).join(", ") || null,
              url: r.key ? `https://www.gbif.org/occurrence/${r.key}` : null,
            };
            const f = new Feature({ geometry: new Point(fromLonLat([data.longitude, data.latitude])) });
            f.set("intelType", "wildlife");
            f.set("intelData", data);
            return f;
          });
        src.addFeatures(features);
        reportStatus("wildlife", features.length > 0
          ? { state: "ok", message: tr("skdr.amap.birdCount", { count: features.length }) }
          : payload?.error
            ? layerOutcome(0, payload?.source, payload.error, payload)
            : { state: "empty", message: tr("skdr.amap.no_gbif_occurrences_returned") });
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("wildlife", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.wildlife, intelLoaders?.key]);

  // PR 117: OpenSky live aircraft removed (no OpenSky API). Flight Connection — Routes draws simulated aircraft instead.
  useEffect(() => {
    flightsRef.current?.setVisible(false);
  }, []);

  // NASA FIRMS Active Fire Hotspots
  useEffect(() => {
    const layer = firesRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.fires);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("fires", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("fires", { state: "loading", message: tr("skdr.amap.loading_nasa_firms_hotspots") });
    fetchFireHotspots({ signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.hotspots || []).map((h) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([h.longitude, h.latitude])),
          });
          f.set("intelType", "fire_hotspot");
          f.set("intelData", h);
          return f;
        });
        src.addFeatures(features);
        reportStatus("fires", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("fires", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.fires]);

  useEffect(() => {
    const source = radiusRef.current?.getSource();
    if (!source) return;
    source.clear();
    if (!ewsRadiusKm || ewsRadiusKm <= 0) return;
    effectiveOutbreaks
      ?.filter((x) => x.has_alert && x.latitude != null && x.longitude != null)
      .forEach((item) => {
        const feature = new Feature({
          geometry: new CircleGeom(
            fromLonLat([item.longitude!, item.latitude!]),
            ewsRadiusKm * 1000,
          ),
        });
        feature.set("severity", item.severity);
        source.addFeature(feature);
      });
    const dangerRadiusStyle = new Style({
      fill: new Fill({ color: "rgba(239,68,68,0.12)" }),
      stroke: new Stroke({ color: "rgba(220,38,38,0.85)", width: 2 }),
    });
    const warningRadiusStyle = new Style({
      fill: new Fill({ color: "rgba(249,115,22,0.10)" }),
      stroke: new Stroke({ color: "rgba(249,115,22,0.8)", width: 1.8 }),
    });

    radiusRef.current?.setStyle((f) => {
      const danger = f.get("severity") === "AWAS";
      return danger ? dangerRadiusStyle : warningRadiusStyle;
    });
  }, [outbreakLocations, ewsRadiusKm]);

  useEffect(() => {
    const layer = hazardRef.current;
    const source = layer?.getSource();
    if (!layer || !source) return;
    source.clear();
    layer.setVisible(Boolean(showHazards));
    if (!showHazards || !hazardEvents?.length) return;
    hazardEvents.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const feature = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [item.longitude, item.latitude],
          },
          properties: {},
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      feature.set("source", item.source || "gdacs");
      feature.set("hazard", item);
      source.addFeature(feature);
    });
  }, [hazardEvents, showHazards]);

  const periodStart = markerPeriod?.start || null;
  const periodEnd = markerPeriod?.end || null;

  useEffect(() => {
    const vectorLayer = vectorRef.current;
    const markerLayer = markerRef.current;
    if (!vectorLayer || !markerLayer) return;

    const vectorSource = vectorLayer.getSource()!;
    const markerSource = markerLayer.getSource()!;

    markerSource.clear();

    effectiveOutbreaks?.forEach((item) => {
      // Public pins are intentionally limited to the rolling recent window
      // calculated by the backend. Historical aggregates remain available to
      // the choropleth and dashboard totals, but do not become live markers.
      // PR 026: when the dashboard passes its active period, markers follow that period instead.
      const isRecent = periodStart && periodEnd
        ? isWithinPeriod(item.latest_date, periodStart, periodEnd)
        : isWithinRecentWindowForDays(item.latest_date, markerLookbackDays);
      if (!isRecent || item.latitude == null || item.longitude == null) return;
      const feature = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [item.longitude, item.latitude],
          },
          properties: {},
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      feature.set("severity", item.severity);
      feature.set("isHot", item.is_hot === true);
      // PR 120: country-only events sit on the country centroid as a hollow 'national' ring;
      // official IBS figures get their own colour.
      feature.set("national", item.is_national === true || item.geo_level === "national");
      feature.set("ibs", (item.source_type || "").toUpperCase() === "IBS");
      feature.set("srcType", (item.source_type || "").toUpperCase());
      feature.set("location", item);
      markerSource.addFeature(feature);
    });

    const hasLocation = result?.latitude != null && result?.longitude != null;
    const hasCountry = !!result?.country && result?.language !== "en";

    const targetCountry = (result?.country || highlightCountry)?.toLowerCase();

    vectorLayer.setStyle((f: FeatureLike) => {
      const name = (f.get("name") as string).toLowerCase();
      const item = countryData?.find((d) => sameCountry(d.name, name));
      const maximum = Math.max(...(countryData || []).map((d) => d.cases || 0), 0);
      const isHighlighted =
        !!targetCountry && (name === targetCountry || name === highlightCountry?.toLowerCase());
      const fill = isHighlighted
        ? heatFill(Math.max(item?.cases || 0, maximum * 0.18), maximum || 1, countryClasses(countryData))
        : heatFill(item?.cases || 0, maximum, countryClasses(countryData));
      const stroke = isHighlighted
        ? themeRgb("brand-700")
        : (item?.deaths || 0) > 0
          ? "#be123c"
          : "#cbd5e1";
      const sw = isHighlighted ? 2.5 : (item?.deaths || 0) > 0 ? 1.6 : 1;
      return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({
          color: stroke,
          width: sw,
          lineDash: !isHighlighted && (item?.deaths || 0) > 0 ? [5, 3] : undefined,
        }),
      });
    });
    vectorLayer.changed();

    if (result?.locations && result.locations.length > 0) {
      result.locations.forEach((loc) => {
        if (loc.latitude != null && loc.longitude != null) {
          const f = new GeoJSON().readFeature(
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [loc.longitude, loc.latitude],
              },
            },
            { featureProjection: "EPSG:3857" },
          ) as Feature;
          f.set("type", "exact");
          f.set("name", loc.name);
          markerSource.addFeature(f);
        }
      });
      if (markerSource.getFeatures().length > 0) {
        const extent = markerSource.getExtent();
        mapRef.current?.getView().fit(extent, {
          padding: [60, 60, 60, 60],
          maxZoom: 8,
          duration: 800,
        });
      }
    } else if (hasLocation) {
      const f = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [result.longitude!, result.latitude!],
          },
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      f.set("type", "exact");
      markerSource.addFeature(f);
    } else if ((hasCountry || highlightCountry) && targetCountry) {
      const feature = vectorSource
        .getFeatures()
        .find((f) => (f.get("name") as string).toLowerCase() === targetCountry);
      if (feature) {
        const extent = feature.getGeometry()!.getExtent();
        const framed = (borderNeighbors || []).length ? paddedExtent(extent, 0.16) : extent;
        mapRef.current?.getView().fit(framed, {
          padding: [50, 50, 50, 50],
          duration: 500,
          maxZoom: 6,
        });
      }
    } else if (!selected && !highlightCountry) {
      mapRef.current
        ?.getView()
        .animate({
          center: fromLonLat(initialCenter || [110, 2]),
          zoom: initialZoom ?? 4,
          duration: 500,
        });
    }
  }, [countryData, result, effectiveOutbreaks, highlightCountry, borderNeighbors, markerLookbackDays, periodStart, periodEnd, initialCenter, initialZoom]);

  // PR 018: follow the province / kab-kota multi-select — fit after the default country framing above.
  const fitKey = fitTo ? fitTo.map((v) => v.toFixed(3)).join(",") : "";
  useEffect(() => {
    if (!fitTo || !mapReady) return;
    const id = window.setTimeout(() => {
      const ext = transformExtent(fitTo, "EPSG:4326", "EPSG:3857");
      mapRef.current?.getView().fit(ext, { padding: [50, 50, 50, 50], maxZoom: 9, duration: 600 });
    }, 650);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, mapReady]);

  // Refresh the selected country's outer polygon from the current
  // geoBoundaries gbOpen dataset. The bundled ASEAN geometry remains as a
  // resilient fallback, while this overlay prevents a country selection from
  // reusing Indonesia's old administrative geometry.
  useEffect(() => {
    const layer = currentCountryBoundaryRef.current;
    const source = layer?.getSource();
    const focusName = adminDrill?.countryName || highlightCountry || "";
    const iso3 = (adminDrill?.iso3 || iso3For(focusName) || "").toUpperCase();
    if (!source) return;

    if (!iso3) {
      source.clear();
      return;
    }

    let cancelled = false;
    fetch(`${PUBLIC_BASE_PATH}/boundaries?country=${iso3}&level=ADM0`)
      .then((response) => {
        if (!response.ok) throw new Error(`Country boundary HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled || !payload?.geojson) return;
        const features = new GeoJSON().readFeatures(payload.geojson, {
          featureProjection: 'EPSG:3857',
        });
        source.clear();
        source.addFeatures(features);
        setCountryOutlineTick((value) => value + 1);
        if (skipOutlineFitRef.current) return;
        const extent = source.getExtent();
        if (features.length > 0 && extent.every(Number.isFinite)) {
          const framed = (borderNeighbors || []).length ? paddedExtent(extent, 0.16) : extent;
          mapRef.current?.getView().fit(framed, {
            padding: [60, adminDrill?.iso3 ? 400 : 60, 60, 60],
            duration: 650,
            maxZoom: 7,
          });
        }
      })
      .catch(() => {
        // The bundled ASEAN polygon remains visible when the boundary proxy
        // or the upstream dataset is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [adminDrill?.iso3, adminDrill?.countryName, highlightCountry, borderNeighbors, catalogTick, mapReady]);

  useEffect(() => {
    const source = neighborBoundaryRef.current?.getSource();
    const spreadSource = spreadLinksRef.current?.getSource();
    if (!source) return;
    source.clear();
    spreadSource?.clear();
    if (isNoSpread) return;
    const neighbors = (borderNeighbors || []).filter((item) => item.iso3);
    if (!neighbors.length) return;

    const countryName = normalizedCountry(highlightCountry);
    const overlay = currentCountryBoundaryRef.current?.getSource()?.getFeatures() || [];
    const bundled = vectorRef.current
      ?.getSource()
      ?.getFeatures()
      .find((feature) => normalizedCountry(feature.get("name") as string) === countryName);
    const countries = (overlay.length ? overlay : bundled ? [bundled] : [])
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is Geometry => Boolean(geometry));
    if (!countries.length) return;

    // Hub and neighbour nodes sit on the largest land polygon, so a split
    // country does not drop the connector in the sea between its parts.
    const hub = largestLandInterior(countries);
    const casesByCountry: Record<string, number> = {};
    (latestPropsRef.current.countryData || []).forEach((d) => {
      casesByCountry[normalizedCountry(d.name)] = d.cases || 0;
    });

    let cancelled = false;
    Promise.all(
      neighbors.map(async (neighbor) => {
        const response = await fetch(
          `${PUBLIC_BASE_PATH}/boundaries?country=${encodeURIComponent(neighbor.iso3!)}&level=ADM0`,
        );
        if (!response.ok) return { parts: [] as Feature[], center: null as number[] | null, name: neighbor.name };
        const payload = await response.json();
        if (!payload?.geojson) return { parts: [] as Feature[], center: null as number[] | null, name: neighbor.name };
        const features = new GeoJSON().readFeatures(payload.geojson, {
          featureProjection: "EPSG:3857",
        }) as Feature[];
        const geometries = features
          .map((feature) => feature.getGeometry())
          .filter((geometry): geometry is Geometry => Boolean(geometry));
        const parts = geometries.flatMap((geometry) =>
          polygonParts(geometry)
            .filter((part) => partTouchesCountry(part, countries))
            .map((part) => {
              const next = new Feature({ geometry: part });
              next.set("borderName", neighbor.name);
              return next;
            }),
        );
        return { parts, center: largestLandInterior(geometries), name: neighbor.name };
      }),
    )
      .then((groups) => {
        if (cancelled) return;
        source.clear();
        source.addFeatures(groups.flatMap((g) => g.parts));

        if (spreadSource) {
          spreadSource.clear();
          if (!hub) return;
          const hubFeature = new Feature({ geometry: new Point(hub) });
          hubFeature.set("spreadKind", "hub");
          hubFeature.set("borderName", highlightCountry || "");
          const spreadFeatures: Feature[] = [hubFeature];
          groups.forEach((g) => {
            if (!g.center) return;
            const hasSpread = (casesByCountry[normalizedCountry(g.name)] || 0) > 0;
            const link = new Feature({ geometry: new LineString([hub, g.center]) });
            link.set("spreadKind", "link");
            link.set("hasSpread", hasSpread);
            link.set("borderName", g.name);
            const node = new Feature({ geometry: new Point(g.center) });
            node.set("spreadKind", "node");
            node.set("hasSpread", hasSpread);
            node.set("borderName", g.name);
            spreadFeatures.push(link, node);
          });
          spreadSource.addFeatures(spreadFeatures);
        }
      })
      .catch(() => {
        // The focused country stays visible when a neighbor outline cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [borderNeighbors, highlightCountry, countryOutlineTick]);

  // Disease spread flow: from→to connectors for the selected disease, ordered by date.
  useEffect(() => {
    const src = flowRef.current?.getSource();
    if (!src) return;
    src.clear();
    if (!flowDisease || isNoSpread) return;
    const target = flowDisease.trim().toLowerCase();
    const flowDate = (l: OutbreakLocation) =>
      l.sort_date || l.case_date || l.latest_date || l.published_date || "";
    const points = (effectiveOutbreaks || [])
      .filter(
        (l) =>
          (l.disease || "").trim().toLowerCase() === target &&
          Number.isFinite(l.latitude as number) &&
          Number.isFinite(l.longitude as number),
      )
      .map((l) => ({ loc: l, date: flowDate(l), lon: l.longitude as number, lat: l.latitude as number }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (points.length === 0) return;

    const features: Feature[] = [];
    points.forEach((p, i) => {
      const node = new Feature({ geometry: new Point(fromLonLat([p.lon, p.lat])) });
      node.set("flowKind", i === 0 ? "origin" : "node");
      node.set("flowLabel", `${p.loc.location_name || p.loc.country}${p.date ? ` · ${p.date}` : ""}`);
      features.push(node);
      if (i === 0) return;
      // Connect to the nearest location that appeared earlier — a plausible from→to hop.
      let parent = points[0];
      let best = Infinity;
      for (let j = 0; j < i; j++) {
        const d = (points[j].lon - p.lon) ** 2 + (points[j].lat - p.lat) ** 2;
        if (d < best) {
          best = d;
          parent = points[j];
        }
      }
      const link = new Feature({
        geometry: new LineString([fromLonLat([parent.lon, parent.lat]), fromLonLat([p.lon, p.lat])]),
      });
      link.set("flowKind", "link");
      features.push(link);
    });
    src.addFeatures(features);
  }, [flowDisease, effectiveOutbreaks, mapReady, isNoSpread]);

  // Admin polygons for the focused country, from ADM1 down to the finest
  // geoBoundaries level that still returns shapes (ADM5 at most).
  useEffect(() => {
    const layer = regionRef.current;
    const source = layer?.getSource();
    const countryLabel = adminDrill?.countryName || selected?.name || highlightCountry || "";
    const countryName = normalizedCountry(countryLabel);
    const iso3 = adminDrill?.iso3 || iso3For(countryLabel);
    const level = adminDrill?.level || 1;
    if (!layer || !source) return;

    source.clear();
    layer.setVisible(false);
    if (!iso3 || !showAdmin || !countryName) return;

    let cancelled = false;
    const parent = level > 1 ? drillParentRef.current : null;
    const parentName = [...adminCrumbs].reverse().find((crumb) => crumb.level === level - 1)?.name || "";

    const load = async () => {
      try {
        let geojson: unknown;
        const boundaryUrl = `${PUBLIC_BASE_PATH}/boundaries?country=${iso3}&level=${adminLevelCode(level)}`;
        if (iso3 === "IDN" && level === 1) {
          const response = await fetch(`${PUBLIC_BASE_PATH}/wilayah-data?level=provinsi`);
          if (response.ok) {
            const payload = await response.json();
            geojson = payload.geojson;
          }
        } else if (iso3 === "IDN" && level === 2 && parentName) {
          const response = await fetch(
            `${PUBLIC_BASE_PATH}/wilayah-data?level=kabupaten&province=${encodeURIComponent(parentName)}`,
          );
          if (response.ok) {
            const payload = await response.json();
            geojson = payload.geojson;
          }
        }
        if (!geojson) {
          const response = await fetch(boundaryUrl);
          if (!response.ok) throw new Error(`Boundary proxy HTTP ${response.status}`);
          const payload = await response.json();
          if (!payload.geojson) throw new Error("Boundary GeoJSON is missing");
          geojson = payload.geojson;
        }

        if (cancelled || !geojson) return;
        let features = new GeoJSON().readFeatures(geojson as any, {
          featureProjection: "EPSG:3857",
        }) as Feature[];
        if (parent) {
          const kept = features.filter((feature) => {
            const geometry = feature.getGeometry();
            return geometry ? geometryInside(geometry, parent) : false;
          });
          if (kept.length) features = kept;
          else if (features.length >= 400) throw new Error(tr("skdr.amap.admin_subset_is_too_large_to_draw"));
        }
        if (!features.length) throw new Error(tr("skdr.amap.no_admin_polygons"));

        const locations = (latestPropsRef.current.outbreakLocations || []).filter(
          (item) => sameCountry(item.country, countryLabel)
            && item.latitude != null
            && item.longitude != null,
        );
        const points = locations.map((item) => ({
          item,
          coordinate: fromLonLat([item.longitude!, item.latitude!]),
        }));

        let maximumCases = 0;
        features.forEach((feature) => {
          const geometry = feature.getGeometry();
          const metric: RegionMetric = { cases: 0, deaths: 0, eventCount: 0 };
          if (geometry) {
            const extent = geometry.getExtent();
            points.forEach(({ item, coordinate }) => {
              if (
                coordinate[0] < extent[0] ||
                coordinate[0] > extent[2] ||
                coordinate[1] < extent[1] ||
                coordinate[1] > extent[3]
              ) {
                return;
              }
              if (!geometry.intersectsCoordinate(coordinate)) return;
              const st = (item.source_type || "").toUpperCase();
              const ev = Math.max(item.event_count || 0, 0);
              if (st === "PE") {
                metric.peCases = (metric.peCases || 0) + Math.max(item.cases || 0, 0);
                metric.peDeaths = (metric.peDeaths || 0) + Math.max(item.deaths || 0, 0);
              } else if (st === "EBS") {
                metric.ebsSignals = (metric.ebsSignals || 0) + ev;
                metric.ebsCases = (metric.ebsCases || 0) + Math.max(item.cases || 0, 0);
                metric.ebsDeaths = (metric.ebsDeaths || 0) + Math.max(item.deaths || 0, 0);
              }
              // PR 016: choropleth intensity = number of reports (EBS signals + PE cases), labelled as such in the legend.
              metric.cases += st === "EBS" ? ev : Math.max(item.cases || 0, 0);
              metric.deaths += Math.max(item.deaths || 0, 0);
              metric.eventCount += ev;
            });
          }
          maximumCases = Math.max(maximumCases, metric.cases);
          feature.set("regionName", regionName(feature.getProperties()));
          feature.set("regionCountry", countryLabel);
          feature.set("regionMetric", metric);
          feature.set("adminLevel", level);
          feature.set("iso3", iso3);
        });
        const regionClasses = buildChoroClasses(CHORO_CFG, features.map((feature) => Number((feature.get("regionMetric") as { cases?: number } | undefined)?.cases) || 0));
        features.forEach((feature) => { feature.set("regionMaximumCases", maximumCases); feature.set("regionClasses", regionClasses); });
        if (!cancelled) onChoroRef.current?.(regionClasses);
        if (cancelled) return;
        source.addFeatures(features);
        layer.setVisible(Boolean(showAdmin));
        layer.changed();
        const extent = parent?.getExtent() || source.getExtent();
        if (extent.every(Number.isFinite)) {
          mapRef.current?.getView().fit(extent, {
            padding: [48, 400, 48, 48],
            duration: 450,
            maxZoom: Math.min(8 + (parent ? level - 1 : level), 14),
          });
        }
        setAdminNote(nextAdminLevel(level) ? null : tr("skdr.amap.lowest_admin_boundary"));
      } catch {
        if (cancelled) return;
        if (level > 1) {
          setAdminNote(tr("skdr.amap.lowest_admin_boundary_for_this_unit"));
          drillParentRef.current = drillGeomRef.current[level - 2] || null;
          setAdminCrumbs((prev) => prev.filter((crumb) => crumb.level < level - 1));
          setAdminDrill((prev) => (prev && prev.level === level ? { ...prev, level: level - 1 } : prev));
        } else {
          layer.setVisible(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      source.clear();
      layer.setVisible(false);
    };
  }, [adminDrill, selected?.name, highlightCountry, showAdmin, outbreakLocations, catalogTick, mapReady, choroCfg]);

  const resetView = () => {
    setIsNavigating(false);
    setSelected(null);
    setSelectedRegion(null);
    setSelectedLocation(null);
    setSelectedIntel(null);
    setAdminDrill(null);
    setAdminCrumbs([]);
    setAdminNote(null);
    drillParentRef.current = null;
    drillGeomRef.current = {};
    mapRef.current
      ?.getView()
      .animate({
        center: fromLonLat(initialCenter || [110, 2]),
        zoom: initialZoom ?? (boundaryScope === "global" ? 2 : 4),
        duration: 450,
      });
    if (latestPropsRef.current.onSelectCountry) {
      latestPropsRef.current.onSelectCountry("ASEAN");
    }
  };

  const showAdminLevel = (level: number) => {
    if (!adminDrill) return;
    drillParentRef.current = level <= 1 ? null : drillGeomRef.current[level - 1] || null;
    setAdminCrumbs((prev) => prev.filter((crumb) => crumb.level < level));
    setAdminNote(null);
    setAdminDrill({ ...adminDrill, level: Math.max(1, level) });
  };

  const zoom = (d: number) => {
    const v = mapRef.current?.getView();
    if (v) v.animate({ zoom: (v.getZoom() ?? 4) + d, duration: 250 });
  };

  const countryOutbreaks = outbreakLocations?.filter(
    (x) => sameCountry(x.country, selected?.name)
  ) ?? [];

  const countryItem = countryData?.find(
    (d) => sameCountry(d.name, selected?.name)
  );

  const calculatedCases = (countryItem && countryItem.cases > 0)
    ? countryItem.cases
    : (selected?.totalCases && selected.totalCases > 0)
      ? selected.totalCases
      : countryOutbreaks.reduce((acc, c) => acc + (c.cases || 0), 0);

  const displayTotalCases = calculatedCases > 0
    ? calculatedCases
    : countryOutbreaks.length;

  const totalDeaths = countryOutbreaks.reduce((acc, curr) => acc + (curr.deaths || 0), 0);


  const locationsCount = countryOutbreaks.length || (selected?.locations?.length ?? 0);
  const popupPositionClass = fullBleed
    ? "bottom-16 left-1/2 -translate-x-1/2"
    : "right-4 top-20";


  return (
    <div
      className={
        fullBleed
          ? "relative h-full w-full overflow-hidden bg-white"
          : embedded
            ? "relative h-full w-full overflow-hidden rounded-xl bg-white"
            : "relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      }
    >
      {!fullBleed && !embedded && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("map.monitoringTitle")}
            </span>
            {result && (
              <span className="ml-2 text-xs text-slate-400">
                {result.locations && result.locations.length > 1
                  ? `📍 ${result.locations.length} ${t("map.mappedLocations")}`
                  : result.latitude != null
                  ? `📍 ${result.location_name || t("dashboard.labelLocation")}`
                  : result.country
                    ? `🌏 ${result.country}`
                    : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {boundaryStatus && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-primary shadow-sm">
          {boundaryStatus}
        </div>
      )}
      <div
        ref={el}
        style={{ marginLeft: panelDocked ? DOCK_W : 0, width: panelDocked ? `calc(100% - ${DOCK_W}px)` : "100%", transition: "margin-left 300ms ease, width 300ms ease" }}
        className={
          fullBleed
            ? "h-full min-h-screen w-full"
            : embedded
              ? "h-full min-h-[460px] w-full"
              : compact
                ? "h-[390px] w-full"
                : "h-[500px] w-full"
        }
      />

      {hoverCard && (
        <div
          ref={hoverCardRef}
          className="pointer-events-none absolute z-50 w-[min(280px,calc(100%-24px))] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgb(var(--brand-700)/0.2)]"
          style={{ left: hoverCard.x, top: hoverCard.y }}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-primary">{hoverCard.subtitle}</p>
          <p className="mt-0.5 text-sm font-black text-slate-900">{hoverCard.title}</p>
          {hoverCard.lines.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              {hoverCard.lines.map((line) => (
                <li key={`${line.label}-${line.value}`} title={line.note} className="text-[11px] font-semibold leading-4 text-slate-700">
                  <span className="font-black text-slate-900">{line.label}</span>
                  <span className={line.note ? " underline decoration-dotted decoration-amber-500" : ""}> → {line.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">{hoverCard.empty}</p>
          )}
        </div>
      )}

      {flowDisease && !isNoSpread && (() => {
        const count = (outbreakLocations || []).filter(
          (l) =>
            (l.disease || "").trim().toLowerCase() === flowDisease.trim().toLowerCase() &&
            Number.isFinite(l.latitude as number) &&
            Number.isFinite(l.longitude as number),
        ).length;
        return (
          <div
            style={{ left: panelDocked ? `calc(50% + ${DOCK_W / 2}px)` : "50%", transition: "left 300ms ease" }}
            className="absolute top-4 z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-[0_8px_30px_rgba(234,88,12,0.2)]"
          >
            <span>
              {tr("skdr.amap.spreadOf")} <span className="font-black text-slate-900">{flowDisease}</span>
              {count > 0 ? ` · ${tr("skdr.amap.nLocations", { count })} · ` : ` · ${tr("skdr.amap.noPath")}`}
            </span>
            {count > 0 && (
              <>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#16a34a]" aria-hidden />{tr("skdr.amap.index_case_earliest")}</span>
                <span aria-hidden>→</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#ea580c]" aria-hidden />{tr("skdr.amap.subsequent_case_locations_by_case_date")}</span>
              </>
            )}
            <button
              type="button"
              onClick={() => setFlowDisease(null)}
              className="ml-1 rounded-full p-0.5 text-slate-400 hover:text-slate-700"
              aria-label={tr("skdr.amap.clear_spread_flow")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })()}

      {panelDisease && !isNoSpread && (
        <DiseaseDetailPanel
          open={!!flowDisease}
          disease={panelDisease}
          displayName={translateDisease(panelDisease)}
          locations={outbreakLocations || []}
          highlightLocation={newsFocus && (newsFocus.disease || "").trim().toLowerCase() === panelDisease.trim().toLowerCase() ? newsFocus : null}
          onClose={() => { setNewsFocus(null); setFlowDisease(null); }}
          hideSpreadRoute={isNoSpread}
        />
      )}

      {spreadPopup && !isNoSpread && (() => {
        const locs = outbreakLocations || [];
        const summarize = (name: string) => {
          const norm = normalizedCountry(name);
          const byDisease: Record<string, { cases: number; deaths: number }> = {};
          let cases = 0;
          let deaths = 0;
          locs
            .filter((l) => normalizedCountry(l.country || "") === norm)
            .forEach((l) => {
              const d = l.disease || "Unknown";
              byDisease[d] = byDisease[d] || { cases: 0, deaths: 0 };
              byDisease[d].cases += l.cases || 0;
              byDisease[d].deaths += l.deaths || 0;
              cases += l.cases || 0;
              deaths += l.deaths || 0;
            });
          const diseases = Object.entries(byDisease)
            .map(([disease, v]) => ({ disease, ...v }))
            .sort((a, b) => b.cases - a.cases);
          return { cases, deaths, diseases };
        };
        const box = el.current?.getBoundingClientRect();
        let left = spreadPopup.x + 14;
        let top = spreadPopup.y + 14;
        if (box && left > box.width - 320) left = Math.max(8, spreadPopup.x - 322);
        if (box && top > box.height - 220) top = Math.max(8, spreadPopup.y - 200);
        const rowCountries = spreadPopup.isHub
          ? [spreadPopup.country, ...spreadPopup.neighbors]
          : [spreadPopup.country];
        return (
          <div
            className="absolute z-50 w-[min(320px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)]"
            style={{ left, top }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">
                  {spreadPopup.isHub ? tr("skdr.amap.cross_border_disease_matrix") : tr("skdr.amap.land_neighbour")}
                </p>
                <p className="text-sm font-black text-slate-900">{spreadPopup.country}</p>
              </div>
              <button
                type="button"
                onClick={() => setSpreadPopup(null)}
                className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                aria-label={tr("skdr.amap.close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-3">
              {spreadPopup.isHub ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] font-black uppercase tracking-wider text-slate-400">
                      <th className="pb-1">{tr("skdr.amap.country")}</th>
                      <th className="pb-1 text-right">{tr("skdr.amap.cases")}</th>
                      <th className="pb-1 text-right">{tr("skdr.amap.deaths")}</th>
                      <th className="pb-1 pl-2">{tr("skdr.amap.top_disease")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rowCountries.map((name, idx) => {
                      const s = summarize(name);
                      const top = s.diseases[0];
                      return (
                        <tr key={name} className={idx === 0 ? "font-black text-slate-900" : "text-slate-700"}>
                          <td className="py-1 pr-1">{name}{idx === 0 ? " (focus)" : ""}</td>
                          <td className="py-1 text-right tabular-nums">{s.cases.toLocaleString()}</td>
                          <td className="py-1 text-right tabular-nums">{s.deaths > 0 ? s.deaths.toLocaleString() : "—"}</td>
                          <td className="py-1 pl-2 text-slate-600">{top ? `${top.disease} (${top.cases})` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (() => {
                const s = summarize(spreadPopup.country);
                if (s.diseases.length === 0) {
                  return <p className="text-[11px] font-medium text-slate-500">{tr("skdr.amap.no_recorded_cases_on_the_current_map_for")}</p>;
                }
                return (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[9px] font-black uppercase tracking-wider text-slate-400">
                        <th className="pb-1">{tr("skdr.amap.disease")}</th>
                        <th className="pb-1 text-right">{tr("skdr.amap.cases")}</th>
                        <th className="pb-1 text-right">{tr("skdr.amap.deaths")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {s.diseases.map((d) => (
                        <tr key={d.disease} className="text-slate-700">
                          <td className="py-1 pr-1 font-semibold text-slate-900">{d.disease}</td>
                          <td className="py-1 text-right tabular-nums">{d.cases.toLocaleString()}</td>
                          <td className="py-1 text-right tabular-nums">{d.deaths > 0 ? d.deaths.toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
              <p className="mt-2 border-t border-slate-100 pt-1.5 text-[9px] font-medium text-slate-400">
                {tr("skdr.amap.counts_from_mapped_outbreak_events_in_vi")}</p>
            </div>
          </div>
        );
      })()}

      <FlightRoutesLayer
        map={mapReady ? mapRef.current : null}
        visible={Boolean(intelLayers?.flightRoutes)}
        onStatus={(s) => reportStatus("flightRoutes", s)}
      />

      {selectedIntel && (
        <IntelPopup
          selected={selectedIntel}
          className={popupPositionClass}
          onClose={() => setSelectedIntel(null)}
        />
      )}

      {selectedRegion && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-4 top-20 z-40 w-[min(360px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)] ring-1 ring-black/5"
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <button
            type="button"
            onClick={resetView}
            className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label={tr("skdr.amap.close")}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-8">
            <p className="text-[10px] font-black uppercase tracking-wider text-primary">
              {selectedRegion.adminLevel === 1 ? tr("skdr.amap.province") : selectedRegion.adminLevel ? adminLevelCode(selectedRegion.adminLevel) : tr("skdr.amap.location")}
            </p>
            <h3 className="mt-1 truncate text-base font-black text-slate-900">
              {selectedRegion.name}
            </h3>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {selectedRegion.country}
              {selectedRegion.adminLevel ? ` · ${adminLevelCode(selectedRegion.adminLevel)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => showAdminLevel(1)}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-primary"
              >
                {selectedRegion.country}
              </button>
              {adminCrumbs.map((crumb) => (
                <button
                  key={`${crumb.level}-${crumb.name}`}
                  type="button"
                  onClick={() => showAdminLevel(crumb.level + 1)}
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-primary"
                >
                  {crumb.name}
                </button>
              ))}
            </div>
          </div>
          {/* PR 016: region popup shows EBS and Kasus PE side by side (never summed). */}
          <div className="mt-3 grid grid-cols-2 gap-2" data-testid="region-source-split">
            {sourceMode !== "pe" ? (
              <div className="rounded-xl border border-ebs/30 bg-ebs/5 p-2">
                <span className="flex items-center gap-1 text-[10px] font-bold text-ebs"><span className="h-2 w-2 rounded-full bg-ebs" />{tr("skdr.amap.ebsSignals")}</span>
                <p className="mt-0.5 text-lg font-black text-slate-900">{(selectedRegion.metric?.ebsSignals || 0).toLocaleString("id-ID")}</p>
                <p className="text-[10px] text-slate-500">{tr("skdr.amap.ebsCasesLine", { cases: (selectedRegion.metric?.ebsCases || 0).toLocaleString("id-ID"), deaths: (selectedRegion.metric?.ebsDeaths || 0).toLocaleString("id-ID") })}</p>
              </div>
            ) : null}
            {sourceMode !== "ebs" ? (
              <div className="rounded-xl border border-pe/30 bg-pe/5 p-2">
                <span className="flex items-center gap-1 text-[10px] font-bold text-pe"><span className="h-2 w-2 rotate-45 bg-pe" />{tr("skdr.amap.peCases")}</span>
                <p className="mt-0.5 text-lg font-black text-slate-900">{(selectedRegion.metric?.peCases || 0).toLocaleString("id-ID")}</p>
                <p className="text-[10px] text-slate-500">{tr("skdr.amap.peDeathsLine", { deaths: (selectedRegion.metric?.peDeaths || 0).toLocaleString("id-ID") })}</p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
            {tr("skdr.amap.regionSplitNote")}</p>
          {(() => {
            const relationName = selectedRegion.adminLevel && selectedRegion.adminLevel > 1
              ? adminCrumbs.find((crumb) => crumb.level === 1)?.name || selectedRegion.name
              : selectedRegion.name;
            const touches = linksForRegion(regionLinks || [], relationName);
            return (
              <div className="mt-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">
                  {selectedRegion.adminLevel && selectedRegion.adminLevel > 1 ? `${relationName} touches` : "Touches"}
                </p>
                {touches.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {touches.map((row) => (
                      <li key={row.country} title={row.notes[0]} className="text-[11px] font-semibold text-slate-700">
                        <span className="font-black text-slate-900">{row.country}</span>
                        <span className={row.notes.length ? " underline decoration-dotted decoration-amber-500" : ""}> → {row.regions.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] font-medium text-slate-500">No province in another country is linked to {relationName}.</p>
                )}
              </div>
            );
          })()}
          <p className="mt-1 text-[9px] font-semibold text-slate-400">
            {adminNote ? `${adminNote}. ` : ""}
            Click a polygon to open the next admin boundary. Source: {selectedRegion.country.toLowerCase() === "indonesia" ? "wilayah data / geoBoundaries" : "geoBoundaries gbOpen"}
          </p>
        </div>
      )}

      {selectedLocation && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute ${popupPositionClass} z-35 w-[min(410px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)] ring-1 ring-black/5 transition-all duration-300 hover:z-50`}
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <button
            type="button"
            onClick={resetView}
            className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label={tr("skdr.amap.close")}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-8">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(selectedLocation.source_type || "").toUpperCase() === "IBS" ? (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-700 border border-teal-200">
                  {tr("skdr.amap.ibs_official")}</span>
              ) : selectedLocation.detail?.source_type && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">
                  {selectedLocation.detail.source_type}
                </span>
              )}
              {(selectedLocation.is_national || selectedLocation.geo_level === "national") && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary border border-primary">
                  {tr("skdr.amap.national")}</span>
              )}
              {selectedLocation.geo_level === "province" && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 border border-slate-300">
                  {tr("skdr.amap.province")}</span>
              )}
              {selectedLocation.is_cumulative && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 border border-amber-200">
                  {tr("skdr.amap.cumulative")}</span>
              )}
            </div>

            <h3 className="mt-1.5 truncate text-base font-black text-slate-900">
              {selectedLocation.location_name}
            </h3>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {translateDisease(selectedLocation.disease)} • {selectedLocation.country}
              {(selectedLocation.province || selectedLocation.city || selectedLocation.detail?.province || selectedLocation.detail?.city)
                ? ` · ${[selectedLocation.province || selectedLocation.detail?.province, selectedLocation.city || selectedLocation.detail?.city].filter(Boolean).join(" / ")}`
                : ""}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              {(selectedLocation.source_type || "").toUpperCase() === "IBS"
                ? `${tr("skdr.amap.officialFigure")}${selectedLocation.period_text ? ` · ${selectedLocation.period_text}` : ""}`
                : tr("skdr.amap.aggregated_nlp_result_for_this_location_")}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-primary leading-tight block">{tr("skdr.amap.reported_cases_in_article")}</span>
              <p className="mt-0.5 text-sm font-black text-primary">{selectedLocation.cases.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-rose-700 leading-tight block">{tr("skdr.amap.reported_death_in_article")}</span>
              <p className="mt-0.5 text-sm font-black text-rose-700">{selectedLocation.deaths.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
            <div className="flex items-center justify-between gap-3">
              <span>Source: {selectedLocation.detail?.source_name || (selectedLocation.detail?.source_type ? selectedLocation.detail.source_type.toUpperCase() : "Surveillance AI")}</span>
              <span>{selectedLocation.latest_date ? new Date(selectedLocation.latest_date).toLocaleDateString("en-US") : "-"}</span>
            </div>
            <p className="mt-1 text-[9px] font-medium leading-relaxed text-slate-400">
              {(selectedLocation.source_type || "").toUpperCase() === "IBS"
                ? selectedLocation.is_cumulative
                  ? tr("skdr.amap.cumulative_total_reported_by_the_source_")
                  : tr("skdr.amap.weekly_addition_reported_by_the_source_f")
                : tr("skdr.amap.cases_and_deaths_are_aggregated_from_pro")}
            </p>
            {(selectedLocation.recent_event_count ?? 0) > 0 && (
              <p className="mt-1 text-[9px] font-semibold leading-relaxed text-primary">
                Recent activity: {(selectedLocation.recent_cases ?? 0).toLocaleString()} cases • {(selectedLocation.recent_event_count ?? 0).toLocaleString()} reports • {(selectedLocation.recent_source_count ?? 0).toLocaleString()} sources (7 days)
              </p>
            )}
            {(selectedLocation.sources?.length ?? 0) > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{tr("skdr.amap.related_sources")}</p>
                <div className="mt-1 space-y-0.5">
                  {selectedLocation.sources?.slice(0, 3).map((source, index) => (
                    source.url ? (
                      <a
                        key={`${source.url}-${index}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[9px] font-semibold text-primary hover:underline"
                      >
                        {source.source_name || source.source_type || source.url}
                      </a>
                    ) : null
                  ))}
                </div>
                {(selectedLocation.sources?.length ?? 0) > 3 && (
                  <p className="mt-1 text-[9px] text-slate-400">+{(selectedLocation.sources?.length ?? 0) - 3} more sources</p>
                )}
              </div>
            )}
            <RelatedArticlesPanel eventId={selectedLocation.detail?.event_id} compact />
            {selectedLocation.detail?.url && (
              <a
                href={selectedLocation.detail.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex font-bold text-primary hover:underline"
              >
                {tr("skdr.amap.open_source_article")}</a>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute ${popupPositionClass} z-35 w-[min(410px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)] ring-1 ring-black/5 transition-all duration-300 hover:z-50`}
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {/* Close Button - Clean top-right positioning without badge */}
          <button
            type="button"
            onClick={resetView}
            className="absolute top-3.5 right-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label={tr("skdr.amap.close")}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Country Flag & Title */}
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary ring-1 ring-blue-200/80 shadow-xs overflow-hidden">
              <CountryFlag countryName={selected.name} shape="circle" size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-black uppercase tracking-tight text-slate-900">
                {selected.name}
              </h3>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {locationsCount > 0
                  ? t("map.mappedLocationsRegion", { count: locationsCount })
                  : t("map.monitoredRegion")}
              </p>
            </div>
          </div>

          {/* Public NLP metrics in English (theme consistent) */}
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {/* Total Cases */}
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-primary">
                <Activity className="h-3 w-3" />
                <span>{tr("skdr.amap.cases")}</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-primary">
                {displayTotalCases > 9999
                  ? `${(displayTotalCases / 1000).toFixed(1)}k`
                  : displayTotalCases.toLocaleString()}
              </p>
            </div>

            {/* Deaths */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                <Skull className="h-3 w-3 text-slate-500" />
                <span>{tr("skdr.amap.deaths")}</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-slate-800">
                {totalDeaths.toLocaleString()}
              </p>
            </div>

            {/* Monitored Locations */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#B49B58]">
                <MapPin className="h-3 w-3" />
                <span>{t("map.mappedLocations")}</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-[#B49B58]">
                {locationsCount}
              </p>
            </div>
          </div>



          {/* Tactical Action Button in English */}
          <button
            type="button"
            onClick={() => {
              const geom = (vectorRef.current?.getSource()?.getFeatures() || []).find(
                (f) => (f.get("name") as string).toLowerCase() === selected.name.toLowerCase()
              )?.getGeometry();
              if (geom) {
                mapRef.current?.getView().fit(geom.getExtent(), {
                  duration: 500,
                  padding: [60, 60, 220, 60],
                  maxZoom: 7,
                });
              }
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-black text-white shadow-md transition hover:bg-brand-800 active:scale-[0.98]"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Focus Map on {selected.name}</span>
          </button>

          <a
            href={`${PUBLIC_BASE_PATH}/detail-region?country=${encodeURIComponent(selected.name)}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onSelectCountry) {
                try {
                  onSelectCountry(selected.name);
                } catch {
                  // ignore
                }
              }
              setIsNavigating(true);
              const targetPath = `/detail-region?country=${encodeURIComponent(selected.name)}`;
              const fullUrl = `${PUBLIC_BASE_PATH}${targetPath}`;
              try {
                router.push(targetPath);
              } catch {
                // ignore
              }
              setTimeout(() => {
                window.location.href = fullUrl;
              }, 150);
            }}
            className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-black text-white shadow-md transition hover:bg-brand-800 active:scale-[0.98] ${isNavigating ? 'opacity-85 pointer-events-none cursor-wait' : ''}`}
          >
            {isNavigating ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{locale === 'id' ? 'Membuka Detail Region...' : 'Loading Region Detail...'}</span>
              </>
            ) : (
              <>
                <Activity className="h-3.5 w-3.5" />
                <span>{locale === 'id' ? 'Lihat Detail Wilayah' : 'View Region Details'} ({selected.name})</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </a></div>
      )}



      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoom(0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label={tr("skdr.amap.zoom_in")}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoom(-0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label={tr("skdr.amap.zoom_out")}
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
          aria-label={tr("skdr.amap.reset")}
          title={t("map.resetView")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}

function IntelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="shrink-0 font-semibold text-slate-500">{label}</span>
      <span className={`text-right font-bold ${value === tr("skdr.amap.no_data") ? "text-slate-400" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

function IntelPopup({
  selected,
  className,
  onClose,
}: {
  selected:
    | { type: "vector_sighting"; data: VectorSighting }
    | { type: "live_flight"; data: LiveFlight }
    | { type: "fire_hotspot"; data: FireHotspot }
    | { type: "hazard_event"; data: HazardEvent }
    | { type: "wildlife"; data: WildlifeOccurrence };
  className: string;
  onClose: () => void;
}) {
  const icon =
    selected.type === "live_flight" ? <Plane className="h-4 w-4" /> :
    selected.type === "vector_sighting" ? <Bug className="h-4 w-4" /> :
    selected.type === "fire_hotspot" ? <Flame className="h-4 w-4" /> :
    selected.type === "wildlife" ? <Bug className="h-4 w-4" /> :
    <Globe className="h-4 w-4" />;

  const title =
    selected.type === "live_flight" ? (selected.data.callsign || selected.data.icao24 || tr("skdr.amap.aircraft")) :
    selected.type === "vector_sighting" ? (selected.data.species || tr("skdr.amap.aedes_sighting")) :
    selected.type === "fire_hotspot" ? tr("skdr.amap.active_fire_hotspot") :
    selected.type === "hazard_event" ? (selected.data.title || selected.data.kind || tr("skdr.amap.hazard")) :
    (selected.data.species || selected.data.scientificName || tr("skdr.amap.bird_occurrence"));

  const kicker =
    selected.type === "live_flight" ? tr("skdr.amap.live_air_traffic_opensky") :
    selected.type === "vector_sighting" ? tr("skdr.amap.vector_sighting_inaturalist") :
    selected.type === "fire_hotspot" ? tr("skdr.amap.thermal_anomaly_nasa_firms") :
    selected.type === "hazard_event" ? `${fieldOrNone(selected.data.source).toUpperCase()} ${fieldOrNone(selected.data.kind)}` :
    tr("skdr.amap.wildlife_occurrence_gbif");

  return (
    <div
      className={`absolute ${className} z-40 w-[min(380px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_16px_45px_rgb(var(--brand-700)/0.22)] ring-1 ring-black/5`}
      style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
        aria-label={tr("skdr.amap.close")}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-2.5 pr-8">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary ring-1 ring-blue-200/80">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-primary">{kicker}</p>
          <h3 className="mt-0.5 truncate text-base font-black text-slate-900">{fieldOrNone(title)}</h3>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {selected.type === "live_flight" && (
          <>
            <IntelRow label={tr("skdr.amap.callsign")} value={fieldOrNone(selected.data.callsign)} />
            <IntelRow label={tr("skdr.amap.icao24_hex")} value={fieldOrNone(selected.data.icao24)} />
            <IntelRow label={tr("skdr.amap.origin_country")} value={fieldOrNone(selected.data.origin_country)} />
            <IntelRow label={tr("skdr.amap.altitude")} value={formatAltitudeM(selected.data.altitude_m)} />
            <IntelRow label={tr("skdr.amap.ground_speed")} value={formatSpeedMs(selected.data.velocity_ms)} />
            <IntelRow label={tr("skdr.amap.heading")} value={formatHeading(selected.data.heading)} />
            <IntelRow label={tr("skdr.amap.on_ground")} value={fieldOrNone(selected.data.on_ground)} />
            <IntelRow label="Squawk" value={fieldOrNone(selected.data.squawk)} />
            <IntelRow label={tr("skdr.amap.last_contact")} value={formatUnixSeconds(selected.data.last_contact)} />
            <IntelRow label={tr("skdr.amap.origin_destination")} value={tr("skdr.amap.no_data")} />
            <p className="pt-1 text-[9px] font-semibold leading-relaxed text-slate-400">
              {tr("skdr.amap.opensky_state_vectors_do_not_include_ori")}</p>
          </>
        )}
        {selected.type === "vector_sighting" && (
          <>
            <IntelRow label={tr("skdr.amap.species")} value={fieldOrNone(selected.data.species)} />
            <IntelRow label={tr("skdr.amap.place")} value={fieldOrNone(selected.data.place)} />
            <IntelRow label={tr("skdr.amap.observed")} value={fieldOrNone(selected.data.observed_on)} />
            {selected.data.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.data.photo_url} alt="" className="mt-2 h-24 w-full rounded-xl object-cover" />
            ) : (
              <IntelRow label={tr("skdr.amap.photo")} value={tr("skdr.amap.no_data")} />
            )}
            {selected.data.url ? (
              <a href={selected.data.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                {tr("skdr.amap.openSource")} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </>
        )}
        {selected.type === "wildlife" && (
          <>
            <IntelRow label={tr("skdr.amap.species")} value={fieldOrNone(selected.data.species)} />
            <IntelRow label={tr("skdr.amap.scientific_name")} value={fieldOrNone(selected.data.scientificName)} />
            <IntelRow label={tr("skdr.amap.country")} value={fieldOrNone(selected.data.country)} />
            {selected.data.place ? <IntelRow label={tr("skdr.amap.place")} value={selected.data.place} /> : null}
            <IntelRow label={tr("skdr.amap.observed")} value={fieldOrNone(selected.data.eventDate)} />
            {selected.data.url ? (
              <a href={selected.data.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                {tr("skdr.amap.openSource")} <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </>
        )}
        {selected.type === "fire_hotspot" && (
          <>
            <IntelRow label={tr("skdr.amap.brightness")} value={fieldOrNone(selected.data.brightness)} />
            <IntelRow label={tr("skdr.amap.confidence")} value={fieldOrNone(selected.data.confidence)} />
            <IntelRow label={tr("skdr.amap.acquired")} value={fieldOrNone([selected.data.acq_date, selected.data.acq_time].filter(Boolean).join(" "))} />
            <IntelRow label={tr("skdr.amap.satellite")} value={fieldOrNone(selected.data.satellite)} />
            <IntelRow label="FRP" value={fieldOrNone(selected.data.frp)} />
          </>
        )}
        {selected.type === "hazard_event" && (
          <>
            <IntelRow label={tr("skdr.amap.source")} value={fieldOrNone(selected.data.source)} />
            <IntelRow label={tr("skdr.amap.kind")} value={fieldOrNone(selected.data.kind)} />
            <IntelRow label={tr("skdr.amap.magnitude")} value={fieldOrNone(selected.data.magnitude)} />
            <IntelRow label={tr("skdr.amap.alert")} value={fieldOrNone(selected.data.alert_level)} />
            <IntelRow label={tr("skdr.amap.when")} value={typeof selected.data.when === "number" ? formatUnixSeconds(selected.data.when > 1e12 ? selected.data.when / 1000 : selected.data.when) : fieldOrNone(selected.data.when)} />
            {"url" in selected.data && (selected.data as { url?: string }).url ? (
              <a href={(selected.data as { url?: string }).url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                {tr("skdr.amap.openSource")} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <IntelRow label={tr("skdr.amap.source_url")} value={tr("skdr.amap.no_data")} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

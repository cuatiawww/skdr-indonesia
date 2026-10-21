'use client'

import { tr } from "@/lib/i18n/LanguageContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CalendarDays,
  Clock3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Filter,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  MapPin,
  RefreshCw,
  Radio,
  Skull,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPublicDashboard, fetchKpiSnapshot } from "@/lib/api";
import { reviewEventRows } from "@/lib/multiFactDisplay.mjs";
import CountryFlag from "@/components/CountryFlag";
import { caseDateText, caseDateTitle, countText, signalDate, takeUniqueSignals } from "@/lib/signal-feed.mjs";
import ExecutiveSummary from "@/components/dashboard/ExecutiveSummary";
import SkdrFilterBar, { type SkdrFilterState as EpiFilterState } from "@/components/SkdrFilterBar";
import { getCurrentEpiWeek } from "@/lib/epi-week";

import type { OutbreakLocation, PublicDashboard } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const SpatialOutbreakMap = dynamic(
  () => import("@/components/SpatialOutbreakMap"),
  { ssr: false },
);

const colors = [
  "#0060A9",
  "#ED2939",
  "#B49B58",
  "#0284c7",
  "#6366f1",
  "#8b5cf6",
];

const severityClass = {
  AWAS: "bg-[#ED2939] text-white",
  SIAGA: "bg-[#B49B58] text-white",
  WASPADA: "bg-amber-400 text-slate-900",
  NORMAL: "bg-blue-100 text-[#0060A9]",
};

function cleanArticleContent(value?: string | null, fallback = tr("skdr.dash.noSourceContent")): string {
  if (!value) return fallback;
  return value
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function SignalModalSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="flex gap-2">
          <div className="h-6 w-24 animate-pulse rounded-md bg-slate-200" />
          <div className="h-6 w-44 animate-pulse rounded-md bg-slate-200" />
          <div className="h-6 w-28 animate-pulse rounded-md bg-slate-200" />
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <div className="h-3 w-36 animate-pulse rounded bg-blue-100" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="h-12 animate-pulse bg-slate-100" />
        <div className="h-16 animate-pulse bg-slate-50" />
      </div>
    </div>
  );
}

function formatPublishDate(dateStr?: string | null, numLocale = "id-ID") {
  if (!dateStr) return "-";
  try {
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
      return dateObj.toLocaleDateString(numLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(numLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return dateStr.slice(0, 10);
  } catch {
    return dateStr.slice(0, 10);
  }
}

type SignalOrder = "case" | "published" | "crawled";

function getAlertDate(alert: OutbreakLocation, order: SignalOrder): string | null | undefined {
  return signalDate(alert, order);
}

function getAlertTimestamp(alert: OutbreakLocation, order: SignalOrder): number {
  const dateStr = getAlertDate(alert, order);
  if (!dateStr) return 0;
  try {
    const d = new Date(dateStr);
    const t = d.getTime();
    if (!isNaN(t)) return t;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, dNum] = match;
      return new Date(Number(y), Number(m) - 1, Number(dNum)).getTime();
    }
    return 0;
  } catch {
    return 0;
  }
}

// ── Normalization Helper for 100% Consistent KPI Breakdown ─────────────────────
function formatNumber(
  value: unknown,
  numLocale = "id-ID",
  options?: Intl.NumberFormatOptions,
) {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? numeric : 0).toLocaleString(numLocale, options);
}

function normalizeMatrixToTarget(
  matrix: { label: string; value: number; sub?: string }[],
  targetTotal: number,
): { label: string; value: number; sub?: string; sharePct: string }[] {
  if (!matrix || matrix.length === 0) {
    if (targetTotal > 0) {
      return [{ label: tr("skdr.dash.totalMonitored"), value: targetTotal, sharePct: "100.0" }];
    }
    return [];
  }

  const rawSum = matrix.reduce((s, m) => s + (typeof m.value === "number" ? m.value : 0), 0);
  if (rawSum === 0 || targetTotal === 0) {
    return matrix.map((m) => ({
      ...m,
      value: 0,
      sharePct: "0.0",
    }));
  }

  if (rawSum === targetTotal) {
    return matrix.map((m) => ({
      ...m,
      sharePct: ((m.value / targetTotal) * 100).toFixed(1),
    }));
  }

  let allocatedSum = 0;
  const scaled = matrix.map((m) => {
    const rawVal = typeof m.value === "number" ? m.value : 0;
    const propVal = Math.round((rawVal / rawSum) * targetTotal);
    allocatedSum += propVal;
    return {
      ...m,
      value: propVal,
      sharePct: ((rawVal / rawSum) * 100).toFixed(1),
    };
  });

  const diff = targetTotal - allocatedSum;
  if (diff !== 0 && scaled.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].value > scaled[maxIdx].value) maxIdx = i;
    }
    scaled[maxIdx].value += diff;
  }

  return scaled;
}

// ── Crawling Info Modal (100% Synchronized & User-Friendly) ───────────────────
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const { t, locale, translateDisease, translateSeverity } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const currentYear = new Date().getFullYear();
  const currentEpi = getCurrentEpiWeek();
  const [filters, setFilters] = useState<EpiFilterState>({
    disease: "all",
    source: "all",
    provinceId: null,
    kabkotaId: null,
    startYear: currentEpi.year || currentYear,
    startWeek: 1,
    endYear: currentEpi.year || currentYear,
    endWeek: currentEpi.week || 1,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const sY = sp.get("startYear");
      const sW = sp.get("startWeek");
      const eY = sp.get("endYear");
      const eW = sp.get("endWeek");
      const dis = sp.get("disease");
      const prov = sp.get("province_id");
      const kab = sp.get("kabkota_id");
      const src = sp.get("source");
      if (sY || sW || eY || eW || dis || prov || kab || src) {
        setFilters((prev) => ({
          ...prev,
          startYear: sY ? Number(sY) : prev.startYear,
          startWeek: sW ? Number(sW) : prev.startWeek,
          endYear: eY ? Number(eY) : prev.endYear,
          endWeek: eW ? Number(eW) : prev.endWeek,
          disease: dis || prev.disease,
          provinceId: prov ? Number(prov) : prev.provinceId,
          kabkotaId: kab ? Number(kab) : prev.kabkotaId,
          source: src === "form" || src === "ebs" ? src : prev.source,
        }));
      }
    }
  }, []);
  const [applied, setApplied] = useState<EpiFilterState>(filters);
  const [data, setData] = useState<PublicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);


  const dashboardApiFilters = useCallback((active: EpiFilterState) => ({
    province_id: active.provinceId ?? undefined,
    kabkota_id: active.kabkotaId ?? undefined,
    source: active.source && active.source !== "all" ? active.source : undefined,
    disease: active.disease,
    start_year: active.startYear,
    start_week: active.startWeek,
    end_year: active.endYear,
    end_week: active.endWeek,
    year: active.endYear,
  }), []);

  const refreshKpis = useCallback(async () => {
    const kpiData = await fetchKpiSnapshot(dashboardApiFilters(filters)).catch(() => null);
    if (!kpiData?.kpis) return;
    setData((prev) => (prev ? { ...prev, kpis: { ...prev.kpis, ...kpiData.kpis } } : prev));
  }, [dashboardApiFilters, filters]);

  const load = useCallback(async (customFilters?: EpiFilterState) => {
    const active = customFilters || filters;
    try {
      setError("");
      const dashboardFilters = dashboardApiFilters(active);
      const [dashData, kpiData] = await Promise.all([
        fetchPublicDashboard(dashboardFilters),
        fetchKpiSnapshot(dashboardFilters).catch(() => null),
      ]);
      if (kpiData?.kpis) {
        dashData.kpis = { ...dashData.kpis, ...kpiData.kpis };
      }
      setData(dashData);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [dashboardApiFilters, filters, t]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => void refreshKpis(), 120_000);
    return () => window.clearInterval(id);
  }, [load, refreshKpis]);

  useEffect(() => {
    const available = data?.available_years;
    if (available?.length && !available.includes(filters.endYear)) {
      setFilters(prev => ({ ...prev, endYear: available[0], startYear: available[0] }));
    }
  }, [data?.available_years, filters.endYear]);

  const mapLocations = useMemo(() => data?.locations ?? [], [data?.locations]);
  // Indonesia only: one country row for the map choropleth.
  const countryData = useMemo(
    () => [{ name: "Indonesia", cases: data?.kpis.cases ?? 0, deaths: data?.kpis.deaths ?? 0 }],
    [data?.kpis.cases, data?.kpis.deaths],
  );
  const provinceData = data?.by_province ?? [];

  if (loading)
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-[#0060A9]">
        {t("common.loading")}
      </div>
    );

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            {t("dashboard.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("dashboard.pageSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.refresh")}
          </button>
        </div>
      </section>

      <SkdrFilterBar
        availableDiseases={data?.available_diseases}
        availableYears={data?.available_years}
        currentEpiWeek={data?.current_epi_week}
        currentEpiYear={data?.current_epi_year}
        value={filters}
        onChange={(newFilters) => setFilters(newFilters)}
        onApply={(newFilters) => {
          setFilters(newFilters);
          setApplied(newFilters);
          load(newFilters);
        }}
        isLoading={loading}
      />


      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {/* PR 010: kartu ringkasan eksekutif (sheet "Spesifikasi Dashboard Executive"); kartu pipeline NLP dihapus. */}
      <ExecutiveSummary query={dashboardApiFilters(applied)} />


      <section className="w-full bg-[#f8fafc] pb-5">
        <div className="w-full">
          <article
            className="flex flex-col border border-[#cfe0f1] bg-white p-4 xl:h-[700px] 2xl:h-[760px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase leading-tight text-slate-900 sm:text-2xl">
                  {t("dashboard.spatialTitle")}
                </h3>
                <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-600 sm:text-base">
                  {t("dashboard.spatialDesc")}
                </p>
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-blue-200/80 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0060A9]" />
                  <span className="truncate">
                    {t("skdr.mapScopeLocations", { scope: data?.filters?.scope || "Indonesia", count: data?.kpis.locations ?? 0 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 min-h-[460px] w-full flex-1 overflow-hidden rounded-xl">
              <SpatialOutbreakMap
                countries={countryData}
                locations={mapLocations}
                highlightCountry="Indonesia"
                boundaryScope="indonesia"
                initialCenter={[118, -2.5]}
                initialZoom={5}
              />
            </div>
          </article>
        </div>
      </section>

    </div>
  );
}

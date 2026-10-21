'use client'

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
import { fetchPublicDashboard, fetchKpiSnapshot, fetchCrawlingStats, fetchCrawlHistorySummary, fetchCrawlHistoryRows, fetchCrawlHistoryRow, type CrawlingStats } from "@/lib/api";
import type { CrawlHistoryRow, CrawlHistorySummary } from "@/types";
import { reviewEventRows } from "@/lib/multiFactDisplay.mjs";
import CountryFlag from "@/components/CountryFlag";
import { isAseanCountryName, isAseanDefaultScope, scopeDashboardLocations } from "@/lib/asean-scope";
import { caseDateText, caseDateTitle, countText, signalDate, takeUniqueSignals } from "@/lib/signal-feed.mjs";
import AseanScopeBanner from "@/components/AseanScopeBanner";
import LivePipelineCard from "@/components/LivePipelineCard";
import EpiFilterBar, { EpiFilterState } from "@/components/EpiFilterBar";
import { getCurrentEpiWeek } from "@/lib/epi-week";
import { growthCaption, GROWTH_FOOTNOTE } from "@/lib/growth.mjs";

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

function cleanArticleContent(value?: string | null, fallback = "Source content is not available."): string {
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
      return [{ label: "Total Monitored", value: targetTotal, sharePct: "100.0" }];
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
function CrawlingInfoModal({
  crawlingStats,
}: {
  crawlingStats: {
    total: number;
    this_month: number;
    last_month: number;
    total_processed: number;
    health_stored_in_db?: number;
    non_health_stored_in_db?: number;
    stored_in_db?: number;
    nlp_processing?: number;
    backlog_warning?: boolean;
    backlog_warning_threshold?: number;
    current_live_crawl?: number;
    total_crawled_all_time?: number;
    current_month: string;
    previous_month: string;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const { t } = useTranslation();
  if (!crawlingStats) return null;

  const sourceLabel: Record<string, string> = {
    rss: t("crawling.sourceLabels.rss"),
    twitter: t("crawling.sourceLabels.twitter"),
    social_media: t("crawling.sourceLabels.social_media"),
    skdr: t("crawling.sourceLabels.skdr"),
    skdr_api: t("crawling.sourceLabels.skdr_api"),
    web: t("crawling.sourceLabels.web"),
    unknown: t("crawling.sourceLabels.unknown"),
  };

  // Older backend deployments may return a partial crawling-stats payload.
  // Normalize numeric fields here so the dashboard never crashes while the
  // API is being upgraded or a source row is incomplete.
  const totalCrawled = Number(crawlingStats.total ?? crawlingStats.total_crawled_all_time ?? 0) || 0;
  const thisMonth = Number(crawlingStats.this_month ?? 0) || 0;
  const totalProcessed = Number(crawlingStats.total_processed ?? 0) || 0;

  const processedPct =
    totalCrawled > 0
      ? ((totalProcessed / totalCrawled) * 100).toFixed(1)
      : "0";

  // Build normalized matrix for sources that sums exactly to crawlingStats.total
  const rawSources = (crawlingStats.by_source_type || [])
    .filter((s) => (s.source_type || "").toLowerCase() !== "test")
    .map((s) => {
    const sourceType = s.source_type || "unknown";
    const sourceTotal = Number(s.total ?? 0) || 0;
    const sourceProcessed = Number(s.processed ?? 0) || 0;
    return {
      label: sourceLabel[sourceType] || sourceType.toUpperCase(),
      value: sourceTotal,
      sub: `${formatNumber(sourceProcessed)} ${t("crawling.processedByModel")}`,
    };
  });
  const normalizedSources = normalizeMatrixToTarget(rawSources, totalCrawled);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition shadow-xs"
        aria-label={t("crawling.infoTitle")}
        title={t("crawling.infoTitle")}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 transition-all duration-300 animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-3xl border border-emerald-200/90 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Clean Title without Icon */}
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white px-6 py-4 sm:px-7">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  {t("crawling.infoTitle")}
                </h3>
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  {t("crawling.infoSubtitle")}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
              {/* Hero Stat Box - 100% Synchronized */}
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-4 text-center shadow-xs">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>{t("crawling.syncedBadge")}</span>
                </div>
                <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                  {formatNumber(totalCrawled)}
                </p>
                <p className="text-xs font-bold text-slate-600 mt-1">
                  {t("crawling.totalSourceRecords")}
                </p>
              </div>

              {/* User-friendly explanations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
                  <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                    <span>{t("crawling.whatItMeans")}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    {t("crawling.whatItMeansBody")}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
                  <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                    <span>{t("crawling.processingFlow")}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    {t("crawling.processingFlowBody")}
                  </p>
                </div>
              </div>

              {/* 3 Secondary KPI Boxes */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-emerald-700">
                    {formatNumber(totalCrawled)}
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.allTime")}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-[#0060A9]">
                    {formatNumber(thisMonth)}
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.thisMonth")}
                  </p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-violet-700">
                    {processedPct}%
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.validatedRecords")}
                  </p>
                </div>
              </div>

              {/* Breakdown Table with Mini Progress Bars */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700">
                    {t("crawling.sourceBreakdown")}
                  </p>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Total: {formatNumber(totalCrawled)}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 text-left border-b border-slate-200/80">
                        <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                          {t("crawling.sourceType")}
                        </th>
                        <th className="px-2 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-center">
                          {t("crawling.share")}
                        </th>
                        <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">
                          {t("crawling.recordCount")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {normalizedSources.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/60 transition">
                          <td className="px-3.5 py-2.5">
                            <p className="font-bold text-slate-800">{row.label}</p>
                            {row.sub && (
                              <p className="text-[9.5px] text-slate-400 mt-0.5">{row.sub}</p>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Math.max(2, parseFloat(row.sharePct)))}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700">
                                {row.sharePct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black text-slate-900">
                            {formatNumber(row.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/60 font-black text-emerald-950 border-t border-emerald-200">
                        <td className="px-3.5 py-2.5 text-[11px] uppercase tracking-wider">
                          {t("crawling.totalRecords")}
                        </td>
                        <td className="px-2 py-2.5 text-center text-[10px]">100.0%</td>
                        <td className="px-3.5 py-2.5 text-right text-sm text-emerald-700 font-black">
                          {formatNumber(totalCrawled)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Generic KPI Info Modal (100% Synchronized with KPI Value & Beautiful UI) ──
function KpiInfoModal({
  open,
  onClose,
  title,
  kpiValue,
  label,
  tone = "blue",
  icon,
  explanation,
  matrixTitle,
  matrix,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kpiValue: number;
  label: string;
  tone?: string;
  icon?: React.ReactNode;
  explanation: {
    meaning: string;
    calculation: string;
  };
  matrixTitle: string;
  matrix: { label: string; value: number; sub?: string }[];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  // Normalization guarantees that row values sum up exactly to kpiValue
  const normalizedRows = normalizeMatrixToTarget(matrix, kpiValue);

  const isRed = tone === "red";
  const isGold = tone === "gold" || tone === "orange";
  const isEmerald = tone === "emerald";

  const theme = {
    headerGradient: isRed
      ? "from-rose-50 via-red-50/40 to-white"
      : isGold
      ? "from-amber-50 via-yellow-50/40 to-white"
      : isEmerald
      ? "from-emerald-50 via-teal-50/40 to-white"
      : "from-blue-50 via-sky-50/40 to-white",
    headerBorder: isRed
      ? "border-rose-100"
      : isGold
      ? "border-amber-100"
      : isEmerald
      ? "border-emerald-100"
      : "border-blue-100",
    iconBg: isRed
      ? "bg-rose-600 text-white shadow-rose-600/20"
      : isGold
      ? "bg-amber-600 text-white shadow-amber-600/20"
      : isEmerald
      ? "bg-emerald-600 text-white shadow-emerald-600/20"
      : "bg-[#0060A9] text-white shadow-[#0060A9]/20",
    heroText: isRed
      ? "text-rose-600"
      : isGold
      ? "text-[#B49B58]"
      : isEmerald
      ? "text-emerald-600"
      : "text-[#0060A9]",
    heroBorder: isRed
      ? "border-rose-200 bg-rose-50/60"
      : isGold
      ? "border-amber-200 bg-amber-50/60"
      : isEmerald
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-blue-200 bg-blue-50/60",
    badge: isRed
      ? "bg-rose-100/90 text-rose-800"
      : isGold
      ? "bg-amber-100/90 text-amber-900"
      : isEmerald
      ? "bg-emerald-100/90 text-emerald-800"
      : "bg-blue-100/90 text-[#0060A9]",
    barBg: isRed ? "bg-rose-500" : isGold ? "bg-amber-500" : isEmerald ? "bg-emerald-500" : "bg-[#0060A9]",
    footBg: isRed
      ? "bg-rose-50/80 text-rose-950 border-rose-200"
      : isGold
      ? "bg-amber-50/80 text-amber-950 border-amber-200"
      : isEmerald
      ? "bg-emerald-50/80 text-emerald-950 border-emerald-200"
      : "bg-blue-50/80 text-blue-950 border-blue-200",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Clean Title without Icon */}
        <div
          className={`flex shrink-0 items-center justify-between border-b ${theme.headerBorder} bg-gradient-to-r ${theme.headerGradient} px-6 py-4 sm:px-7`}
        >
          <div>
            <h3 className="text-lg font-black text-slate-900 leading-tight tracking-tight">{title}</h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
          {/* Hero Value - 100% Matched with Card */}
          <div className={`rounded-2xl border ${theme.heroBorder} p-4 text-center shadow-xs`}>
            <div className={`inline-flex items-center gap-1.5 rounded-full ${theme.badge} px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider mb-1.5`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Official value synchronized with KPI card</span>
            </div>
            <p className={`text-3xl sm:text-4xl font-black ${theme.heroText} tracking-tight`}>
              {formatNumber(kpiValue)}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-1">
              Total {label} in the current monitoring period
            </p>
          </div>

          {/* User-friendly explanations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                <span>What does it mean?</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {explanation.meaning}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                <span>How is it calculated?</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {explanation.calculation}
              </p>
            </div>
          </div>

          {/* Matrix Breakdown with Mini Bars */}
          {normalizedRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700">
                  {matrixTitle}
                </p>
                <span className="text-[10px] font-bold text-slate-500">
                  Total: {formatNumber(kpiValue)}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 text-left border-b border-slate-200/80">
                      <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                        Category / Region
                      </th>
                      <th className="px-2 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-center">
                        Share
                      </th>
                      <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {normalizedRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition">
                        <td className="px-3.5 py-2.5">
                          <p className="font-bold text-slate-800">{row.label}</p>
                          {row.sub && (
                            <p className="text-[9.5px] text-slate-400 mt-0.5">{row.sub}</p>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${theme.barBg}`}
                                style={{ width: `${Math.min(100, Math.max(2, parseFloat(row.sharePct)))}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">
                              {row.sharePct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-slate-900">
                          {formatNumber(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={`font-black border-t ${theme.footBg}`}>
                      <td className="px-3.5 py-2.5 text-[11px] uppercase tracking-wider">
                        Total Monitored
                      </td>
                      <td className="px-2 py-2.5 text-center text-[10px]">100.0%</td>
                      <td className={`px-3.5 py-2.5 text-right text-sm font-black ${theme.heroText}`}>
                        {formatNumber(kpiValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {normalizedRows.length > 10 && (
                <p className="mt-1.5 text-[9.5px] text-slate-400 text-right">
                  Showing the top 10 of {normalizedRows.length} entities
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  icon,
  tone = "blue",
  trend,
  currentMonth,
  previousMonth,
  subCards,
  infoModal,
  noun,
  shareLabel,
  footnote,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
  trend?: { current: number; previous: number };
  currentMonth?: string;
  previousMonth?: string;
  subCards?: {
    label: string;
    value: number | string;
    tone?: "emerald" | "amber" | "blue" | "red" | "slate" | "violet";
    hint?: string;
  }[];
  /** Plural noun used in captions, e.g. "deaths". */
  noun?: string;
  /** Label for the progress bar share of the first sub-stat, e.g. "reviewed". */
  shareLabel?: string;
  /** Short explanation pinned to the bottom of the card. */
  footnote?: string;
  infoModal?: {
    title: string;
    explanation: {
      meaning: string;
      calculation: string;
    };
    matrixTitle: string;
    matrix: { label: string; value: number; sub?: string }[];
  };
}) {
  const { t, locale } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const [modalOpen, setModalOpen] = useState(false);
  const currentMonthLabel = currentMonth
    ? new Intl.DateTimeFormat(numLocale, { month: "long" }).format(
        new Date(`${currentMonth}-01T00:00:00Z`),
      )
    : t("dashboard.thisMonth");
  const previousMonthLabel = previousMonth
    ? new Intl.DateTimeFormat(numLocale, { month: "long" }).format(
        new Date(`${previousMonth}-01T00:00:00Z`),
      )
    : t("dashboard.lastMonth");
  // PR 154 (cards): plain-English caption + compact breakdown.
  const caption = growthCaption(trend?.current ?? 0, trend?.previous ?? 0, {
    current: currentMonthLabel,
    previous: previousMonthLabel,
    noun: noun ?? label.toLowerCase(),
    fmt: (n) => formatNumber(n, numLocale),
    fmtPct: (n) => formatNumber(n, numLocale, { maximumFractionDigits: 1 }),
  });
  const SUB_DOT: Record<string, string> = { emerald: "bg-emerald-500", amber: "bg-amber-400", blue: "bg-[#0060A9]", red: "bg-[#ED2939]", violet: "bg-violet-500", slate: "bg-slate-300" };
  const breakdown = (() => {
    if (!subCards || subCards.length === 0) return null;
    const nums = subCards.map((s) => (typeof s.value === "number" ? s.value : null));
    const known = nums.every((n) => n !== null);
    const sum = known ? (nums as number[]).reduce((a, b) => a + b, 0) : 0;
    const share = known && sum > 0 ? ((nums[0] as number) / sum) * 100 : null;
    return {
      share,
      shareLabel: shareLabel ?? subCards[0].label.toLowerCase(),
      barClass: SUB_DOT[subCards[0].tone ?? "slate"] ?? "bg-slate-300",
      items: subCards.map((s) => ({ ...s, dotClass: SUB_DOT[s.tone ?? "slate"] ?? "bg-slate-300" })),
    };
  })();
  const color =
    tone === "red"
      ? "text-[#ED2939] bg-red-50/80"
      : tone === "gold" || tone === "orange"
        ? "text-[#B49B58] bg-[#fbf8ee]"
        : "text-[#0060A9] bg-blue-50/80";

  return (
    <>
      {infoModal && (
        <KpiInfoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={infoModal.title}
          kpiValue={value}
          label={label}
          tone={tone}
          icon={icon}
          explanation={infoModal.explanation}
          matrixTitle={infoModal.matrixTitle}
          matrix={infoModal.matrix}
        />
      )}
      <article
        className="relative flex h-full flex-col border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:border-[#0060A9]/40"
        style={{ borderRadius: "17px 17px 22px 17px" }}
      >
        {infoModal && (
          <button
            onClick={() => setModalOpen(true)}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-[#0060A9] transition shadow-xs"
            aria-label={`Info about ${label}`}
            title={`View Details & Explanation for ${label}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
        <p className="pr-8 text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">{label}</p>
        <p
          className={`mt-1.5 truncate text-[34px] sm:text-[38px] font-black leading-none tracking-tight ${tone === "red" ? "text-[#ED2939]" : tone === "gold" || tone === "orange" ? "text-[#B49B58]" : "text-[#0060A9]"}`}
        >
          {formatNumber(value, numLocale)}
        </p>
        {/* PR 154 (cards): plain-English month comparison with its basis stated. */}
        <p
          className={`mt-2 flex items-start gap-1 text-[11.5px] font-bold leading-snug ${caption.tone === "up" ? "text-emerald-700" : caption.tone === "down" ? "text-red-600" : "text-slate-600"}`}
          title={GROWTH_FOOTNOTE}
        >
          {caption.tone === "up" ? (
            <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : caption.tone === "down" ? (
            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : null}
          <span>{caption.headline}</span>
        </p>
        <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">{caption.detail}</p>
        {breakdown && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[10.5px] font-semibold text-slate-600">
              <span>
                {breakdown.share === null ? breakdown.shareLabel : `${formatNumber(breakdown.share, numLocale, { maximumFractionDigits: 0 })}% ${breakdown.shareLabel}`}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={breakdown.share ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={breakdown.shareLabel}
            >
              <div className={`h-full rounded-full ${breakdown.barClass}`} style={{ width: `${breakdown.share ?? 0}%` }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
              {breakdown.items.map((it, idx) => (
                <span key={idx} className="inline-flex items-center gap-1" title={it.hint}>
                  <span className={`inline-block h-2 w-2 rounded-full ${it.dotClass}`} />
                  {it.label}{" "}
                  <b className="font-bold text-slate-800">
                    {typeof it.value === "number" ? formatNumber(it.value, numLocale) : it.value}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}
        {footnote && (
          <p className="mt-auto border-t border-slate-100 pt-2 text-[10px] leading-snug text-slate-400">
            <span className="mt-2 block">{footnote}</span>
          </p>
        )}
      </article>
    </>
  );
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const { t, locale, translateDisease, translateSeverity } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const currentYear = new Date().getFullYear();
  const currentEpi = getCurrentEpiWeek();
  const [filters, setFilters] = useState<EpiFilterState>({
    disease: "all",
    country: "ASEAN",
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
      const ctry = sp.get("country");
      if (sY || sW || eY || eW || dis || ctry) {
        setFilters((prev) => ({
          ...prev,
          startYear: sY ? Number(sY) : prev.startYear,
          startWeek: sW ? Number(sW) : prev.startWeek,
          endYear: eY ? Number(eY) : prev.endYear,
          endWeek: eW ? Number(eW) : prev.endWeek,
          disease: dis || prev.disease,
          country: ctry || prev.country,
        }));
      }
    }
  }, []);
  const [data, setData] = useState<PublicDashboard | null>(null);
  const [selected, setSelected] = useState<OutbreakLocation | null>(null);
  const [signalArticle, setSignalArticle] = useState<CrawlHistoryRow | null>(null);
  const [signalEvents, setSignalEvents] = useState<CrawlHistoryRow[]>([]);
  const [signalReady, setSignalReady] = useState(false);
  const openSignal = (row: OutbreakLocation | null) => {
    const url = row?.detail?.url?.trim();
    setSignalArticle(null);
    setSignalEvents([]);
    setSignalReady(!row || !url);
    setSelected(row);
  };
  const [signalOrder, setSignalOrder] = useState<SignalOrder>("case");
  const signalOrderLabel = (order: SignalOrder) =>
    order === "published"
      ? t("dashboard.ewsOrderPublished")
      : order === "crawled"
        ? t("dashboard.ewsOrderCrawled")
        : t("dashboard.ewsOrderCase");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [crawlingStats, setCrawlingStats] = useState<CrawlingStats | null>(null);
  const [crawlSummary, setCrawlSummary] = useState<CrawlHistorySummary | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const url = selected?.detail?.url?.trim();
    if (!selected) return;
    if (!url) {
      setSignalArticle(null);
      setSignalEvents([]);
      setSignalReady(true);
      return;
    }
    let active = true;
    setSignalReady(false);
    setSignalArticle(null);
    setSignalEvents([]);
    fetchCrawlHistoryRows({ q: url, per_page: 1, quality: "all" })
      .then(async (page) => {
        const row = page.data?.[0];
        if (!row?.id) return null;
        return fetchCrawlHistoryRow(row.id, row.crawl_channel);
      })
      .then((full) => {
        if (!active) return;
        const events = reviewEventRows(full?.children?.length ? full.children : full ? [full] : []) as CrawlHistoryRow[];
        setSignalArticle(full);
        setSignalEvents(events);
      })
      .catch(() => {
        if (!active) return;
        setSignalArticle(null);
        setSignalEvents([]);
      })
      .finally(() => {
        if (active) setSignalReady(true);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const refreshCrawlingStats = useCallback(async () => {
    const crawlData = await fetchCrawlingStats().catch(() => null);
    if (crawlData) setCrawlingStats(crawlData);
  }, []);

  const dashboardApiFilters = useCallback((active: EpiFilterState) => ({
    country: active.country,
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
      const [dashData, kpiData, crawlData, summaryData] = await Promise.all([
        fetchPublicDashboard(dashboardFilters),
        fetchKpiSnapshot(dashboardFilters).catch(() => null),
        fetchCrawlingStats().catch(() => null),
        fetchCrawlHistorySummary().catch(() => null),
      ]);
      if (kpiData?.kpis) {
        dashData.kpis = { ...dashData.kpis, ...kpiData.kpis };
      }
      setData(dashData);
      if (crawlData) setCrawlingStats(crawlData);
      if (summaryData) setCrawlSummary(summaryData);
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

  // Keep the collector KPI live without reloading the heavier dashboard payload.
  useEffect(() => {
    void refreshCrawlingStats();
    const id = window.setInterval(() => void refreshCrawlingStats(), 15_000);
    return () => window.clearInterval(id);
  }, [refreshCrawlingStats]);

  useEffect(() => {
    const available = data?.available_years;
    if (available?.length && !available.includes(filters.endYear)) {
      setFilters(prev => ({ ...prev, endYear: available[0], startYear: available[0] }));
    }
  }, [data?.available_years, filters.endYear]);

  const mapLocations = useMemo(
    () => scopeDashboardLocations(data?.locations, filters.country),
    [data?.locations, filters.country],
  );

  const countryData = data?.by_country ?? [];
  const mapScope =
    filters.country === "global" ||
    (!isAseanDefaultScope(filters.country) && !isAseanCountryName(filters.country))
      ? "global"
      : "asean";

  const sortedAlerts = useMemo(() => {
    const feed = data?.signal_feed?.length ? data.signal_feed : data?.alerts;
    if (!feed?.length) return [];
    const now = Date.now();
    const newest = feed
      // PR 123: an explicitly (manually) published event stays even when the model said not health-related.
      .filter((a) => a.detail?.is_health_related !== false || a.detail?.publish_source === 'manual')
      .map((a) => ({ alert: a, time: getAlertTimestamp(a, signalOrder) }))
      .filter(({ time }) => time > 0 && time <= now)
      .sort((a, b) => b.time - a.time || (b.alert.cases ?? 0) - (a.alert.cases ?? 0))
      .map(({ alert }) => alert);
    // One card per article and case count; PR 132: all of them, shown a page at a time.
    return takeUniqueSignals(newest, Number.POSITIVE_INFINITY);
  }, [data?.signal_feed, data?.alerts, signalOrder]);
  const signalPageSize = data?.signal_feed_page_size ?? 20;
  const [signalVisible, setSignalVisible] = useState(20);
  useEffect(() => setSignalVisible(signalPageSize), [signalOrder, signalPageSize, data?.signal_feed]);
  const visibleAlerts = useMemo(() => sortedAlerts.slice(0, signalVisible), [sortedAlerts, signalVisible]);

  // Dynamic Reviewed vs Unreviewed breakdown (Health-focused)
  const casesTotal = data?.kpis.cases ?? 0;
  const deathsTotal = data?.kpis.deaths ?? 0;
  const locationsTotal = data?.kpis.locations ?? 0;

  const casesReviewed = useMemo(() => {
    if (data?.kpis.cases_reviewed !== undefined && data?.kpis.cases_reviewed !== null) {
      return data.kpis.cases_reviewed;
    }
    return null;
  }, [data?.kpis.cases_reviewed]);

  const casesUnreviewed = useMemo(() => {
    if (data?.kpis.cases_unreviewed !== undefined && data?.kpis.cases_unreviewed !== null) {
      return data.kpis.cases_unreviewed;
    }
    return casesReviewed === null ? null : Math.max(0, casesTotal - casesReviewed);
  }, [data?.kpis.cases_unreviewed, casesTotal, casesReviewed]);

  const deathsReviewed = useMemo(() => {
    if (data?.kpis.deaths_reviewed !== undefined && data?.kpis.deaths_reviewed !== null) {
      return data.kpis.deaths_reviewed;
    }
    return null;
  }, [data?.kpis.deaths_reviewed]);

  const deathsUnreviewed = useMemo(() => {
    if (data?.kpis.deaths_unreviewed !== undefined && data?.kpis.deaths_unreviewed !== null) {
      return data.kpis.deaths_unreviewed;
    }
    return deathsReviewed === null ? null : Math.max(0, deathsTotal - deathsReviewed);
  }, [data?.kpis.deaths_unreviewed, deathsTotal, deathsReviewed]);

  const locationsMapped = useMemo(() => {
    if (data?.kpis.locations_mapped !== undefined && data?.kpis.locations_mapped !== null) {
      return data.kpis.locations_mapped;
    }
    const withCoords = mapLocations.filter((l) => (l.latitude && l.latitude !== 0) || (l.longitude && l.longitude !== 0)).length;
    return withCoords || (crawlSummary?.with_geo ?? locationsTotal);
  }, [data?.kpis.locations_mapped, mapLocations, crawlSummary, locationsTotal]);

  const locationsUnmapped = useMemo(() => {
    if (data?.kpis.locations_unmapped !== undefined && data?.kpis.locations_unmapped !== null) {
      return data.kpis.locations_unmapped;
    }
    return crawlSummary?.without_geo ?? 0;
  }, [data?.kpis.locations_unmapped, crawlSummary]);

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

      <EpiFilterBar
        availableDiseases={data?.available_diseases}
        availableYears={data?.available_years}
        currentEpiWeek={data?.current_epi_week}
        currentEpiYear={data?.current_epi_year}
        value={filters}
        onChange={(newFilters) => setFilters(newFilters)}
        onApply={(newFilters) => {
          setFilters(newFilters);
          load(newFilters);
        }}
        isLoading={loading}
      />


      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Live crawling pipeline KPI (Synchronized with real DB records) */}
        <article
          className="relative min-h-[158px] border border-emerald-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(5,150,105,.08)] transition hover:-translate-y-0.5 hover:border-emerald-400"
          style={{ borderRadius: "17px 17px 22px 17px" }}
        >
          <CrawlingInfoModal crawlingStats={crawlingStats} />
          <LivePipelineCard crawlingStats={crawlingStats} locale={numLocale} />
        </article>
        <Kpi
          label={t("dashboard.kpiDetectedCases")}
          value={data?.kpis.cases ?? 0}
          icon={<Bug className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.cases}
          noun="cases"
          shareLabel="reviewed"
          footnote="Comparison = this month so far vs all of last month. Reviewed = confirmed by an analyst; Unreviewed = auto-extracted, awaiting review."
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          subCards={[
            {
              label: "Reviewed",
              value: casesReviewed ?? "-",
              hint: "Confirmed by an analyst",
              tone: "emerald",
            },
            {
              label: "Unreviewed",
              value: casesUnreviewed ?? "-",
              tone: "amber",
            },
          ]}
          infoModal={{
            title: t("dashboard.kpiInfo.casesTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.casesMeaning"),
              calculation: t("dashboard.kpiInfo.casesCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.casesMatrix"),
            matrix: (data?.by_country ?? []).map((c) => ({
              label: c.name,
              value: c.cases,
            })),
          }}
        />
        <Kpi
          label={t("dashboard.kpiDeaths")}
          value={data?.kpis.deaths ?? 0}
          icon={<Skull className="h-5 w-5" />}
          tone="red"
          trend={data?.trends?.deaths}
          noun="deaths"
          shareLabel="reviewed"
          footnote="Deaths reported in detected articles. Reviewed = confirmed by an analyst; Unreviewed = awaiting review."
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          subCards={[
            {
              label: "Reviewed",
              value: deathsReviewed ?? "-",
              tone: "emerald",
            },
            {
              label: "Unreviewed",
              value: deathsUnreviewed ?? "-",
              tone: "amber",
            },
          ]}
          infoModal={{
            title: t("dashboard.kpiInfo.deathsTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.deathsMeaning"),
              calculation: t("dashboard.kpiInfo.deathsCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.deathsMatrix"),
            matrix: mapLocations
              .reduce<{ label: string; value: number }[]>((acc, loc) => {
                const existing = acc.find((x) => x.label === loc.country);
                if (existing) { existing.value += loc.deaths; } else { acc.push({ label: loc.country, value: loc.deaths }); }
                return acc;
              }, [])
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value),
          }}
        />
        <Kpi
          label={t("dashboard.kpiLocations")}
          value={data?.kpis.locations ?? 0}
          icon={<MapPin className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.locations}
          noun="new locations"
          shareLabel="geocoded"
          footnote="Geocoded = placed on the map with coordinates; Unmapped = place name found but not yet located."
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          subCards={[
            {
              label: "Geocoded",
              value: locationsMapped,
              tone: "blue",
            },
            {
              label: "Unmapped",
              value: locationsUnmapped,
              tone: "amber",
            },
          ]}
          infoModal={{
            title: t("dashboard.kpiInfo.locationsTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.locationsMeaning"),
              calculation: t("dashboard.kpiInfo.locationsCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.locationsMatrix"),
            matrix: mapLocations
              .reduce<{ label: string; value: number }[]>((acc, loc) => {
                const existing = acc.find((x) => x.label === loc.country);
                if (existing) { existing.value += 1; } else { acc.push({ label: loc.country, value: 1 }); }
                return acc;
              }, [])
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value),
          }}
        />
        {/* ── Total Crawling Card ── */}
      </div>


      <section className="w-full bg-[#f8fafc] pb-5">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[381px_minmax(0,1fr)] xl:items-stretch">
          <section
            className="flex overflow-hidden border border-[#cfe0f1] bg-gradient-to-b from-[#f0f6fc] to-[#e8f1fa] xl:h-[700px] 2xl:h-[760px] xl:w-[381px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex w-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                    {t("dashboard.ewsTitle")}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.ewsSubtitleBy", { mode: signalOrderLabel(signalOrder).toLowerCase() })}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                  {sortedAlerts.length} Active
                </span>
              </div>
              <div
                role="radiogroup"
                aria-label={t("dashboard.ewsOrderLabel")}
                className="mx-3 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-blue-200/80 bg-white/80 p-1"
              >
                {(["case", "published", "crawled"] as const).map((order) => (
                  <button
                    key={order}
                    type="button"
                    role="radio"
                    aria-checked={signalOrder === order}
                    onClick={() => setSignalOrder(order)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                      signalOrder === order
                        ? "bg-[#0060A9] text-white shadow-sm"
                        : "text-slate-600 hover:bg-blue-50"
                    }`}
                  >
                    {signalOrderLabel(order)}
                  </button>
                ))}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {visibleAlerts.length ? (
                  visibleAlerts.map((a, i) => (
                    <button
                      key={`${a.detail?.event_id || a.detail?.url || a.location_name}-${a.disease}-${i}`}
                      type="button"
                      onClick={() => openSignal(a)}
                      className="group w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">
                            {translateDisease(a.disease)}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {a.location_name}, {a.country}
                            {a.detail?.source_name ? ` • ${a.detail.source_name}` : ""}
                          </p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#0060A9] border border-blue-200/80 transition group-hover:bg-[#0060A9] group-hover:text-white shrink-0"
                        >
                          <span>View Details</span>
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        <b title={countText(a, "cases") === "-" ? "Not reported" : undefined}>{countText(a, "cases", (n: number) => formatNumber(n, numLocale))}</b> {t("dashboard.casesUnit")} •{" "}
                        <b title={countText(a, "deaths") === "-" ? "Not reported" : undefined}>{countText(a, "deaths", (n: number) => formatNumber(n, numLocale))}</b> {t("dashboard.deathsUnit")} • {signalOrderLabel(signalOrder)}:{" "}
                        {signalOrder === "case"
                          ? <span title={caseDateTitle(a)}>{caseDateText(a)}</span>
                          : formatPublishDate(getAlertDate(a, signalOrder), numLocale)}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="p-8 text-center text-sm text-slate-400">
                    {t("dashboard.noAlerts")}
                  </p>
                )}
                {sortedAlerts.length > visibleAlerts.length && (
                  <button
                    type="button"
                    onClick={() => setSignalVisible((n) => n + signalPageSize)}
                    className="w-full rounded-xl border border-blue-200 bg-white py-2 text-xs font-bold text-[#0060A9] hover:bg-blue-50"
                  >
                    {t("dashboard.ewsLoadMore", { shown: visibleAlerts.length, total: sortedAlerts.length })}
                  </button>
                )}
              </div>
              <div className="border-t border-blue-200/70 bg-white/70 px-4 py-3 text-[10px] font-bold text-slate-500">
                {t("dashboard.ewsFootnoteBy", { mode: signalOrderLabel(signalOrder).toLowerCase() })}
              </div>
            </div>
          </section>

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
                    {t(filters.country === "global" ? "dashboard.regionGlobalLocations" : "dashboard.regionAseanLocations", { count: data?.kpis.locations ?? 0 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 min-h-[460px] w-full flex-1 overflow-hidden rounded-xl">
              <SpatialOutbreakMap
                countries={countryData}
                locations={mapLocations}
                boundaryScope={mapScope}
                initialCenter={mapScope === "global" ? [12, 18] : undefined}
                initialZoom={mapScope === "global" ? 2 : undefined}
              />
            </div>
          </article>
        </div>
      </section>

      {/* SKDR: NLP crawl/IBS performance, heatmap, trend and morbidity sections are not copied yet (no form-data endpoints). */}

      {/* Temporarily hidden: Case Distribution by Health Topic and Country Distribution. */}
      {false && (
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.casesByDisease")}
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <BarChart
                data={(data?.by_disease ?? []).slice(0, 8).map(d => ({
                  ...d,
                  name: translateDisease(d.name)
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="cases" fill="#0060A9" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.countryDistribution")}
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={countryData}
                  dataKey="cases"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  label={({ name }) => name}
                >
                  {countryData.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      )}

      {/* Temporarily hidden: Surveillance Summary by Location. */}
      {false && (
      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.summaryByLocation")}
          </h2>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            {data ? new Date(data.updated_at).toLocaleString(numLocale) : "-"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("dashboard.colLocation")}</th>
                <th className="px-4 py-3">{t("dashboard.colDisease")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colCases")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colDeaths")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colConfidence")}</th>
                <th className="px-4 py-3 text-center">{t("dashboard.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {mapLocations.slice(0, 20).map((r, i) => (
                <tr
                  key={i}
                  onClick={() => openSignal(r)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50"
                  title={t("dashboard.rowTooltip")}
                >
                  <td className="px-4 py-3 font-semibold">
                    {r.location_name}
                    <span className="block text-xs font-normal text-slate-400">
                      {r.country}
                    </span>
                  </td>
                  <td className="px-4 py-3">{translateDisease(r.disease)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatNumber(r.cases ?? 0, numLocale)}
                  </td>
                  <td className="px-4 py-3 text-right">{r.deaths}</td>
                  <td className="px-4 py-3 text-right">
                    {r.confidence == null
                      ? "-"
                      : `${Math.round(r.confidence * 100)}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        r.severity ? severityClass[r.severity] : "bg-blue-100 text-[#0060A9]"
                      }`}
                    >
                      {translateSeverity(r.severity)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {mounted && selected && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xs transition-all duration-300 animate-in fade-in"
          onClick={() => openSignal(null)}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-bold text-slate-900">
                    {t("dashboard.eventModal.badgeDetails")}
                  </h2>
                  {signalReady && (signalEvents.some((row) => row.needs_review) || signalArticle?.needs_review) ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      <Clock3 className="h-3.5 w-3.5" /> Needs Review
                    </span>
                  ) : signalReady ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed
                    </span>
                  ) : (
                    <span className="inline-block h-5 w-24 animate-pulse rounded-full bg-slate-200" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Read only. Each stored event is one row.
                </p>
              </div>
              <button
                onClick={() => openSignal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={t("dashboard.modalClose")}
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-w-0 flex-1 space-y-5 overflow-y-auto p-4 text-xs leading-relaxed text-slate-800 sm:p-6">
              {!signalReady ? <SignalModalSkeleton /> : (
                <>
              <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h3 className="break-words text-sm font-bold leading-snug text-slate-900">
                  {signalArticle?.title || signalArticle?.article_title || "—"}
                </h3>
                {(signalArticle?.url || selected.detail?.url) ? (
                  <a
                    href={signalArticle?.url || selected.detail?.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex max-w-full items-center gap-1.5 font-semibold text-[#0060A9] hover:underline"
                    title={signalArticle?.url || selected.detail?.url || ""}
                  >
                    <span className="truncate">{signalArticle?.url || selected.detail?.url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                    <CountryFlag countryName={signalEvents[0]?.country || selected.country} size={14} />
                    <span>{signalEvents[0]?.country || selected.country || "—"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                    <Radio className="h-3 w-3 text-slate-400" />
                    <span>{signalArticle?.source_name || signalArticle?.source_type || selected.detail?.source_name || selected.detail?.source_type || "—"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700">
                    <CalendarDays className="h-3 w-3 text-slate-400" />
                    <span>Published: {formatPublishDate(signalArticle?.published_at || signalArticle?.article_date || selected.detail?.published_at, numLocale)}</span>
                  </span>
                  {(signalArticle?.language || selected.detail?.language) ? (
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                      Lang: {signalArticle?.language || selected.detail?.language}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="w-full min-w-0 overflow-hidden rounded-xl border border-blue-200/90 bg-gradient-to-br from-blue-50/50 via-white to-sky-50/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900">
                  <Sparkles className="h-4 w-4 text-[#0060A9]" />
                  <span>Article Summary</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                  {signalArticle?.summary
                    ? signalArticle.summary
                    : cleanArticleContent(signalArticle?.content, t("dashboard.noSourceContent"))}
                </p>
              </div>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-5 py-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Surveillance events ({signalEvents.length} event{signalEvents.length === 1 ? "" : "s"})
                    </h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Display only. Correct an event from the data matrix.
                    </p>
                  </div>
                  {selected.detail?.url ? (
                    <Link
                      href={`/crawl-history?q=${encodeURIComponent(selected.detail.url)}`}
                      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#0060A9] hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t("dashboard.eventModal.openMatrix")}
                    </Link>
                  ) : null}
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-600">
                        <th className="w-10 px-3.5 py-2.5 text-center">#</th>
                        <th className="w-44 px-3.5 py-2.5">Disease</th>
                        <th className="w-40 px-3.5 py-2.5">Country</th>
                        <th className="w-28 px-3.5 py-2.5">Region</th>
                        <th className="w-44 px-3.5 py-2.5">Province & City</th>
                        <th className="w-24 px-3.5 py-2.5 text-right">Cases</th>
                        <th className="w-24 px-3.5 py-2.5 text-right">Deaths</th>
                        <th className="w-32 px-3.5 py-2.5">Date Case</th>
                        <th className="px-3.5 py-2.5">Evidence Excerpt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {signalEvents.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-6 text-center text-[11px] text-slate-500">No stored event for this article.</td>
                        </tr>
                      ) : signalEvents.map((evt, idx) => {
                        const place = evt.city || evt.province_city_case || evt.location_name || "—"
                        const provinceName = evt.province && evt.province !== place ? evt.province : ""
                        const evidenceVal = evt.evidence || evt.snippet || ""
                        const deathsVal = Number(evt.deaths ?? 0)
                        return (
                          <tr key={evt.id || idx} className={idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}>
                            <td className="px-3 py-3 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-start gap-1.5">
                                <Bug className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0060A9]" />
                                <span className="block font-bold leading-tight text-slate-900">{translateDisease(evt.disease) || "—"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <CountryFlag countryName={evt.country || ""} size={14} />
                                <span className="truncate font-semibold text-slate-800">{evt.country || "—"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[11px] font-semibold text-slate-600">{evt.region || evt.surveillance_scope || "—"}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-start gap-1.5">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                                <div className="text-[11px]">
                                  <span className="block font-bold text-slate-900">{place}</span>
                                  {provinceName ? <span className="block text-[10px] text-slate-500">Province: {provinceName}</span> : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-xs font-extrabold text-emerald-700">{Number(evt.cases ?? 0).toLocaleString(numLocale)}</td>
                            <td className={`px-3 py-3 text-right font-mono text-xs font-bold ${deathsVal > 0 ? "font-extrabold text-rose-700" : "text-slate-500"}`}>{deathsVal.toLocaleString(numLocale)}</td>
                            <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{(evt.date_case || "—").slice(0, 10)}</td>
                            <td className="px-3.5 py-3">
                              <span className="block max-w-sm truncate text-[11px] italic text-slate-600" title={evidenceVal}>
                                {evidenceVal ? `"${evidenceVal}"` : "—"}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <article className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {t("dashboard.eventModal.originalContent")}
                  </p>
                  {(signalArticle?.url || selected.detail?.url) ? (
                    <a
                      href={signalArticle?.url || selected.detail?.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {t("dashboard.eventModal.openSource")}
                    </a>
                  ) : null}
                </div>
                <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                  {cleanArticleContent(signalArticle?.content || signalArticle?.summary, t("dashboard.noSourceContent"))}
                </p>
              </article>
                </>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

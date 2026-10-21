"use client";

// PR 101: live pipeline KPI card. Polls the cheap /api/v1/crawling-stats/live
// endpoint at the DB-configured interval (system_settings.dashboard_live).
// PR 146: also polls /api/v1/crawling-stats/activity (slower, cached server side) for
// added/processed per window, a per-hour sparkline, deltas vs N min ago (from status
// snapshots, not the previous poll), oldest waiting age, last batch, last crawler run,
// stall / no-new-data alerts and queue (DLQ / consumer) alerts. Windows, thresholds and
// the display time zone all come from dashboard_live.
// PR 152 (Yosua): the card is now a clean summary of three tiles (Collected, Processed,
// Health stored) with total, +N per window and growth rate. Revision: no charts /
// sparklines / hourly bars, just the numbers, under "Total Collected (All-Time)". Failed / stuck / duplicate /
// archived / non-health / waiting / in-progress / queue alerts are handled by the system and
// are not shown here; the API still returns them for admin pages.
import { useEffect, useRef, useState } from "react";
import {
  fetchCrawlingStatsActivity,
  fetchCrawlingStatsLive,
  type CrawlingStats,
  type CrawlingStatsActivity,
  type CrawlingStatsLive,
  type StatusBreakdown,
} from "@/lib/api";

const DEFAULT_POLL_SECONDS = 8;
const MIN_POLL_SECONDS = 5;
const DEFAULT_ACTIVITY_POLL_SECONDS = 60;

function fmt(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

export function AnimatedCount({ value, locale, className }: { value: number; locale: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value]);
  return <span className={`tabular-nums ${className ?? ""}`}>{fmt(shown, locale)}</span>;
}

export function Delta({ delta, locale, title, suffix }: { delta: number; locale: string; title?: string; suffix?: string }) {
  const tail = suffix ? ` (${suffix})` : "";
  if (!delta) {
    return (
      <span className="whitespace-nowrap rounded bg-slate-100 px-1 text-[8px] font-bold text-slate-400" title={title}>
        ±0{tail}
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`whitespace-nowrap rounded px-1 text-[8px] font-black ${up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}
      title={title}
    >
      {up ? "▲ +" : "▼ −"}
      {fmt(Math.abs(delta), locale)}
      {tail}
    </span>
  );
}

function breakdownFrom(stats: CrawlingStats | null): StatusBreakdown | null {
  return stats?.status_breakdown ?? null;
}

/** "45 min", "3h 10m", "2d 4h". */
export function formatAge(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "–";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Clock time in the DB-configured display zone, with its label (e.g. "06:20 WIB"). */
export function formatClock(iso: string | null | undefined, zone: string | null | undefined, zoneLabel: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
  if (zone) opts.timeZone = zone;
  if (!zoneLabel) opts.timeZoneName = "short";
  let text: string;
  try {
    text = new Intl.DateTimeFormat("en-GB", opts).format(date);
  } catch {
    text = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  if (ageDays >= 1) {
    const dayOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    if (zone) dayOpts.timeZone = zone;
    try {
      text = `${new Intl.DateTimeFormat("en-GB", dayOpts).format(date)} ${text}`;
    } catch {
      /* keep time only */
    }
  }
  return zoneLabel ? `${text} ${zoneLabel}` : text;
}

// PR 152: summary tiles (Collected / Processed / Health stored). Replaces the crammed
// status grid; Failed, Stuck, Duplicate, Archived, Non-health, Waiting, In progress, queue
// alerts and "other" are handled by the system and no longer shown here (still in the API).

type Tone = "emerald" | "blue" | "teal";

const TILE_TONES: Record<Tone, { value: string; chip: string }> = {
  emerald: { value: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700" },
  blue: { value: "text-blue-600", chip: "bg-blue-50 text-blue-700" },
  teal: { value: "text-teal-600", chip: "bg-teal-50 text-teal-700" },
};

/** Growth rate of a window vs the total before it: added / (total − added). Null if unknown. */
export function growthRate(total: number, added: number | null | undefined): number | null {
  if (added === null || added === undefined || !Number.isFinite(added)) return null;
  const base = total - added;
  if (base <= 0) return null;
  return (added / base) * 100;
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "–";
  const digits = Math.abs(rate) < 10 ? 2 : 1;
  return `${rate >= 0 ? "+" : "−"}${Math.abs(rate).toFixed(digits)}%`;
}

export function SummaryTile({
  label,
  hint,
  total,
  shortAdded,
  longAdded,
  shortLabel,
  longLabel,
  tone,
  locale,
}: {
  label: string;
  hint: string;
  total: number;
  shortAdded: number | null;
  longAdded: number | null;
  shortLabel: string;
  longLabel: string;
  tone: Tone;
  locale: string;
}) {
  const rate = growthRate(total, longAdded);
  const t = TILE_TONES[tone];
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm" title={hint}>
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <AnimatedCount value={total} locale={locale} className={`mt-1 block truncate text-2xl font-black leading-none tracking-tight ${t.value}`} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-slate-500">
        <span className={`rounded px-1.5 py-0.5 font-black ${t.chip}`} title={`Growth in the last ${longLabel} vs the total before it`}>
          {formatRate(rate)} <span className="font-semibold">/ {longLabel}</span>
        </span>
      </div>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">
        <b className="text-slate-700">+{shortAdded === null ? "–" : fmt(shortAdded, locale)}</b> in {shortLabel}
        <span className="text-slate-300"> · </span>
        <b className="text-slate-700">+{longAdded === null ? "–" : fmt(longAdded, locale)}</b> in {longLabel}
      </p>
    </div>
  );
}

export default function LivePipelineCard({
  crawlingStats,
  locale,
}: {
  crawlingStats: CrawlingStats | null;
  locale: string;
}) {
  const [live, setLive] = useState<CrawlingStatsLive | null>(null);
  const [activity, setActivity] = useState<CrawlingStatsActivity | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const pollSeconds = Math.max(MIN_POLL_SECONDS, live?.poll_seconds ?? DEFAULT_POLL_SECONDS);
  const activityPollSeconds = Math.max(pollSeconds, activity?.poll_seconds ?? DEFAULT_ACTIVITY_POLL_SECONDS);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = window.setTimeout(tick, pollSeconds * 1000);
        return;
      }
      try {
        const next = await fetchCrawlingStatsLive();
        if (cancelled) return;
        setLive(next);
        setUpdatedAt(Date.now());
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) timer = window.setTimeout(tick, pollSeconds * 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollSeconds]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (!(typeof document !== "undefined" && document.hidden)) {
        try {
          const next = await fetchCrawlingStatsActivity();
          if (cancelled) return;
          setActivity(next);
        } catch {
          /* activity is optional; the live counters keep working */
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, activityPollSeconds * 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activityPollSeconds]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const breakdown = live?.status_breakdown ?? breakdownFrom(crawlingStats);
  const total = live?.total ?? crawlingStats?.total ?? crawlingStats?.total_crawled_all_time ?? 0;
  const processedTotal = breakdown ? Number(breakdown.processed_health || 0) + Number(breakdown.non_health || 0) : Number(crawlingStats?.total_processed ?? 0);
  const healthTotal = breakdown ? Number(breakdown.processed_health || 0) : 0;
  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const isFresh = !failed && ago !== null && ago <= pollSeconds * 2 + 2;
  const running = Number(crawlingStats?.active_run_count || 0) > 0;

  const zone = activity?.display_time_zone ?? null;
  const zoneLabel = activity?.display_time_zone_label ?? null;
  // Both windows come from system_settings.dashboard_live (delta_window_hours, long_window_hours).
  const shortLabel = activity ? `${activity.delta_window_hours}h` : "–";
  const longLabel = activity ? `${activity.long_window_hours}h` : "–";
  const lastRun = activity?.last_run;
  const lastRunAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2 pr-7">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">Total Collected (All-Time)</p>
        <span
          className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${running ? "text-emerald-600" : "text-slate-400"}`}
          title={lastRun?.records_found != null ? `Last run: ${lastRun.status ?? "–"}, ${lastRun.records_found} records found` : undefined}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
          {running ? "Crawler running" : "Crawler idle"}
          {!running && lastRunAt ? (
            <span className="font-semibold normal-case tracking-normal">· last run {formatClock(lastRunAt, zone, zoneLabel)}</span>
          ) : null}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SummaryTile
          label="Collected"
          hint="All items collected by the crawlers (all-time)"
          total={total}
          shortAdded={activity ? activity.added_delta_window : null}
          longAdded={activity ? activity.added_long : null}
          shortLabel={shortLabel}
          longLabel={longLabel}
          tone="emerald"
          locale={locale}
        />
        <SummaryTile
          label="Processed"
          hint="Items that finished NLP (health and non-health)"
          total={processedTotal}
          shortAdded={activity ? activity.processed_delta_window : null}
          longAdded={activity ? activity.processed_long : null}
          shortLabel={shortLabel}
          longLabel={longLabel}
          tone="blue"
          locale={locale}
        />
        <SummaryTile
          label="Health stored"
          hint="Processed items classified as health-related"
          total={healthTotal}
          shortAdded={activity ? activity.health_delta_window : null}
          longAdded={activity ? activity.health_long : null}
          shortLabel={shortLabel}
          longLabel={longLabel}
          tone="teal"
          locale={locale}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-semibold text-slate-400">
        <span className="inline-flex items-center gap-1" title={`Refreshes every ${pollSeconds}s`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isFresh ? "animate-pulse bg-emerald-500" : failed ? "bg-rose-500" : "bg-slate-300"}`} />
          {failed ? "Live update failed, retrying" : ago === null ? "Connecting…" : `Live · updated ${ago}s ago`}
        </span>
        {activity?.last_added_at ? (
          <span title={`Newest collected item; batch = items within ${activity.batch_gap_minutes} min of it`}>
            Last batch <b className="text-slate-600">{formatClock(activity.last_added_at, zone, zoneLabel)}</b>
            {activity.last_batch_size ? ` (+${fmt(activity.last_batch_size, locale)})` : ""}
          </span>
        ) : null}
        {activity ? <span>Growth rate = items added in the window vs the total before it</span> : null}
      </div>
    </div>
  );
}

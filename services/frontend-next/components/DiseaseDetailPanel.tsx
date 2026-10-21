'use client'

// PR 116 — Left-side disease detail panel (epidemiologist view).
// Opens when a disease/outbreak point is clicked on AseanMap (flowDisease).
// Uses only the outbreak locations already loaded by the map; no extra backend call.

import { useEffect, useMemo, useRef } from "react";
import { X, ExternalLink, Activity, Skull, MapPin, CalendarDays, Globe, Star } from "lucide-react";
import { matchRelatedNews, rowMatchKeys } from "@/lib/related-news-highlight.mjs";
import type { OutbreakLocation } from "@/types";
import { getMmwrEpiWeek } from "@/lib/epi-week";

type Props = {
  disease: string;
  locations: OutbreakLocation[];
  displayName?: string;
  onClose: () => void;
  /** PR 117: controls the slide-in/out transition; the parent keeps the panel mounted while closing. */
  open?: boolean;
  /** Spike rule: week cases > mean + spikeSdFactor * SD of all weeks with data. Pass from settings when available. */
  spikeSdFactor?: number;
  /** Max related articles listed. */
  maxArticles?: number;
  /** PR 134: the clicked map point; its related news items are starred, highlighted and scrolled into view. */
  highlightLocation?: OutbreakLocation | null;
  /** Hide the Spread route mini-map when requested */
  hideSpreadRoute?: boolean;
};

export type RelatedArticle = {
  url: string;
  title: string;
  date: string;
  place: string;
  /** PR 134: ids and location|date keys of the map rows that cite this article. */
  eventIds: string[];
  reportIds: string[];
  placeDates: string[];
};

// Same ordering as the spread-flow layer in AseanMap.tsx.
export const flowDate = (l: OutbreakLocation) =>
  l.sort_date || l.case_date || l.latest_date || l.published_date || "";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const day = (s: string) => (s ? s.slice(0, 10) : "");
const fmt = (n: number) => n.toLocaleString();

export function buildDiseaseDetail(disease: string, all: OutbreakLocation[], spikeSdFactor = 2) {
  const target = disease.trim().toLowerCase();
  // Human event rows only: rows flagged non-health are excluded. (Animal/historical
  // flags are not present on OutbreakLocation; see docs/PR/116 open issues.)
  const rows = all.filter(
    (l) =>
      (l.disease || "").trim().toLowerCase() === target &&
      l.detail?.is_health_related !== false,
  );
  const dated = rows
    .map((l) => ({ loc: l, date: day(flowDate(l)) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const withDate = dated.filter((d) => d.date);
  const firstDate = withDate[0]?.date || "";
  const lastDate = withDate[withDate.length - 1]?.date || "";

  const locKey = (l: OutbreakLocation) =>
    `${(l.country || "").toLowerCase()}|${(l.location_name || "").toLowerCase()}`;
  const affectedLocations = new Set(rows.map(locKey)).size;

  // Weekly (MMWR epi week) case totals.
  const weekMap: Record<string, { key: string; label: string; cases: number; deaths: number }> = {};
  withDate.forEach(({ loc, date }) => {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const { year, week } = getMmwrEpiWeek(d);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    weekMap[key] = weekMap[key] || { key, label: `W${week} ${year}`, cases: 0, deaths: 0 };
    weekMap[key].cases += num(loc.cases);
    weekMap[key].deaths += num(loc.deaths);
  });
  const weeks = Object.values(weekMap).sort((a, b) => (a.key < b.key ? -1 : 1));
  const vals = weeks.map((w) => w.cases);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const sd = vals.length ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) : 0;
  const spikeCut = mean + spikeSdFactor * sd;
  const weeksOut = weeks.map((w, i) => ({
    ...w,
    spike: weeks.length >= 3 && w.cases > 0 && w.cases > spikeCut && w.cases > (weeks[i - 1]?.cases ?? 0),
  }));

  // Countries by cases.
  const cMap: Record<string, { country: string; cases: number; deaths: number; locations: Set<string> }> = {};
  rows.forEach((l) => {
    const c = l.country || "Unknown";
    cMap[c] = cMap[c] || { country: c, cases: 0, deaths: 0, locations: new Set() };
    cMap[c].cases += num(l.cases);
    cMap[c].deaths += num(l.deaths);
    cMap[c].locations.add(locKey(l));
  });
  const countries = Object.values(cMap)
    .map((c) => ({ country: c.country, cases: c.cases, deaths: c.deaths, locations: c.locations.size }))
    .sort((a, b) => b.cases - a.cases || b.deaths - a.deaths);

  // Spread route: same nearest-earlier linking as the map flow layer.
  const pts = dated
    .filter((d) => Number.isFinite(d.loc.latitude as number) && Number.isFinite(d.loc.longitude as number))
    .map((d) => ({ name: d.loc.location_name || d.loc.country, country: d.loc.country, date: d.date, lon: d.loc.longitude as number, lat: d.loc.latitude as number }));
  const links = pts.map((p, i) => {
    if (i === 0) return -1;
    let parent = 0;
    let best = Infinity;
    for (let j = 0; j < i; j++) {
      const dd = (pts[j].lon - p.lon) ** 2 + (pts[j].lat - p.lat) ** 2;
      if (dd < best) { best = dd; parent = j; }
    }
    return parent;
  });

  // Related articles (dedup by URL), newest first.
  const byUrl = new Map<string, RelatedArticle>();
  const articles: RelatedArticle[] = [];
  rows.forEach((l) => {
    const keys = rowMatchKeys(l);
    const addKeys = (a: RelatedArticle) => {
      keys.eventIds.forEach((k) => { if (!a.eventIds.includes(k)) a.eventIds.push(k); });
      keys.reportIds.forEach((k) => { if (!a.reportIds.includes(k)) a.reportIds.push(k); });
      keys.placeDates.forEach((k) => { if (!a.placeDates.includes(k)) a.placeDates.push(k); });
    };
    const srcs = [...(l.sources || []), ...(l.detail?.url ? [{ url: l.detail.url, source_name: l.detail.source_name, published_at: l.detail.published_at }] : [])];
    srcs.forEach((s) => {
      const url = (s?.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return;
      const known = byUrl.get(url);
      if (known) { addKeys(known); return; }
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
      const article: RelatedArticle = { url, title: s?.source_name || host, date: day(s?.published_at || l.published_date || ""), place: [l.location_name, l.country].filter(Boolean).join(", "), eventIds: [], reportIds: [], placeDates: [] };
      addKeys(article);
      byUrl.set(url, article);
      articles.push(article);
    });
  });
  articles.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    rows,
    firstDate,
    lastDate,
    affectedLocations,
    totalCases: rows.reduce((a, l) => a + num(l.cases), 0),
    totalDeaths: rows.reduce((a, l) => a + num(l.deaths), 0),
    weeks: weeksOut,
    countries,
    pts,
    links,
    articles,
  };
}

function MiniRoute({ pts, links }: { pts: { name: string; date: string; lon: number; lat: number }[]; links: number[] }) {
  if (pts.length === 0) return <p className="text-[11px] text-slate-400">No mapped coordinates.</p>;
  const W = 300, H = 150, pad = 14;
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  let minX = Math.min(...lons), maxX = Math.max(...lons), minY = Math.min(...lats), maxY = Math.max(...lats);
  if (maxX - minX < 1) { minX -= 0.5; maxX += 0.5; }
  if (maxY - minY < 1) { minY -= 0.5; maxY += 0.5; }
  const s = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
  const ox = (W - s * (maxX - minX)) / 2, oy = (H - s * (maxY - minY)) / 2;
  const x = (lon: number) => ox + (lon - minX) * s;
  const y = (lat: number) => H - (oy + (lat - minY) * s);
  const last = pts.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-slate-100 bg-sky-50/60" role="img" aria-label="Spread route">
      <defs>
        <marker id="ddp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#ea580c" />
        </marker>
      </defs>
      {links.map((pi, i) => pi < 0 ? null : (
        <line key={`l${i}`} x1={x(pts[pi].lon)} y1={y(pts[pi].lat)} x2={x(pts[i].lon)} y2={y(pts[i].lat)} stroke="#f97316" strokeWidth={1.5} strokeOpacity={0.8} markerEnd="url(#ddp-arrow)" />
      ))}
      {pts.map((p, i) => (
        <circle key={`p${i}`} cx={x(p.lon)} cy={y(p.lat)} r={i === 0 || i === last ? 5 : 3.5} fill={i === 0 ? "#16a34a" : "#ea580c"} stroke="#fff" strokeWidth={1.5}>
          <title>{`${p.name}${p.date ? ` · ${p.date}` : ""}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** PR 134: articles to list: the first maxArticles plus any highlighted one beyond the limit. */
export function visibleRelatedNews(articles: RelatedArticle[], highlighted: Set<number>, maxArticles: number) {
  return articles
    .map((a, i) => ({ a, i, hit: highlighted.has(i) }))
    .filter(({ i, hit }) => i < maxArticles || hit);
}

export default function DiseaseDetailPanel({ open = true, disease, locations, displayName, onClose, spikeSdFactor = 2, maxArticles = 15, highlightLocation = null, hideSpreadRoute = false }: Props) {
  const d = useMemo(() => buildDiseaseDetail(disease, locations, spikeSdFactor), [disease, locations, spikeSdFactor]);
  const highlighted = useMemo(
    () => new Set<number>(open && highlightLocation ? matchRelatedNews(d.articles, highlightLocation) : []),
    [d.articles, highlightLocation, open],
  );
  const newsItems = visibleRelatedNews(d.articles, highlighted, maxArticles);
  const firstHitRef = useRef<HTMLLIElement | null>(null);
  const firstHit = newsItems.find((n) => n.hit)?.i ?? -1;
  useEffect(() => {
    if (firstHit < 0) return;
    firstHitRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [firstHit, highlightLocation]);
  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.cases));
  const origin = d.pts[0];
  const latest = d.pts[d.pts.length - 1];
  const section = "border-t border-slate-100 pt-3 mt-3";
  const h = "mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400";

  return (
    <>
    {/* Small screens: overlay drawer with backdrop. md+: docked, map is offset by the parent. */}
    <button type="button" onClick={onClose} aria-label="Close disease detail" tabIndex={-1}
      className={`absolute inset-0 z-20 bg-black/10 transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
    <aside
      className={`absolute left-0 top-0 z-30 flex h-full w-[min(320px,85%)] flex-col border-r border-slate-200 bg-white/95 shadow-[8px_0_40px_rgba(0,0,0,.08)] backdrop-blur-md transition-transform duration-300 ease-out md:w-[320px] ${open ? "translate-x-0" : "pointer-events-none -translate-x-full"}`}
      aria-label="Disease detail"
      aria-hidden={!open}
      data-testid="disease-detail-panel"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#0060A9]" />
          <span className="text-sm font-bold text-slate-800">Disease Detail</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close disease detail"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* 1. Identity */}
        <div>
          <p className={h}>Disease</p>
          <h3 className="text-base font-black leading-tight text-slate-900">{displayName || disease}</h3>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl bg-emerald-50 p-2"><CalendarDays className="mb-0.5 h-3.5 w-3.5 text-emerald-600" /><p className="text-slate-500">First case</p><p className="font-black text-slate-900">{d.firstDate || "—"}</p></div>
          <div className="rounded-xl bg-sky-50 p-2"><MapPin className="mb-0.5 h-3.5 w-3.5 text-sky-600" /><p className="text-slate-500">Affected locations</p><p className="font-black text-slate-900">{fmt(d.affectedLocations)}</p></div>
          <div className="rounded-xl bg-orange-50 p-2"><Activity className="mb-0.5 h-3.5 w-3.5 text-orange-600" /><p className="text-slate-500">Cases</p><p className="font-black text-slate-900">{fmt(d.totalCases)}</p></div>
          <div className="rounded-xl bg-rose-50 p-2"><Skull className="mb-0.5 h-3.5 w-3.5 text-rose-600" /><p className="text-slate-500">Deaths</p><p className="font-black text-slate-900">{fmt(d.totalDeaths)}</p></div>
        </div>

        {/* 2. Timeline */}
        <div className={section}>
          <p className={h}>Timeline</p>
          <p className="text-[11px] font-bold text-slate-700">{d.firstDate ? `${d.firstDate} → ${d.lastDate}` : "No dated reports"}</p>
          {d.weeks.length > 0 && (
            <>
              <div className="mt-2 flex h-16 items-end gap-[2px]" aria-label="Weekly cases (epi week)">
                {d.weeks.map((w) => (
                  <div key={w.key} title={`${w.label}: ${fmt(w.cases)} cases, ${fmt(w.deaths)} deaths${w.spike ? " · spike" : ""}`}
                    className={`min-w-[3px] flex-1 rounded-t ${w.spike ? "bg-rose-500" : "bg-sky-400"}`}
                    style={{ height: `${Math.max(4, (w.cases / maxWeek) * 100)}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-slate-400"><span>{d.weeks[0].label}</span><span>{d.weeks[d.weeks.length - 1].label}</span></div>
              {d.weeks.some((w) => w.spike) && (
                <p className="mt-1 text-[10px] text-rose-600">
                  Spike: {d.weeks.filter((w) => w.spike).map((w) => `${w.label} (${fmt(w.cases)})`).join(", ")}
                </p>
              )}
            </>
          )}
        </div>

        {/* 3. Mini spread map */}
        {!hideSpreadRoute && (
          <div className={section}>
            <p className={h}>Spread route</p>
            <MiniRoute pts={d.pts} links={d.links} />
            {origin && (
              <p className="mt-1 text-[10px] text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-[#16a34a] align-middle" aria-hidden /> <span className="font-bold text-emerald-700">Index case:</span> {origin.name}{origin.date ? ` (${origin.date})` : ""}
                {latest && d.pts.length > 1 && (<> → <span className="inline-block h-2 w-2 rounded-full bg-[#ea580c] align-middle" aria-hidden /> <span className="font-bold text-orange-700">Latest case location:</span> {latest.name}{latest.date ? ` (${latest.date})` : ""}</>)}
              </p>
            )}
          </div>
        )}

        {/* 4. Countries */}
        <div className={section}>
          <p className={h}>Affected countries</p>
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-[9px] uppercase text-slate-400"><th className="py-0.5">Country</th><th className="text-right">Cases</th><th className="text-right">Deaths</th><th className="text-right">Loc.</th></tr></thead>
            <tbody>
              {d.countries.map((c) => (
                <tr key={c.country} className="border-t border-slate-50">
                  <td className="py-1 font-bold text-slate-800"><Globe className="mr-1 inline h-3 w-3 text-slate-400" />{c.country}</td>
                  <td className="text-right font-black text-orange-700">{fmt(c.cases)}</td>
                  <td className="text-right font-bold text-rose-700">{fmt(c.deaths)}</td>
                  <td className="text-right text-slate-500">{c.locations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5. News */}
        <div className={section}>
          <p className={h}>Related news ({d.articles.length})</p>
          {highlighted.size > 0 && (
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-700" data-testid="related-news-highlight-note">
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden />
              {highlighted.size === 1 ? "1 article" : `${highlighted.size} articles`} for the selected point
              {highlightLocation?.location_name ? ` (${highlightLocation.location_name})` : ""}
            </p>
          )}
          {d.articles.length === 0 ? <p className="text-[11px] text-slate-400">No source articles.</p> : (
            <ul className="space-y-1.5">
              {newsItems.map(({ a, i, hit }) => (
                <li key={a.url} ref={i === firstHit ? firstHitRef : undefined} data-highlighted={hit ? "true" : undefined}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    className={`group flex items-start gap-1.5 rounded-lg p-1.5 ${hit ? "border border-amber-300 bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100" : "border border-transparent hover:bg-sky-50"}`}
                    title={hit ? "Selected map point" : undefined}>
                    {hit
                      ? <Star className="mt-0.5 h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Selected map point" />
                      : <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />}
                    <span className="min-w-0">
                      <span className={`block truncate text-[11px] font-bold group-hover:underline ${hit ? "text-amber-900" : "text-sky-800"}`}>{a.title}</span>
                      <span className="block truncate text-[10px] text-slate-400">{[a.date, a.place].filter(Boolean).join(" · ")}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}

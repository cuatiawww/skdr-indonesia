"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
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
import { fetchIbsDashboard, type IbsDashboard, type IbsObservation } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type DayWindow = 7 | 30 | 90;
type ViewTab = "findings" | "runs";

const DISEASE_COLORS: Record<string, string> = {
  Dengue: "#f97316", // Amber/Orange
  "COVID-19": "#ef4444", // Red
  Measles: "#10b981", // Emerald
  Mpox: "#8b5cf6", // Purple
  Influenza: "#0284c7", // Sky blue
  "Avian Influenza (H5N1)": "#f43f5e", // Rose
  Legionellosis: "#06b6d4", // Cyan
  Malaria: "#eab308", // Yellow
  "Meningococcal Disease": "#6366f1", // Indigo
};

const INDICATOR_COLORS = [
  "#0060A9",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
];

function formatNumber(value: number | string | undefined | null) {
  return Number(value || 0).toLocaleString("en-US");
}

function getDiseaseColor(name: string) {
  for (const [key, color] of Object.entries(DISEASE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#0060A9";
}

function indicatorLabel(indicator: string) {
  switch (indicator) {
    case "cases":
      return "New Cases";
    case "cumulative_cases":
      return "Cumulative Cases";
    case "cumulative_deaths":
      return "Cumulative Deaths";
    case "deaths":
      return "Deaths";
    case "influenza_positive":
      return "Positive Samples";
    case "specimens_processed":
      return "Specimens Tested";
    default:
      return indicator.replace(/_/g, " ");
  }
}

export default function IbsSourcePerformance() {
  const { t } = useTranslation();
  const [days, setDays] = useState<DayWindow>(30);
  const [activeTab, setActiveTab] = useState<ViewTab>("findings");
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState<IbsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      try {
        setLoading(true);
        const next = await fetchIbsDashboard({ days });
        if (cancelled) return;
        setData(next);
        setError(null);
        if ((next.runs?.running || 0) > 0) {
          timer = window.setTimeout(load, 20_000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "IBS dashboard failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [days]);

  // Surveillance KPIs
  const kpi = data?.surveillance_kpi || {
    diseases_detected: data?.disease_summary?.length || 0,
    countries_monitored: data?.country_summary?.length || 0,
    sources_count: data?.catalog?.enabled || 0,
    total_observations: data?.recent_observations?.length || 0,
    total_cases: (data?.disease_summary || []).reduce((acc, d) => acc + (d.total_cases || 0), 0),
    total_deaths: (data?.disease_summary || []).reduce((acc, d) => acc + (d.total_deaths || 0), 0),
  };

  // Diseases for chart
  const diseaseChartData = useMemo(() => {
    const list = data?.disease_summary || [];
    return list.slice(0, 8).map((d) => ({
      name: d.disease,
      cases: d.total_cases,
      deaths: d.total_deaths,
      records: d.observations_count,
      countries: d.countries_count,
    }));
  }, [data?.disease_summary]);

  // Countries for chart
  const countryChartData = useMemo(() => {
    const list = data?.country_summary || [];
    return list.slice(0, 11).map((c) => ({
      name: c.country,
      cases: c.total_cases,
      deaths: c.total_deaths,
      diseases: c.diseases_count,
      records: c.observations_count,
    }));
  }, [data?.country_summary]);

  // Indicator distribution
  const indicatorData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const obs of data?.recent_observations || []) {
      const key = indicatorLabel(obs.indicator);
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data?.recent_observations]);

  // Filtered observations
  const filteredObservations = useMemo(() => {
    const all = data?.recent_observations || [];
    return all.filter((obs) => {
      if (selectedDisease && (obs.disease || obs.disease_name || '').toLowerCase() !== selectedDisease.toLowerCase()) {
        return false;
      }
      if (selectedCountry && obs.country.toLowerCase() !== selectedCountry.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (obs.disease || obs.disease_name || '').toLowerCase().includes(q) ||
          obs.country.toLowerCase().includes(q) ||
          obs.location.toLowerCase().includes(q) ||
          obs.source_name.toLowerCase().includes(q) ||
          obs.indicator.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data?.recent_observations, selectedDisease, selectedCountry, searchQuery]);

  const allDiseases = useMemo(() => {
    const set = new Set<string>();
    for (const d of data?.disease_summary || []) set.add(d.disease);
    for (const o of data?.recent_observations || []) set.add((o.disease || o.disease_name || ''));
    return Array.from(set);
  }, [data?.disease_summary, data?.recent_observations]);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    for (const c of data?.country_summary || []) set.add(c.country);
    for (const o of data?.recent_observations || []) {
      if (o.country) set.add(o.country);
    }
    return Array.from(set);
  }, [data?.country_summary, data?.recent_observations]);

  const resetFilters = () => {
    setSelectedDisease(null);
    setSelectedCountry(null);
    setSearchQuery("");
  };

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200">
      {/* Header bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
            {t("crawling.ibsTitle")}
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            {t("crawling.ibsDescription")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("findings")}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                activeTab === "findings"
                  ? "bg-[#0060A9] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Surveillance Findings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("runs")}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                activeTab === "runs"
                  ? "bg-[#0060A9] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Crawler Activity
            </button>
          </div>

          {/* Time window selector */}
          {([7, 30, 90] as DayWindow[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                days === value
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {value}d
            </button>
          ))}

          <Link
            href="/indicator-sources"
            className="rounded-lg border border-[#0060A9]/30 bg-blue-50/50 px-2.5 py-1 text-xs font-bold text-[#0060A9] hover:bg-blue-100 transition-colors"
          >
            {t("crawling.ibsOpenSources")} &rarr;
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline font-semibold ml-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* KPI Cards: Focused on Disease Surveillance Findings */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label={t("crawling.ibsDiseasesDetected")}
          value={formatNumber(kpi.diseases_detected)}
          detail={`${allDiseases.slice(0, 3).join(", ")}${allDiseases.length > 3 ? "..." : ""}`}
          accent="text-blue-600"
          bg="border-blue-100 bg-blue-50/20"
        />
        <KpiCard
          label={t("crawling.ibsTotalCases")}
          value={formatNumber(kpi.total_cases)}
          detail="Official cases captured"
          accent="text-emerald-700"
          bg="border-emerald-100 bg-emerald-50/20"
        />
        <KpiCard
          label={t("crawling.ibsTotalDeaths")}
          value={formatNumber(kpi.total_deaths)}
          detail="Reported fatalities"
          accent="text-rose-700"
          bg="border-rose-100 bg-rose-50/20"
        />
        <KpiCard
          label={t("crawling.ibsAseanCoverage")}
          value={`${kpi.countries_monitored || 11} Countries`}
          detail="Cross-border ASEAN scope"
          accent="text-indigo-600"
          bg="border-indigo-100 bg-indigo-50/20"
        />
        <KpiCard
          label={t("crawling.ibsTotalObservations")}
          value={formatNumber(kpi.total_observations || data?.facts_written)}
          detail={`${formatNumber(data?.catalog?.enabled || 13)} active official sources`}
          accent="text-amber-700"
          bg="border-amber-100 bg-amber-50/20"
        />
      </div>

      {activeTab === "findings" ? (
        <>
          {/* Main Visualizations Grid */}
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            {/* Chart 1: Diseases Extracted (8 cols) */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
                    {t("crawling.ibsChartDiseases")}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click a bar to filter findings by disease
                  </p>
                </div>
                {selectedDisease ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    Filtered: {selectedDisease}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={diseaseChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={120}
                      tick={{ fontSize: 10, fontWeight: 600 }}
                    />
                    <Tooltip
                      formatter={(val: any, name: string) => [
                        formatNumber(val),
                        name === "cases" ? "Cases" : name === "deaths" ? "Deaths" : "Records",
                      ]}
                    />
                    <Bar
                      dataKey="cases"
                      name="Cases"
                      radius={[0, 4, 4, 0]}
                      onClick={(entry: any) => {
                        if (entry?.name) {
                          setSelectedDisease(selectedDisease === entry.name ? null : entry.name);
                        }
                      }}
                      cursor="pointer"
                    >
                      {diseaseChartData.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={getDiseaseColor(entry.name)}
                          opacity={selectedDisease && selectedDisease !== entry.name ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Regional Country Breakdown (5 cols) */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
                    {t("crawling.ibsChartCountries")}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Surveillance records by member state
                  </p>
                </div>
                {selectedCountry ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {selectedCountry}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={countryChartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      angle={-35}
                      textAnchor="end"
                      height={45}
                      interval={0}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val: any, name: string) => [
                        formatNumber(val),
                        name === "cases" ? "Cases" : name === "deaths" ? "Deaths" : "Diseases",
                      ]}
                    />
                    <Bar
                      dataKey="cases"
                      name="Cases"
                      fill="#0060A9"
                      radius={[4, 4, 0, 0]}
                      onClick={(entry: any) => {
                        if (entry?.name) {
                          setSelectedCountry(selectedCountry === entry.name ? null : entry.name);
                        }
                      }}
                      cursor="pointer"
                    >
                      {countryChartData.map((entry) => (
                        <Cell
                          key={`c-cell-${entry.name}`}
                          fill="#0060A9"
                          opacity={selectedCountry && selectedCountry !== entry.name ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Interactive Surveillance Findings Table */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
                  {t("crawling.ibsTableTitle")}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t("crawling.ibsTableDesc")} ({filteredObservations.length} results)
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder={t("crawling.ibsSearchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0060A9] focus:outline-none w-48 sm:w-56"
                />

                <select
                  value={selectedDisease || ""}
                  onChange={(e) => setSelectedDisease(e.target.value || null)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-[#0060A9] focus:outline-none"
                >
                  <option value="">{t("crawling.ibsAllDiseases")}</option>
                  {allDiseases.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedCountry || ""}
                  onChange={(e) => setSelectedCountry(e.target.value || null)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-[#0060A9] focus:outline-none"
                >
                  <option value="">{t("crawling.ibsAllCountries")}</option>
                  {allCountries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {selectedDisease || selectedCountry || searchQuery ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    {t("crawling.ibsResetFilter")}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Table */}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100 max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5">Disease</th>
                    <th className="px-3 py-2.5">Country & Location</th>
                    <th className="px-3 py-2.5">Indicator</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                    <th className="px-3 py-2.5">Period / Week</th>
                    <th className="px-3 py-2.5">Official Source</th>
                    <th className="px-3 py-2.5 text-center">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                  {filteredObservations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        No surveillance findings match the active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredObservations.map((obs) => {
                      const color = getDiseaseColor((obs.disease || obs.disease_name || ''));
                      return (
                        <tr key={obs.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                              style={{ backgroundColor: color }}
                            />
                            {(obs.disease || obs.disease_name || '')}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-semibold text-slate-800">{obs.country}</span>
                            {obs.location && obs.location !== obs.country ? (
                              <span className="text-slate-500 text-[11px] ml-1">
                                &middot; {obs.location}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {indicatorLabel(obs.indicator)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {formatNumber(obs.value)}
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {obs.period_label ? (
                              <span className="font-semibold text-blue-700 mr-1">
                                {obs.period_label}
                              </span>
                            ) : null}
                            {obs.period_start && obs.period_end ? (
                              <span className="text-[11px] text-slate-500">
                                {obs.period_start} &rarr; {obs.period_end}
                              </span>
                            ) : (
                              obs.period_type || "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={obs.source_name}>
                            {obs.source_name}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {obs.document_url ? (
                              <a
                                href={obs.document_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0060A9] hover:bg-blue-100 hover:underline transition-colors"
                              >
                                View Doc <span aria-hidden="true">{'\u2197'}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Runs / Crawler Activity Tab */
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
              {t("crawling.ibsRecent")}
            </h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Disease Scope</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Pages Found</th>
                    <th className="px-3 py-2 text-right">Facts Written</th>
                    <th className="px-3 py-2">Crawl Job</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.recent_runs || []).map((row) => (
                    <tr key={row.run_id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {row.started_at?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.source_name}</td>
                      <td className="px-3 py-2 text-slate-600">{row.disease_scope || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            row.status === "success"
                              ? "bg-emerald-50 text-emerald-700"
                              : row.status === "running"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {row.status}
                        </span>
                        {row.error ? (
                          <span className="text-[11px] text-rose-600 ml-1.5 block max-w-xs truncate">
                            {row.error}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.pages_found)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">
                        {formatNumber(row.facts_written)}
                      </td>
                      <td className="px-3 py-2">
                        {row.crawl_job_id ? (
                          <Link
                            href={`/crawl-history?job_id=${encodeURIComponent(row.crawl_job_id)}`}
                            className="font-bold text-[#0060A9] hover:underline"
                          >
                            Open &rarr;
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  detail,
  accent,
  bg,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl border p-3.5 transition-all shadow-sm ${bg}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-black ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500 truncate">{detail}</p>
    </div>
  );
}

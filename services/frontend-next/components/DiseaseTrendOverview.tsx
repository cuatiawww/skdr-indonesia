'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Flame,
  Globe,
  Info,
  Layers,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import CountryFlag from './CountryFlag';
import {
  fetchDiseaseTrendOverview,
  DiseaseTrendOverviewData,
  PriorityDiseaseAlert,
} from '@/lib/api';
import { EpiFilterState } from './EpiFilterBar';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { focusTopics, largestCluster, scopeTotalLabel } from '@/lib/trend-highlights.mjs';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

const SERIES_COLORS = ['#0284c7', '#f59e0b', '#10b981', '#f43f5e', '#a855f7'];

interface DiseaseTrendOverviewProps {
  filters: EpiFilterState;
  dateDetail?: string;
}

export default function DiseaseTrendOverview({ filters, dateDetail }: DiseaseTrendOverviewProps) {
  const { translateDisease } = useTranslation();
  const [data, setData] = useState<DiseaseTrendOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState<boolean>(false);
  const [expandedDisease, setExpandedDisease] = useState<string | null>(null);
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({});
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  const loadData = async (activeFilters: EpiFilterState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDiseaseTrendOverview({
        country: activeFilters.country,
        disease: activeFilters.disease,
        start_year: activeFilters.startYear,
        start_week: activeFilters.startWeek,
        end_year: activeFilters.endYear,
        end_week: activeFilters.endWeek,
      });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load disease trend overview:', err);
      setError(err?.message || 'Failed to load surveillance trend summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(filters);
  }, [filters]);

  const series = data?.trend_series ?? [];
  useEffect(() => {
    setVisibleLines(Object.fromEntries(series.map((item) => [item.key, true])));
  }, [series.map((item) => item.key).join('|')]);

  const formatCompact = (num: number): string => {
    const value = Number(num);
    if (!Number.isFinite(value)) return '0';
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 0 : 1) + 'K';
    return value.toLocaleString('en-US');
  };

  const toggleLine = (dataKey: string) => {
    setVisibleLines((prev) => ({
      ...prev,
      [dataKey]: prev[dataKey] === false,
    }));
  };

  const displayedAlerts = useMemo(() => {
    if (!data?.priority_alerts) return [];
    let list = data.priority_alerts;
    if (filters.diseases && filters.diseases.length > 0) {
      const dList = filters.diseases.filter((d) => d && d !== 'all').map((d) => d.toLowerCase());
      if (dList.length > 0) {
        list = list.filter((item) => dList.some((d) => item.disease.toLowerCase().includes(d) || d.includes(item.disease.toLowerCase())));
      }
    }
    return showAllAlerts
      ? list
      : list.slice(0, 5);
  }, [data, showAllAlerts, filters.diseases]);

  const cluster = largestCluster(data?.priority_alerts);
  const focus = focusTopics(data?.priority_alerts);
  const focusCountry = [...focus].sort((a, b) => (b.top_country_cases || 0) - (a.top_country_cases || 0))[0]?.top_country
    || data?.summary.top_burden_country
    || '—';
  const focusTitle = focus.length
    ? focus.map((item) => translateDisease(item.disease)).join(' & ')
    : translateDisease(data?.summary.top_burden_disease) || '—';

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 lg:p-7 shadow-sm">
      {/* ?? Header Bar ?? */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-black tracking-tight text-slate-900 lg:text-2xl">
            Health Topic Signals & Trends by Country
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:text-sm">
            Shows health topics with the highest case burden, countries with the greatest signal concentration based on NLP extraction, and the latest daily case trends across ASEAN.
          </p>
          {dateDetail && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9]">
              <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
              <span>Periode: {dateDetail}</span>
            </div>
          )}
        </div>

      </div>

      {/* â”€â”€ Quick KPI Stat Highlights â”€â”€ */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Health Topics Monitored
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-sky-900">
            {data?.summary.total_diseases ?? '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
            Standard Classifications
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">
            Highest Case Burden
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-rose-700 truncate">
            {translateDisease(data?.summary.top_burden_disease) || '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
            {data?.summary.top_burden_country || '—'}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
            Cluster Concentration
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-amber-700">
            {cluster ? formatCompact(cluster.cases) : '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400 truncate">
            {cluster ? `${translateDisease(cluster.disease)} (${cluster.country})` : '—'}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
            Regional Focus
          </div>
          <div className="mt-1 text-xl sm:text-2xl font-black tracking-tight text-slate-900 truncate">
            {focusTitle}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400 truncate">
            {focusCountry === '—' ? '—' : `${focusCountry} high volume`}
          </div>
        </div>
      </div>

      {/* ?? Main 2-Column Section: Sinyal Prioritas (Left) & Tren Kasus Harian (Right) ?? */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Sinyal Prioritas List & Country Breakdown */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
                <h3 className="text-sm font-black text-slate-900">
                  Priority Signals
                </h3>
                <p className="text-[11px] text-slate-500">
                  Health topics with the highest country case counts (NLP Extraction)
                </p>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {data?.priority_alerts.length ?? 0} topics
            </span>
          </div>

          {/* Alert List Rows */}
          <div className="mt-3 flex flex-col divide-y divide-slate-100">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
                <span className="mt-2 text-xs font-semibold text-slate-500">
                  Loading surveillance data...
                </span>
              </div>
            )}

            {error && (
              <div className="my-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            {!loading && displayedAlerts.map((item) => {
              const isExpanded = expandedDisease === item.disease;
              const topCountries = (item.country_breakdown && item.country_breakdown.length > 0)
                ? item.country_breakdown.slice().sort((a, b) => b.cases - a.cases).slice(0, 3)
                : item.top_country
                ? [{ country: item.top_country, cases: item.top_country_cases, iso: item.top_country_iso, deaths: 0, events: 0, alerts: 0 }]
                : [];

              return (
                <div key={item.disease} className="py-2.5 transition-colors">
                  <div
                    onClick={() => setExpandedDisease(isExpanded ? null : item.disease)}
                    className="flex cursor-pointer flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl p-2 hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Disease Icon, Name & ASEAN Total */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-black text-xs">
                        {item.disease.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {translateDisease(item.disease)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{scopeTotalLabel(filters.country)}:</span>
                          <span className="font-bold text-slate-700">
                            {formatCompact(item.total_asean_cases)} cases
                          </span>
                          {item.latest_published_label && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400">{item.latest_published_label}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Top 3 Countries in 1 row & Chevron */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {topCountries.map((cb, idx) => (
                          <div
                            key={cb.country}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition shadow-2xs ${
                              idx === 0
                                ? "border-rose-200/90 bg-rose-50/70 text-slate-900"
                                : idx === 1
                                ? "border-amber-200/90 bg-amber-50/60 text-slate-800"
                                : "border-slate-200 bg-slate-50/70 text-slate-700"
                            }`}
                            title={`${cb.country}: ${formatCompact(cb.cases)} cases`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                                idx === 0
                                  ? "bg-rose-500 text-white"
                                  : idx === 1
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-400 text-white"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <CountryFlag
                              countryName={cb.country}
                              shape="rounded"
                              size="xs"
                              className="shadow-2xs shrink-0"
                            />
                            <span className="font-bold text-[11px] text-slate-900 max-w-[70px] sm:max-w-[85px] truncate">
                              {cb.country}
                            </span>
                            <span className="font-mono text-[10.5px] font-bold text-slate-600 shrink-0">
                              {formatCompact(cb.cases)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Chevron Toggle */}
                      <div className="text-slate-400 pl-1 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Breakdown for this Disease */}
                  {isExpanded && (
                    <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs animate-in fade-in duration-150">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase">
                        <span>Cross-Country Case Distribution ({translateDisease(item.disease)})</span>
                        <span>{item.country_breakdown.length} Affected Countries</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {item.country_breakdown.map((cb) => {
                          const pct =
                            item.total_asean_cases > 0
                              ? Math.round((cb.cases / item.total_asean_cases) * 100)
                              : 0;

                          return (
                            <div key={cb.country} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-2">
                                  <CountryFlag
                                    countryName={cb.country}
                                    shape="rounded"
                                    size="xs"
                                  />
                                  <span className="font-semibold text-slate-800">
                                    {cb.country}
                                  </span>
                                  {cb.country === item.top_country && (
                                    <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                                      Highest
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="font-bold text-slate-900">
                                    {formatCompact(cb.cases)} cases
                                  </span>
                                  <span className="text-slate-600">({pct}%)</span>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    cb.country === item.top_country
                                      ? 'bg-rose-500'
                                      : 'bg-sky-500'
                                  }`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toggle All Alerts Button */}
          {data && data.priority_alerts.length > 5 && (
            <button
              onClick={() => setShowAllAlerts(!showAllAlerts)}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-blue-700 hover:bg-slate-50 transition-colors"
            >
              {showAllAlerts ? 'Show Less' : 'View All Signals (' + data.priority_alerts.length + ' Topics)'}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAllAlerts ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          )}
        </div>

        {/* RIGHT COLUMN: Multi-Day Trend Chart */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Detected Case Trend ({data?.summary.trend_days ?? 0} Days)
              </h3>
              <p className="text-[11px] text-slate-500">
                Daily detected-case fluctuation for priority health topics
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setChartType('line')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  chartType === 'line'
                    ? 'bg-white text-sky-700 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Line Chart View"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Line
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  chartType === 'bar'
                    ? 'bg-white text-sky-700 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Bar Chart View"
              >
                <BarChart2 className="h-3.5 w-3.5" />
                Bar
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {series.map((item, index) => {
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              const on = visibleLines[item.key] !== false;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleLine(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-all ${
                    on ? 'font-bold' : 'border-slate-200 bg-slate-100 text-slate-400 line-through'
                  }`}
                  style={on ? { backgroundColor: `${color}22`, borderColor: color, color } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {translateDisease(item.disease)}
                </button>
              );
            })}
          </div>

          {/* Chart Container (Line or Bar) */}
          <div className="mt-4 h-72 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
              </div>
            ) : series.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No topics in this filter.
              </div>
            ) : chartType === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.daily_trends || []}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date_label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      Number(val).toLocaleString('en-US') + ' cases',
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  {series.map((item, index) => {
                    if (visibleLines[item.key] === false) return null;
                    const color = SERIES_COLORS[index % SERIES_COLORS.length];
                    return (
                      <Bar
                        key={item.key}
                        dataKey={item.key}
                        name={translateDisease(item.disease)}
                        fill={color}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={30}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data?.daily_trends || []}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date_label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      Number(val).toLocaleString('en-US') + ' cases',
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  {series.map((item, index) => {
                    if (visibleLines[item.key] === false) return null;
                    const color = SERIES_COLORS[index % SERIES_COLORS.length];
                    return (
                      <Line
                        key={item.key}
                        type="monotone"
                        dataKey={item.key}
                        name={translateDisease(item.disease)}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: color }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart Context Footer */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
            <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
            <div>
              The chart shows daily cases for the most active topics. Click a legend pill above to isolate a trend.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

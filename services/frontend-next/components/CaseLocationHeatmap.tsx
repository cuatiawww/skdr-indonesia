'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronRight,
  Globe,
  HelpCircle,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  Skull,
  TrendingUp,
  X,
} from 'lucide-react';
import CountryFlag from './CountryFlag';
import { sameCountry } from '@/lib/map-boundary-scope.mjs';
import {
  fetchSpatialHeatmap,
  SpatialHeatmapResponse,
  HeatmapCountryData,
  HeatmapMonthData,
} from '@/lib/api';
import { EpiFilterState } from './EpiFilterBar';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts';
import { heatmapSummary } from '@/lib/heatmap-summary.mjs';

export type HeatmapMetric = 'cases' | 'deaths' | 'cfr';

interface CaseLocationHeatmapProps {
  filters: EpiFilterState;
  dateDetail?: string;
  /** PR 161: mapped places under the same filter (the map header count). */
  regionsCount?: number;
}

// CFR is a percentage: keep inconsistent source values within 0–100%.
const normalizeCfr = (cases: number, deaths: number): number => {
  const caseCount = Number(cases);
  const deathCount = Number(deaths);
  if (!Number.isFinite(caseCount) || !Number.isFinite(deathCount) || caseCount <= 0) return 0;
  return Math.min(100, Math.max(0, (deathCount / caseCount) * 100));
};

export default function CaseLocationHeatmap({ filters, dateDetail, regionsCount }: CaseLocationHeatmapProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<SpatialHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<HeatmapMetric>('cases');
  const [selectedCountry, setSelectedCountry] = useState<HeatmapCountryData | null>(null);
  const [showScaleInfo, setShowScaleInfo] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{
    country: HeatmapCountryData;
    month: HeatmapMonthData;
  } | null>(null);

  const loadData = async (activeFilters: EpiFilterState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSpatialHeatmap({
        country: activeFilters.countries?.length === 1 ? activeFilters.countries[0] : activeFilters.country,
        disease: activeFilters.diseases?.length === 1 ? activeFilters.diseases[0] : activeFilters.disease,
        year: activeFilters.endYear,
        start_year: activeFilters.startYear,
        start_week: activeFilters.startWeek,
        end_year: activeFilters.endYear,
        end_week: activeFilters.endWeek,
      });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load spatial heatmap:', err);
      setError(err?.message || 'Failed to load spatial heatmap data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData(filters);
  }, [filters]);

  const selectedYear = data?.year ?? filters.endYear;

  const displayCountries = useMemo(() => {
    if (!data?.countries) return [];
    if (filters.countries && filters.countries.length > 0) {
      const wanted = filters.countries.filter((c) => c && c !== 'all' && c !== 'ASEAN' && c !== 'global');
      if (wanted.length > 0) {
        return data.countries.filter((c) => wanted.some((w) => sameCountry(w, c.country)));
      }
    }
    return data.countries;
  }, [data?.countries, filters.countries]);

  const summary = useMemo(
    () => heatmapSummary(displayCountries, filters.diseases?.length ? filters.diseases : filters.disease && filters.disease !== 'all' ? [filters.disease] : []),
    [displayCountries, filters.diseases, filters.disease],
  );

  // Calculate maximum values for relative coloring
  const metricStats = useMemo(() => {
    if (!displayCountries || !displayCountries.length) {
      return { maxCases: 1, maxDeaths: 1, maxCfr: 10, peakMonthName: 'September', peakMonthVal: 0 };
    }

    let maxCases = 1;
    let maxDeaths = 1;
    let maxCfr = 1;
    let peakMonthName = 'September';
    let peakMonthVal = 0;
    const monthTotals: Record<string, number> = {};

    displayCountries.forEach((c) => {
      c.months.forEach((m) => {
        if (m.cases > maxCases) maxCases = m.cases;
        if (m.deaths > maxDeaths) maxDeaths = m.deaths;
        const cfr = normalizeCfr(m.cases, m.deaths);
        if (cfr > maxCfr && cfr <= 100) maxCfr = cfr;

        monthTotals[m.month_name] = (monthTotals[m.month_name] || 0) + m.cases;
      });
    });

    Object.entries(monthTotals).forEach(([mName, val]) => {
      if (val > peakMonthVal) {
        peakMonthVal = val;
        peakMonthName = mName;
      }
    });

    return { maxCases, maxDeaths, maxCfr, peakMonthName, peakMonthVal };
  }, [displayCountries]);

  // Compact number formatting
  const formatCompact = (num: number): string => {
    const value = Number(num);
    if (!Number.isFinite(value)) return '0';
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 0 : 1) + 'K';
    return value.toLocaleString('en-US');
  };

  // Get cell display value and relative intensity 0..1
  const getCellDetails = (m: HeatmapMonthData) => {
    let rawVal = 0;
    let displayVal = '';
    let ratio = 0;

    if (activeMetric === 'cases') {
      rawVal = m.cases;
      displayVal = m.cases > 0 ? formatCompact(m.cases) : '?';
      ratio = metricStats.maxCases > 0 ? m.cases / metricStats.maxCases : 0;
    } else if (activeMetric === 'deaths') {
      rawVal = m.deaths;
      displayVal = m.deaths > 0 ? formatCompact(m.deaths) : '?';
      ratio = metricStats.maxDeaths > 0 ? m.deaths / metricStats.maxDeaths : 0;
    } else if (activeMetric === 'cfr') {
      const cfr = normalizeCfr(m.cases, m.deaths);
      rawVal = cfr;
      displayVal = cfr > 0 ? `${cfr.toFixed(1)}%` : '?';
      ratio = metricStats.maxCfr > 0 ? Math.min(cfr / 15, 1) : 0;
    }

    return { rawVal, displayVal, ratio };
  };

  // Color mapping based on ratio and metric
  const getCellColorClass = (m: HeatmapMonthData) => {
    const { rawVal, ratio } = getCellDetails(m);
    if (rawVal === 0) {
      return 'bg-slate-100/70 border-slate-200/40 text-slate-400 hover:bg-slate-200/70';
    }

    if (ratio < 0.05) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100 font-medium';
    }
    if (ratio < 0.20) {
      return 'bg-amber-100/80 text-amber-800 border-amber-300 hover:bg-amber-200 font-semibold';
    }
    if (ratio < 0.55) {
      return 'bg-orange-200/90 text-orange-950 border-orange-400 hover:bg-orange-300 font-bold';
    }
    return 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-600 shadow-sm shadow-rose-500/30 hover:brightness-110 font-black';
  };

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 lg:p-7 shadow-sm">
      {/* ?? Top Header Bar ?? */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 lg:text-2xl">
            Surveillance Location Summary
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:text-sm">
            Provides a concise overview of mapped locations, geographic distribution, affected areas, and emerging spatial patterns across monitored ASEAN countries based on source publication timestamps.
          </p>
          {dateDetail && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9]">
              <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
              <span>Periode: {dateDetail}</span>
            </div>
          )}
        </div>

        {/* ?? Controls: Metric Tabs & Year Selector ?? */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          {/* Metric Selector Pills */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-semibold">
            <button
              onClick={() => setActiveMetric('cases')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'cases'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Cases
            </button>
            <button
              onClick={() => setActiveMetric('deaths')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'deaths'
                  ? 'bg-white text-rose-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Skull className="h-3.5 w-3.5" />
              Deaths
            </button>
            <button
              onClick={() => setActiveMetric('cfr')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'cfr'
                  ? 'bg-white text-amber-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              CFR (%)
            </button>
          </div>

        </div>
      </div>

      {/* â”€â”€ Summary Cards â”€â”€ */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        {/* Card 1: 11 Countries Coverage */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">ASEAN Coverage</div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{data ? summary.reporting : '...'}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">of {summary.countries} Member States reporting</div>
        </div>
        {/* Card 2: 54 Monitored Locations */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Sub-national Points</div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-emerald-700">{regionsCount ?? '–'} Regions</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Active Spatial Centroids</div>
        </div>
        {/* Card 3: Peak Month Detection */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">Peak Surveillance Period</div>
          <div className="mt-1 text-xl sm:text-2xl font-black tracking-tight text-amber-900">{metricStats.peakMonthName} {selectedYear}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Peak {formatCompact(metricStats.peakMonthVal)} Cases</div>
        </div>
        {/* Card 4: Total ASEAN Cases in Year */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">Total Annual Burden</div>
          <div className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-rose-700">{data ? formatCompact(summary.cases) : '...'}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-400">Total Cases ({data ? formatCompact(summary.deaths) : '0'} Deaths)</div>
        </div>
      </div>

      {/* ?? Heatmap Grid ?? */}
      <div className="relative mt-6">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/70 backdrop-blur-xs">
            <RefreshCw className="h-7 w-7 animate-spin text-sky-600" />
            <span className="mt-2 text-xs font-bold text-slate-600">
              Calculating the spatiotemporal matrix...
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-xs">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <th className="sticky left-0 z-10 w-56 bg-slate-50/95 px-4 py-3 shadow-xs">
                  ASEAN Member Countries
                </th>
                {monthNames.map((m) => (
                  <th
                    key={m}
                    className={`px-2.5 py-3 text-center transition-colors ${
                      m === metricStats.peakMonthName ? 'bg-amber-50/80 text-amber-900 font-black' : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className="w-28 px-4 py-3 text-right">
                  Total {selectedYear}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {displayCountries.map((c) => {
                const totalMetricVal =
                  activeMetric === 'cases'
                    ? c.total_cases
                    : activeMetric === 'deaths'
                    ? c.total_deaths
                    : activeMetric === 'cfr'
                    ? c.total_cases > 0
                      ? normalizeCfr(c.total_cases, c.total_deaths).toFixed(1) + '%'
                      : '0.0%'
                    : c.total_events;

                return (
                  <tr
                    key={c.country}
                    className="group transition-colors hover:bg-slate-50/70"
                  >
                    {/* Country Sticky Column */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 shadow-xs group-hover:bg-slate-50/90">
                      <button
                        onClick={() => setSelectedCountry(c)}
                        className="flex w-full items-center justify-between text-left focus:outline-none"
                      >
                        <div className="flex items-center gap-2.5">
                          <CountryFlag
                            countryName={c.country}
                            shape="rounded"
                            size="sm"
                            className="shadow-xs ring-1 ring-slate-200/80"
                          />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-700">
                              {c.country}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-600">
                              ISO: {c.iso}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </button>
                    </td>

                    {/* 12 Month Cells */}
                    {c.months.map((m) => {
                      const { displayVal } = getCellDetails(m);
                      const colorClass = getCellColorClass(m);

                      return (
                        <td
                          key={m.month_num}
                          onMouseEnter={() => setHoveredCell({ country: c, month: m })}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => setSelectedCountry(c)}
                          className="cursor-pointer p-1.5 text-center"
                        >
                          <div
                            className={`flex h-10 w-full items-center justify-center rounded-lg border text-[11px] transition-all duration-150 group-hover:scale-[1.02] ${colorClass}`}
                          >
                            {displayVal}
                          </div>
                        </td>
                      );
                    })}

                    {/* Total Column */}
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                      <div>
                        {typeof totalMetricVal === 'number'
                          ? formatCompact(totalMetricVal)
                          : totalMetricVal}
                      </div>
                      <div className="text-[10px] font-normal text-slate-600">
                        {activeMetric === 'cases'
                          ? `${formatCompact(c.total_deaths)} deaths`
                          : activeMetric === 'deaths'
                          ? `${formatCompact(c.total_cases)} cases`
                          : activeMetric === 'cfr'
                          ? `${formatCompact(c.total_cases)} cases`
                          : `${formatCompact(c.total_cases)} cases`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ?? Active Hover Popover / Tooltip ?? */}
      {hoveredCell && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50/90 via-white to-blue-50/70 p-3 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CountryFlag
              countryName={hoveredCell.country.country}
              shape="rounded"
              size="md"
              className="shadow-xs"
            />
            <div>
              <span className="text-sm font-black text-slate-900">
                {hoveredCell.country.country}
              </span>
              <span className="ml-2 font-bold text-slate-500">
                ? {hoveredCell.month.month_name} {selectedYear}
              </span>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Based on crawled articles published in {hoveredCell.month.month_name} {selectedYear}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-sans">
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Detected Cases</div>
              <div className="text-sm font-black text-blue-700">
                {formatCompact(hoveredCell.month.cases)}
              </div>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Deaths</div>
              <div className="text-sm font-black text-rose-700">
                {formatCompact(hoveredCell.month.deaths)}
              </div>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Case Fatality Rate</div>
              <div className="text-sm font-black text-amber-700">
                {normalizeCfr(hoveredCell.month.cases, hoveredCell.month.deaths).toFixed(2)}
                %
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ?? Bottom Legend & Info ?? */}
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/80 pt-4 text-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Scale Legend */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Scale Intensity:
            </span>
            <button
              type="button"
              onClick={() => setShowScaleInfo(true)}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-[#0060A9] transition shadow-xs focus:outline-none cursor-pointer"
              title="Scale Intensity Formula & Calculation Guide"
              aria-label="Scale Intensity Info"
            >
              <Info className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-400">
              0
            </span>
            <span className="text-[11px] text-slate-500">Zero / No data yet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-100 text-[10px] font-bold text-emerald-800">
              Low
            </span>
            <span className="text-[11px] text-slate-500">Low</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800">
              Med
            </span>
            <span className="text-[11px] text-slate-500">Medium</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-orange-400 bg-orange-200 text-[10px] font-bold text-orange-950">
              High
            </span>
            <span className="text-[11px] text-slate-500">High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-rose-600 bg-rose-500 text-[10px] font-bold text-white shadow-xs">
              Peak
            </span>
            <span className="text-[11px] text-slate-500">Critical / Peak</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600">
          Click a country row to view its detailed monthly trend chart.
        </div>
      </div>

      {/* Modal Breakdown for Selected Country */}
      {mounted && selectedCountry && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xs transition-all duration-300 animate-in fade-in">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/30 to-white px-6 py-5">
              <div className="flex items-center gap-3.5">
                <CountryFlag
                  countryName={selectedCountry.country}
                  shape="rounded"
                  size="lg"
                  className="shadow-md ring-1 ring-slate-200/80"
                />
                <div>
                  <h3 className="text-xl font-black tracking-tight text-slate-900">
                    Epidemiological Profile: {selectedCountry.country}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Real-time pathogen distribution and monthly surveillance trajectory ({selectedYear})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCountry(null)}
                aria-label="Close Country Details"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Modal KPI Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/80 to-blue-50/20 p-4 shadow-2xs">
                  <div className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                    Total Cases
                  </div>
                  <div className="mt-1 text-2xl font-black text-blue-950">
                    {formatCompact(selectedCountry.total_cases)}
                  </div>
                  <div className="text-[10px] text-blue-600/80 mt-0.5 font-medium">Aggregated across all signals</div>
                </div>
                <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/80 to-rose-50/20 p-4 shadow-2xs">
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                    Total Deaths
                  </div>
                  <div className="mt-1 text-2xl font-black text-rose-950">
                    {formatCompact(selectedCountry.total_deaths)}
                  </div>
                  <div className="text-[10px] text-rose-600/80 mt-0.5 font-medium">Reported fatalities</div>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-amber-50/20 p-4 shadow-2xs">
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                    Case Fatality Rate (CFR)
                  </div>
                  <div className="mt-1 text-2xl font-black text-amber-950">
                    {normalizeCfr(selectedCountry.total_cases, selectedCountry.total_deaths).toFixed(2)}%
                  </div>
                  <div className="text-[10px] text-amber-600/80 mt-0.5 font-medium">National fatality severity</div>
                </div>
              </div>

              {/* Active Diseases Breakdown Section */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Active Diseases & Pathogens Occurring in {selectedCountry.country}
                    </h4>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                    {selectedCountry.diseases && selectedCountry.diseases.length > 0
                      ? `${selectedCountry.diseases.length} Pathogens Tracked`
                      : '0 Pathogens Tracked'}
                  </span>
                </div>

                {selectedCountry.diseases && selectedCountry.diseases.length > 0 ? (
                  <div className="mt-3.5 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-black uppercase tracking-wider text-slate-600">
                          <th className="px-4 py-2.5">Disease / Pathogen</th>
                          <th className="px-3 py-2.5 text-right">Detected Cases</th>
                          <th className="px-3 py-2.5 text-right">Deaths</th>
                          <th className="px-3 py-2.5 text-right">CFR</th>
                          <th className="px-3 py-2.5 text-center">Signals</th>
                          <th className="px-4 py-2.5 text-right">Latest Update</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedCountry.diseases.map((d) => {
                          const cfr = normalizeCfr(d.cases, d.deaths);
                          const hasAlert = d.alerts > 0;
                          return (
                            <tr key={d.disease} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                                  <span>{d.disease}</span>
                                  {hasAlert && (
                                    <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-800 border border-rose-200">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Alert
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-blue-700">
                                {formatCompact(d.cases)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-rose-700">
                                {formatCompact(d.deaths)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-semibold text-amber-800">
                                {cfr.toFixed(2)}%
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                  {d.events}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                {d.latest_published_label || d.latest_published || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <p className="text-xs font-semibold text-slate-500">
                      No active disease outbreaks or pathogen signals detected in {selectedCountry.country} for {selectedYear}.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Chart */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-2xs">
                <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-bold text-slate-700">
                    Monthly Cases & Deaths Trend ({selectedCountry.country} — {selectedYear})
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">
                    Spatiotemporal distribution by calendar month
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={selectedCountry.months}
                      margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="month_name"
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
                          Number(val).toLocaleString('en-US'),
                          name === 'cases' ? 'Detected Cases' : 'Deaths',
                        ]}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Bar
                        dataKey="cases"
                        fill="#0284c7"
                        radius={[4, 4, 0, 0]}
                        name="cases"
                      />
                      <Line
                        type="monotone"
                        dataKey="deaths"
                        stroke="#e11d48"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#e11d48' }}
                        name="deaths"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Modal Close Footer */}
            <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                onClick={() => setSelectedCountry(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal: Scale Intensity & Metric Formula Guide ── */}
      {mounted && showScaleInfo && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xs transition-all duration-300 animate-in fade-in"
          onClick={() => setShowScaleInfo(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Clean Title without Icon */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/40 to-white px-6 py-4 sm:px-7">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  Scale Intensity & Calculation Formulas
                </h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  How the intensity scale, normalization ratio, and epidemiology metrics are calculated
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScaleInfo(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
              {/* Formula Highlight Banner */}
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-blue-800">
                    Monthly relative normalization formula
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    Adaptive scale for the selected period ({selectedYear})
                  </span>
                </div>
                <div className="rounded-xl border border-blue-200/80 bg-white p-4 font-mono text-center shadow-2xs">
                  <div className="text-sm sm:text-base font-black text-blue-900">
                    Intensity Ratio (R) = <span className="text-blue-700">Monthly Value</span> / <span className="text-indigo-700">Peak Monthly Value in Year (Vmax)</span>
                  </div>
                  <p className="mt-1 font-sans text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Monthly Value</span> is the case or death count for that month, while <span className="font-semibold text-slate-700">Vmax</span> is the highest monthly value in the ASEAN region during {selectedYear}.
                  </p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This relative scale stays sensitive to seasonal spikes without being flattened by a fixed absolute cutoff.
                </p>
              </div>

              {/* 5 Intensity Tiers Table */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Five intensity levels
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Based on the ratio to the peak value (R)
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90">
                        <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-600 text-[10px]">
                          Level
                        </th>
                        <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-600 text-[10px]">
                          Ratio threshold
                        </th>
                        <th className="px-4 py-3 font-bold uppercase tracking-wider text-slate-600 text-[10px]">
                          Definition
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      <tr className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-500">
                            0
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-600 whitespace-nowrap">
                          Value = 0 (R = 0%)
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong className="text-slate-800 font-bold">Zero / No Data:</strong> No case or death reports were detected from news, indicator, or health-portal sources that month.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded border border-emerald-200 bg-emerald-100 text-[10px] font-bold text-emerald-800">
                            Low
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700 whitespace-nowrap">
                          0 &lt; R &lt; 5%
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong className="text-emerald-800 font-bold">Low (baseline):</strong> Sporadic transmission inside the expected baseline.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800">
                            Med
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-amber-700 whitespace-nowrap">
                          5% &le; R &lt; 20%
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong className="text-amber-800 font-bold">Medium:</strong> An ongoing cluster is present and should be watched.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded border border-orange-400 bg-orange-200 text-[10px] font-bold text-orange-950">
                            High
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-orange-800 whitespace-nowrap">
                          20% &le; R &lt; 55%
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong className="text-orange-950 font-bold">High:</strong> Cases are well above the recent trend and need earlier follow-up.
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded border border-rose-600 bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                            Peak
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-rose-700 whitespace-nowrap">
                          R &ge; 55%
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong className="text-rose-700 font-bold">Critical / Peak:</strong> Transmission is in the highest band for the year and needs urgent follow-up.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Metric Breakdown Cards */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-2.5">
                  Epidemiology metrics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <div className="text-blue-900 font-black text-xs uppercase tracking-wider">
                      Detected Cases
                    </div>
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                      Detected cases aggregated from news and health reports after entity extraction and location resolution.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <div className="text-rose-900 font-black text-xs uppercase tracking-wider">
                      Recorded Deaths
                    </div>
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                      Deaths explicitly reported in articles published that month.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <div className="text-amber-900 font-black text-xs uppercase tracking-wider">
                      Case Fatality Rate (CFR %)
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-200/80 font-mono text-[11px] font-bold text-amber-800 text-center">
                      (Deaths / Cases) &times; 100%
                    </div>
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                      Case fatality ratio. On the CFR view, intensity is measured against a 15% clinical fatality threshold.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-slate-50/80 px-6 py-3.5 sm:px-7">
              <button
                type="button"
                onClick={() => setShowScaleInfo(false)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Close guide
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </section>
  );
}

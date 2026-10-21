'use client';

// SKDR filter bar: same layout/styling as NLP EpiFilterBar, but Indonesia only:
// Penyakit + Provinsi + Kabupaten/Kota (depends on Provinsi) + MMWR epi-week range.
import React, { useEffect, useMemo, useState } from 'react';
import { Filter, MapPin, Map as MapIcon, CalendarDays, Bug, Calendar, CheckCircle2, RotateCcw, ChevronDown, AlertCircle, Radio } from 'lucide-react';
import { getEpiWeekDateRange, getCurrentEpiWeek, formatEpiRangeDescription, getWeeksInYear } from '@/lib/epi-week';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { SourceFilter } from '@/components/analytics/SourceBadge';
import type { Sumber } from '@/lib/use-sumber';
import { fetchProvinces, fetchKabkota, type MasterProvince, type MasterKabkota } from '@/lib/skdr-api';

export interface SkdrFilterState {
  disease: string;
  /** 'all' | 'form' | 'ebs' */
  source: string;
  provinceId: number | null;
  kabkotaId: number | null;
  startYear: number;
  startWeek: number;
  endYear: number;
  endWeek: number;
}

interface Props {
  availableDiseases?: string[];
  availableYears?: number[];
  currentEpiWeek?: number;
  currentEpiYear?: number;
  value: SkdrFilterState;
  onChange: (filters: SkdrFilterState) => void;
  onApply: (filters: SkdrFilterState) => void;
  isLoading?: boolean;
  /** PR 016: global Sumber (Semua/EBS/PE) rendered inside the bar; applies immediately. */
  sumber?: string;
  onSumberChange?: (v: Sumber) => void;
  /** false on /penyakit/[kode] where the disease is fixed by the page. */
  showDisease?: boolean;
  /** hide the title/period header row (compact use). */
  compact?: boolean;
}

const box =
  'relative h-10 min-w-0 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100 transition shadow-2xs';
const sel = 'h-full w-full truncate appearance-none bg-transparent px-3 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8 disabled:cursor-not-allowed disabled:text-slate-400';
const mini = 'h-8 min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent px-1 text-xs font-bold text-slate-800 outline-none hover:bg-white';
const chev = 'pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400';
// static class names so Tailwind can see them: key = <has Sumber><has Penyakit>
const GRID: Record<string, string> = {
  '11': 'lg:grid-cols-[minmax(15rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '10': 'lg:grid-cols-[minmax(15rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '01': 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '00': 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
};
const lbl = 'flex h-4 items-center gap-1 truncate text-[10.5px] font-extrabold uppercase leading-none tracking-wider text-slate-700';

export default function SkdrFilterBar({
  availableDiseases = [],
  availableYears = [],
  currentEpiWeek: serverEpiWeek,
  currentEpiYear: serverEpiYear,
  value,
  onChange,
  onApply,
  isLoading = false,
  sumber,
  onSumberChange,
  showDisease = true,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SkdrFilterState>(value);
  const [provinces, setProvinces] = useState<MasterProvince[]>([]);
  const [kabkota, setKabkota] = useState<MasterKabkota[]>([]);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(() => setProvinces([]));
  }, []);
  useEffect(() => {
    if (!draft.provinceId) {
      setKabkota([]);
      return;
    }
    let live = true;
    fetchKabkota(draft.provinceId)
      .then((rows) => live && setKabkota(rows))
      .catch(() => live && setKabkota([]));
    return () => {
      live = false;
    };
  }, [draft.provinceId]);

  const currentEpi = useMemo(
    () => (serverEpiWeek && serverEpiYear ? { year: serverEpiYear, week: serverEpiWeek } : getCurrentEpiWeek()),
    [serverEpiWeek, serverEpiYear],
  );
  const years = useMemo(() => {
    const list = new Set<number>([...availableYears, currentEpi.year]);
    return Array.from(list).sort((a, b) => b - a);
  }, [availableYears, currentEpi.year]);
  const weeks = (y: number) => Array.from({ length: getWeeksInYear(y || currentEpi.year) }, (_, i) => i + 1);
  const startRange = useMemo(() => getEpiWeekDateRange(draft.startYear, draft.startWeek, 'id'), [draft.startYear, draft.startWeek]);
  const endRange = useMemo(() => getEpiWeekDateRange(draft.endYear, draft.endWeek, 'id'), [draft.endYear, draft.endWeek]);
  const totalWeeks = useMemo(
    () => Math.max(1, (draft.endYear - draft.startYear) * 52 + (draft.endWeek - draft.startWeek + 1)),
    [draft.startYear, draft.startWeek, draft.endYear, draft.endWeek],
  );
  const invalid = draft.startYear > draft.endYear || (draft.startYear === draft.endYear && draft.startWeek > draft.endWeek);
  const diseaseOptions = useMemo(
    () => Array.from(new Set(availableDiseases.filter((d) => d && d.trim()).map((d) => d.trim()))).sort((a, b) => a.localeCompare(b, 'id')),
    [availableDiseases],
  );
  const provinceName = provinces.find((p) => p.id === draft.provinceId)?.name;
  const kabName = kabkota.find((k) => k.id === draft.kabkotaId)?.name;

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (invalid) return;
    onChange(draft);
    onApply(draft);
  };
  const reset = () => {
    const d: SkdrFilterState = {
      disease: 'all', source: 'all', provinceId: null, kabkotaId: null,
      startYear: currentEpi.year, startWeek: 1, endYear: currentEpi.year, endWeek: currentEpi.week || 1,
    };
    setDraft(d);
    onChange(d);
    onApply(d);
  };

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all relative">
      {compact ? null : <div className="flex flex-col gap-2 pb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-primary">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-primary">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">{t('skdr.filter.title')}</h2>
            <p className="text-[11px] text-slate-500">{t('skdr.filter.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-900">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span className="font-extrabold text-[11px] text-primary">
              {formatEpiRangeDescription(draft.startYear, draft.startWeek, draft.endYear, draft.endWeek, 'id')}
            </span>
            <span className="ml-1 rounded-md bg-primary px-1.5 py-0.5 text-[9.5px] font-bold text-white">
              {t('skdr.filter.weeksBadge', { count: totalWeeks })}
            </span>
          </div>
        </div>
      </div>}

      {/* PR 016: one tidy row — every control is h-10 under a one-line label (no helper text below fields; full
          names live in the title tooltip). Sumber is part of the bar; Awal/Akhir are one "Periode (Minggu Epi)" control. */}
      <form onSubmit={apply} className={compact ? "space-y-3" : "mt-4 space-y-3"} data-testid="skdr-filter-bar">
        <div className={`grid grid-cols-1 items-end gap-3 sm:grid-cols-2 ${GRID[`${onSumberChange ? 1 : 0}${showDisease ? 1 : 0}`]}`}>
          {onSumberChange ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={lbl}><Radio className="h-3 w-3 text-primary" />{t('skdr.source.filter')}</span>
              <div className="[&>div]:flex [&>div]:h-10 [&>div]:w-full [&>div]:items-stretch [&_button]:flex-1 [&_button]:justify-center">
                <SourceFilter value={sumber || 'all'} onChange={onSumberChange} />
              </div>
            </div>
          ) : null}

          {showDisease ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="select-disease" className={lbl}><Bug className="h-3 w-3 text-primary" />{t('skdr.filter.disease')}</label>
              <div className={box} title={draft.disease === 'all' ? t('skdr.filter.allClassifications') : draft.disease}>
                <select id="select-disease" value={draft.disease} onChange={(e) => setDraft({ ...draft, disease: e.target.value })} className={sel}>
                  <option value="all">{t('skdr.filter.allDiseases')}</option>
                  {diseaseOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown className={chev} />
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="select-province" className={lbl}><MapIcon className="h-3 w-3 text-primary" />{t('skdr.filter.province')}</label>
            <div className={box} title={provinceName || t('skdr.filter.allIndonesia')}>
              <select id="select-province" value={draft.provinceId ?? ''} className={sel}
                onChange={(e) => setDraft({ ...draft, provinceId: e.target.value ? Number(e.target.value) : null, kabkotaId: null })}>
                <option value="">{t('skdr.filter.allProvinces', { count: provinces.length || 38 })}</option>
                {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className={chev} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="select-kabkota" className={lbl}><MapPin className="h-3 w-3 text-primary" />{t('skdr.filter.kabkota')}</label>
            <div className={box} title={kabName || (draft.provinceId ? t('skdr.filter.wholeProvince') : t('skdr.filter.chooseProvinceFirst'))}>
              <select id="select-kabkota" value={draft.kabkotaId ?? ''} disabled={!draft.provinceId} className={sel}
                onChange={(e) => setDraft({ ...draft, kabkotaId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{draft.provinceId ? t('skdr.filter.allKabkota', { count: kabkota.length }) : t('skdr.filter.chooseProvinceFirst')}</option>
                {kabkota.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <ChevronDown className={chev} />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <span className={lbl}><CalendarDays className="h-3 w-3 text-primary" />{t('skdr.filter.epiRange')}</span>
            <div className={`${box} flex h-10 items-center gap-1 px-2`} title={`${startRange.startFormatted} – ${endRange.endFormatted}`} data-testid="epi-range">
              {(['start', 'end'] as const).map((side) => {
                const yKey = side === 'start' ? 'startYear' : 'endYear';
                const wKey = side === 'start' ? 'startWeek' : 'endWeek';
                return (
                  <React.Fragment key={side}>
                    {side === 'end' ? <span className="px-1 text-xs font-bold text-slate-400">–</span> : null}
                    <select aria-label={t(side === 'start' ? 'skdr.filter.startWeekAria' : 'skdr.filter.endWeekAria')} value={draft[wKey]}
                      onChange={(e) => setDraft({ ...draft, [wKey]: Number(e.target.value) })} className={mini}>
                      {weeks(draft[yKey]).map((w) => <option key={w} value={w}>{t('skdr.filter.weekShort', { week: w })}</option>)}
                    </select>
                    <select aria-label={t(side === 'start' ? 'skdr.filter.startYearAria' : 'skdr.filter.endYearAria')} value={draft[yKey]}
                      onChange={(e) => setDraft({ ...draft, [yKey]: Number(e.target.value) })} className={mini}>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
            <button type="submit" id="btn-apply-filter" disabled={isLoading || invalid}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary-dark bg-primary px-5 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition hover:bg-primary-dark active:bg-brand-900 disabled:pointer-events-none disabled:opacity-50 lg:flex-none">
              {isLoading ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              <span>{isLoading ? t('common.loading') : t('skdr.filter.apply')}</span>
            </button>
            <button type="button" id="btn-reset-filter" onClick={reset} title={t('skdr.filter.resetTitle')} aria-label={t('skdr.filter.resetTitle')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-600 shadow-xs transition hover:bg-slate-200 hover:text-slate-900">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {invalid && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('skdr.filter.invalidRange')}</span>
          </div>
        )}
      </form>
    </section>
  );
}

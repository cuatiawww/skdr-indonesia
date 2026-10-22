'use client';

// SKDR filter bar: same layout/styling as NLP EpiFilterBar, but Indonesia only:
// Penyakit + Provinsi + Kabupaten/Kota (depends on Provinsi) + MMWR epi-week range.
import React, { useEffect, useMemo, useState } from 'react';
import { Filter, MapPin, Map as MapIcon, CalendarDays, Bug, Calendar, CheckCircle2, RotateCcw, AlertCircle, Radio } from 'lucide-react';
import { getEpiWeekDateRange, getCurrentEpiWeek, formatEpiRangeDescription, getWeeksInYear } from '@/lib/epi-week';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { SourceFilter } from '@/components/analytics/SourceBadge';
import type { Sumber } from '@/lib/use-sumber';
import { fetchProvinces, fetchFormDiseases, type MasterProvince, type MasterKabkota, type MasterDisease } from '@/lib/skdr-api';
import { fetchFrom } from '@/lib/api';
import MultiSelect from '@/components/filters/MultiSelect';
import { Building2 } from 'lucide-react';

/** API params for a filter state: comma lists, omitted when not narrowed. */
export function filterParams(f: SkdrFilterState) {
  return {
    disease: f.diseases.length ? f.diseases.join(',') : undefined,
    province_id: f.provinceIds.length ? f.provinceIds.join(',') : undefined,
    kabkota_id: f.kabkotaIds.length ? f.kabkotaIds.join(',') : undefined,
    unit: f.units?.length ? f.units.join('|') : undefined,
  };
}
/** Browser URL state: ?penyakit=a,b&prov=11,12&kab=... */
export function readUrlFilters(sp: URLSearchParams) {
  const ints = (v: string | null) => (v || '').split(',').map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  return {
    diseases: (sp.get('penyakit') || '').split(',').map((x) => x.trim()).filter(Boolean),
    provinceIds: ints(sp.get('prov')),
    kabkotaIds: ints(sp.get('kab')),
  };
}
export function writeUrlFilters(url: URL, f: SkdrFilterState) {
  const set = (k: string, v: (string | number)[]) => (v.length ? url.searchParams.set(k, v.join(',')) : url.searchParams.delete(k));
  set('penyakit', f.diseases); set('prov', f.provinceIds); set('kab', f.kabkotaIds);
  for (const old of ['disease', 'province_id', 'kabkota_id']) url.searchParams.delete(old);
}

/** PR 018: multi-select — every list empty = semua (no narrowing). */
export interface SkdrFilterState {
  /** registry disease codes */
  diseases: string[];
  /** 'all' | 'form' | 'ebs' */
  source: string;
  provinceIds: number[];
  kabkotaIds: number[];
  /** PR 019: Unit pelapor (lower-cased names as recorded in EBS `unit` / PE `unit_pelapor`); empty = semua. */
  units?: string[];
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
  'relative h-10 min-w-0 rounded-lg border border-line bg-card hover:border-brand-300 focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100 transition shadow-2xs';
const sel = 'h-full w-full truncate appearance-none bg-transparent px-3 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8 disabled:cursor-not-allowed disabled:text-slate-400';
const mini = 'h-8 min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent px-1 text-xs font-bold text-slate-800 outline-none hover:bg-white';
const chev = 'pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400';
// PR 018: 3 columns at lg, one row from 2xl (multi-select labels like "3 provinsi dipilih" need the width)
// static class names so Tailwind can see them: key = <has Sumber><has Penyakit>
const GRID: Record<string, string> = {
  '11': 'lg:grid-cols-3 2xl:grid-cols-[minmax(15rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '10': 'lg:grid-cols-3 2xl:grid-cols-[minmax(15rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '01': 'lg:grid-cols-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
  '00': 'lg:grid-cols-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,1.3fr)_auto]',
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
  const [diseases, setDiseases] = useState<MasterDisease[]>([]);
  const [units, setUnits] = useState<{ value: string; label: string; kind?: string | null; kabkota?: string | null; ebs: number; pe: number; in_master: boolean }[]>([]);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(() => setProvinces([]));
    // all kab/kota once (≈514 rows); the list is narrowed to the checked provinces on the client
    fetchFrom<MasterKabkota[]>('/api/v1/master/kabkota').then(setKabkota).catch(() => setKabkota([]));
    fetchFormDiseases().then(setDiseases).catch(() => setDiseases([]));
  }, []);
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
  // Penyakit options from the registry (master_diseases); availableDiseases (names) only as a fallback before it loads
  const diseaseOptions = useMemo(
    () => diseases.length
      ? diseases.map((d) => ({ value: d.code, label: d.name })).sort((a, b) => a.label.localeCompare(b.label, 'id'))
      : Array.from(new Set(availableDiseases.filter((d) => d && d.trim()))).sort((a, b) => a.localeCompare(b, 'id')).map((d) => ({ value: d, label: d })),
    [diseases, availableDiseases],
  );
  const provinceOptions = useMemo(() => provinces.map((p) => ({ value: String(p.id), label: p.name })), [provinces]);
  // Kab/Kota limited to the checked provinces (all provinces when none checked), grouped by province
  const kabOptions = useMemo(() => {
    const ps = new Set(draft.provinceIds);
    return kabkota.filter((k) => ps.size === 0 || ps.has(k.province_id))
      .sort((a, b) => a.province_name.localeCompare(b.province_name, 'id') || a.name.localeCompare(b.name, 'id'))
      .map((k) => ({ value: String(k.id), label: k.name, group: k.province_name }));
  }, [kabkota, draft.provinceIds]);
  const setProvinces2 = (ids: number[]) => {
    // unchecking a province drops its kab/kota from the selection
    const ps = new Set(ids);
    const keep = draft.kabkotaIds.filter((id) => { const k = kabkota.find((x) => x.id === id); return !k || ps.size === 0 || ps.has(k.province_id); });
    setDraft({ ...draft, provinceIds: ids, kabkotaIds: keep });
  };
  // PR 019: Unit pelapor options cascade from the checked Provinsi / Kab-Kota (server-side, names as recorded in EBS/PE)
  const provKey = draft.provinceIds.join(','), kabKey = draft.kabkotaIds.join(',');
  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams();
    if (provKey) qs.set('province_id', provKey);
    if (kabKey) qs.set('kabkota_id', kabKey);
    fetchFrom<typeof units>(`/api/v1/filters/units${qs.toString() ? `?${qs}` : ''}`).then((u) => alive && setUnits(u || [])).catch(() => alive && setUnits([]));
    return () => { alive = false };
  }, [provKey, kabKey]);
  const unitOptions = useMemo(() => units.map((u) => ({ value: u.value, label: u.label, group: u.kind || t('skdr.filter.unitOther') })), [units, t]);
  // drop selected units that are no longer offered after narrowing Provinsi / Kab-Kota
  useEffect(() => {
    if (!units.length || !draft.units?.length) return;
    const ok = new Set(units.map((u) => u.value));
    const keep = draft.units.filter((u) => ok.has(u));
    if (keep.length !== draft.units.length) setDraft((d) => ({ ...d, units: keep }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);
  const ms = { searchPlaceholder: t('skdr.filter.search'), selectAllLabel: t('skdr.filter.selectAll'), clearLabel: t('skdr.filter.clear'), emptyLabel: t('skdr.filter.noOptions') };

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (invalid) return;
    onChange(draft);
    onApply(draft);
  };
  const reset = () => {
    const d: SkdrFilterState = {
      diseases: [], source: 'all', provinceIds: [], kabkotaIds: [], units: [],
      startYear: currentEpi.year, startWeek: 1, endYear: currentEpi.year, endWeek: currentEpi.week || 1,
    };
    setDraft(d);
    onChange(d);
    onApply(d);
  };

  return (
    <section className="relative w-full border-b skdr-rule pb-4">
      {compact ? null : <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
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
              <MultiSelect id="select-disease" options={diseaseOptions} value={draft.diseases} {...ms}
                onChange={(v) => setDraft({ ...draft, diseases: v })}
                allLabel={t('skdr.filter.allDiseasesMs')} countLabel={(n) => t('skdr.filter.nDiseases', { n })} />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="select-province" className={lbl}><MapIcon className="h-3 w-3 text-primary" />{t('skdr.filter.province')}</label>
            <MultiSelect id="select-province" options={provinceOptions} value={draft.provinceIds.map(String)} {...ms}
              onChange={(v) => setProvinces2(v.map(Number))}
              allLabel={t('skdr.filter.allProvincesMs')} countLabel={(n) => t('skdr.filter.nProvinces', { n })} />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="select-kabkota" className={lbl}><MapPin className="h-3 w-3 text-primary" />{t('skdr.filter.kabkota')}</label>
            <MultiSelect id="select-kabkota" options={kabOptions} value={draft.kabkotaIds.map(String)} {...ms}
              onChange={(v) => setDraft({ ...draft, kabkotaIds: v.map(Number) })}
              allLabel={draft.provinceIds.length ? t('skdr.filter.allKabkotaSelected') : t('skdr.filter.allKabkotaMs')} countLabel={(n) => t('skdr.filter.nKabkota', { n })} />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="select-unit" className={lbl}><Building2 className="h-3 w-3 text-primary" />{t('skdr.filter.unit')}</label>
            <MultiSelect id="select-unit" options={unitOptions} value={draft.units || []} {...ms}
              onChange={(v) => setDraft({ ...draft, units: v })}
              allLabel={t('skdr.filter.allUnits')} countLabel={(n) => t('skdr.filter.nUnits', { n })} />
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

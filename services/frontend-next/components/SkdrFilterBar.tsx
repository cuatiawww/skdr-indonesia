'use client';

// SKDR filter bar: same layout/styling as NLP EpiFilterBar, but Indonesia only:
// Penyakit + Provinsi + Kabupaten/Kota (depends on Provinsi) + MMWR epi-week range.
import React, { useEffect, useMemo, useState } from 'react';
import { Filter, MapPin, Map as MapIcon, CalendarDays, Bug, Calendar, CheckCircle2, RotateCcw, ChevronDown, AlertCircle, Radio } from 'lucide-react';
import { getEpiWeekDateRange, getCurrentEpiWeek, formatEpiRangeDescription, getWeeksInYear } from '@/lib/epi-week';
import { useTranslation } from '@/lib/i18n/LanguageContext';
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
}

const box =
  'relative rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs';
const sel = 'w-full appearance-none bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8 disabled:cursor-not-allowed disabled:text-slate-400';
const lbl = 'text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1';

export default function SkdrFilterBar({
  availableDiseases = [],
  availableYears = [],
  currentEpiWeek: serverEpiWeek,
  currentEpiYear: serverEpiYear,
  value,
  onChange,
  onApply,
  isLoading = false,
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
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-[#0060A9]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0060A9]">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">{t('skdr.filter.title')}</h2>
            <p className="text-[11px] text-slate-500">{t('skdr.filter.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
            <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
            <span className="font-extrabold text-[11px] text-[#0060A9]">
              {formatEpiRangeDescription(draft.startYear, draft.startWeek, draft.endYear, draft.endWeek, 'id')}
            </span>
            <span className="ml-1 rounded-md bg-[#0060A9] px-1.5 py-0.5 text-[9.5px] font-bold text-white">
              {t('skdr.filter.weeksBadge', { count: totalWeeks })}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={apply} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(14,minmax(0,1fr))]">
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label htmlFor="select-disease" className={lbl}>
              <Bug className="h-3 w-3 text-red-500" />
              {t('skdr.filter.disease')}
            </label>
            <div className={box}>
              <select id="select-disease" value={draft.disease} onChange={(e) => setDraft({ ...draft, disease: e.target.value })} className={sel}>
                <option value="all">{t('skdr.filter.allDiseases')}</option>
                {diseaseOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500 px-1 truncate">
              {draft.disease === 'all' ? t('skdr.filter.allClassifications') : t('skdr.filter.selected', { value: draft.disease })}
            </p>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-1">
            <label htmlFor="select-source" className={lbl}>
              <Radio className="h-3 w-3 text-emerald-600" />
              {t('skdr.filter.source')}
            </label>
            <div className={box}>
              <select id="select-source" value={draft.source || 'all'} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={sel}>
                <option value="all">{t('skdr.filter.sourceAll')}</option>
                <option value="pe">{t('skdr.filter.sourcePe')}</option>
                <option value="ebs">{t('skdr.filter.sourceEbs')}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500 px-1 truncate">{t('skdr.filter.sourceHint')}</p>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-1">
            <label htmlFor="select-province" className={lbl}>
              <MapIcon className="h-3 w-3 text-[#0060A9]" />
              {t('skdr.filter.province')}
            </label>
            <div className={box}>
              <select
                id="select-province"
                value={draft.provinceId ?? ''}
                onChange={(e) => setDraft({ ...draft, provinceId: e.target.value ? Number(e.target.value) : null, kabkotaId: null })}
                className={sel}
              >
                <option value="">{t('skdr.filter.allProvinces', { count: provinces.length || 38 })}</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500 px-1 truncate">{provinceName || t('skdr.filter.allIndonesia')}</p>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-1">
            <label htmlFor="select-kabkota" className={lbl}>
              <MapPin className="h-3 w-3 text-emerald-600" />
              {t('skdr.filter.kabkota')}
            </label>
            <div className={box}>
              <select
                id="select-kabkota"
                value={draft.kabkotaId ?? ''}
                disabled={!draft.provinceId}
                onChange={(e) => setDraft({ ...draft, kabkotaId: e.target.value ? Number(e.target.value) : null })}
                className={sel}
              >
                <option value="">
                  {draft.provinceId ? t('skdr.filter.allKabkota', { count: kabkota.length }) : t('skdr.filter.chooseProvinceFirst')}
                </option>
                {kabkota.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500 px-1 truncate">
              {kabName ? t('skdr.filter.selected', { value: kabName }) : draft.provinceId ? t('skdr.filter.wholeProvince') : '—'}
            </p>
          </div>

          {(['start', 'end'] as const).map((side) => {
            const yKey = side === 'start' ? 'startYear' : 'endYear';
            const wKey = side === 'start' ? 'startWeek' : 'endWeek';
            return (
              <div key={side} className="lg:col-span-2 flex flex-col gap-1">
                <label className={lbl}>
                  <CalendarDays className={`h-3 w-3 ${side === 'start' ? 'text-emerald-600' : 'text-blue-600'}`} />
                  {t(side === 'start' ? 'skdr.filter.startWeek' : 'skdr.filter.endWeek')}
                </label>
                <div className="flex gap-1.5">
                  <div className={`${box} flex-1`}>
                    <select
                      aria-label={t(side === 'start' ? 'skdr.filter.startWeekAria' : 'skdr.filter.endWeekAria')}
                      value={draft[wKey]}
                      onChange={(e) => setDraft({ ...draft, [wKey]: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {weeks(draft[yKey]).map((w) => (
                        <option key={w} value={w}>{t('skdr.filter.weekShort', { week: w })}</option>
                      ))}
                    </select>
                  </div>
                  <div className={`${box} w-20`}>
                    <select
                      aria-label={t(side === 'start' ? 'skdr.filter.startYearAria' : 'skdr.filter.endYearAria')}
                      value={draft[yKey]}
                      onChange={(e) => setDraft({ ...draft, [yKey]: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p
                  className={`text-[9.5px] font-medium rounded-md px-1.5 py-0.5 mt-0.5 truncate border ${
                    side === 'start' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-blue-800 bg-blue-50 border-blue-200'
                  }`}
                >
                  📅 {side === 'start' ? startRange.startFormatted : endRange.endFormatted}
                </p>
              </div>
            );
          })}

          <div className="lg:col-span-2 flex items-end gap-1.5 pb-0.5">
            <button
              type="submit"
              id="btn-apply-filter"
              disabled={isLoading || invalid}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0060A9] hover:bg-[#004e8a] active:bg-[#003c6b] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white border border-[#004e8a] shadow-xs transition active:scale-98 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{t('skdr.filter.apply')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              id="btn-reset-filter"
              onClick={reset}
              title={t('skdr.filter.resetTitle')}
              aria-label={t('skdr.filter.resetTitle')}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition active:scale-98 shadow-xs cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {invalid && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('skdr.filter.invalidRange')}</span>
          </div>
        )}
      </form>
    </section>
  );
}

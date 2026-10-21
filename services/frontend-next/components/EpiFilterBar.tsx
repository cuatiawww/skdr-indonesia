import Link from 'next/link';
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Filter,
  Globe2,
  MapPin,
  CalendarDays,
  Bug,
  Calendar,
  CheckCircle2,
  RotateCcw,
  ChevronDown,
  AlertCircle,
  Search,
  X,
  Check,
} from 'lucide-react';
import {
  getEpiWeekDateRange,
  getCurrentEpiWeek,
  formatEpiRangeDescription,
  getWeeksInYear,
  getMmwrEpiWeek,
  formatFilterDateText,
} from '@/lib/epi-week';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { ASEAN11_DISPLAY } from '@/lib/asean-scope';
import { fetchMasterCountries, fetchMasterRegions, type MasterCountry, type MasterRegion } from '@/lib/api';
import { countryInScope, sameCountry } from '@/lib/map-boundary-scope.mjs';

export interface EpiFilterState {
  disease: string;
  country: string;
  startYear: number;
  startWeek: number;
  endYear: number;
  endWeek: number;
  startDate?: string;
  endDate?: string;
  diseases?: string[];
  countries?: string[];
}

interface EpiFilterBarProps {
  availableDiseases?: string[];
  availableYears?: number[];
  currentEpiWeek?: number;
  currentEpiYear?: number;
  value: EpiFilterState;
  onChange: (filters: EpiFilterState) => void;
  onApply: (filters: EpiFilterState) => void;
  isLoading?: boolean;
  prototypeMode?: boolean;
}

/** The region token a filter value stands for, or '' when it names a country. */
function regionScopeValue(country: string, regionValues: string[]): string {
  if (country === 'global') return 'global';
  if (country === 'ASEAN' || country === 'asean11') return 'ASEAN';
  return regionValues.includes(country) ? country : '';
}

export default function EpiFilterBar({
  availableDiseases = [],
  availableYears = [2026, 2025, 2024],
  currentEpiWeek: serverEpiWeek,
  currentEpiYear: serverEpiYear,
  value,
  onChange,
  onApply,
  isLoading = false,
  prototypeMode = false,
}: EpiFilterBarProps) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en' : 'id';

  // Local draft state for smooth user selection before clicking 'Apply'
  const [draft, setDraft] = useState<EpiFilterState>(value);

  // Synchronize draft if parent value changes externally
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Dropdown popover management for multi-select
  const [openDropdown, setOpenDropdown] = useState<'disease' | 'country' | null>(null);
  const [diseaseSearch, setDiseaseSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const filterBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [masterRegions, setMasterRegions] = useState<MasterRegion[]>([]);
  const [regionChoice, setRegionChoice] = useState(regionScopeValue(value.country, []) || 'ASEAN');

  useEffect(() => {
    fetchMasterRegions({ is_active: true, per_page: 100 })
      .then((rows) => setMasterRegions((Array.isArray(rows) ? rows : []).filter((region) => region.is_active)))
      .catch(() => setMasterRegions([]));
  }, []);

  // Region options come from the region master; ASEAN and Global keep the
  // tokens the API already understands.
  const regionOptions = useMemo(() => {
    const rows = masterRegions.map((region) => ({
      value: region.code === 'ASEAN' ? 'ASEAN' : region.code === 'GLOBAL' ? 'global' : region.name,
      label: region.code === 'GLOBAL' ? 'Global (All Regions)' : `${region.name} (${region.member_count} States)`,
      region,
    }));
    return rows.length
      ? rows
      : [
          { value: 'ASEAN', label: 'ASEAN (11 States)', region: null },
          { value: 'global', label: 'Global (All Regions)', region: null },
        ];
  }, [masterRegions]);

  // A region token in the applied filter moves the region select with it.
  useEffect(() => {
    const token = regionScopeValue(draft.country, regionOptions.map((option) => option.value));
    if (token) setRegionChoice(token);
  }, [draft.country, regionOptions]);

  const selectedRegion = regionChoice;
  const selectedRegionLabel = regionOptions.find((option) => option.value === selectedRegion)?.region?.name
    || (selectedRegion === 'global' ? 'Global' : selectedRegion);

  const selectedCountry = useMemo(() => {
    if (draft.country === 'all' || regionScopeValue(draft.country, regionOptions.map((option) => option.value))) {
      return 'all';
    }
    return draft.country;
  }, [draft.country, regionOptions]);

  const handleRegionChange = (newRegion: string) => {
    setRegionChoice(newRegion);
    // The country list changes with the region, so the scope becomes the whole region.
    setDraft((prev) => ({
      ...prev,
      country: newRegion,
      countries: [],
    }));
  };

  const handleCountryChange = (newCountry: string) => {
    if (newCountry === 'all') {
      setDraft((prev) => ({ ...prev, country: selectedRegion, countries: [] }));
    } else {
      setDraft((prev) => ({ ...prev, country: newCountry, countries: [newCountry] }));
    }
  };

  const startWeeksList = useMemo(() => {
    const total = getWeeksInYear(draft.startYear || 2026);
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [draft.startYear]);

  const endWeeksList = useMemo(() => {
    const total = getWeeksInYear(draft.endYear || 2026);
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [draft.endYear]);

  const currentEpi = useMemo(() => {
    if (serverEpiWeek && serverEpiYear) {
      return { year: serverEpiYear, week: serverEpiWeek };
    }
    return getCurrentEpiWeek();
  }, [serverEpiWeek, serverEpiYear]);

  // Compute calendar dates for Start and End weeks
  const startRange = useMemo(
    () => getEpiWeekDateRange(draft.startYear, draft.startWeek, dateLocale),
    [draft.startYear, draft.startWeek, dateLocale]
  );

  const endRange = useMemo(
    () => getEpiWeekDateRange(draft.endYear, draft.endWeek, dateLocale),
    [draft.endYear, draft.endWeek, dateLocale]
  );

  // Initialize prototypeMode dates (default 1 month range) if empty
  useEffect(() => {
    if (prototypeMode) {
      setDraft((prev) => {
        let changed = false;
        const next = { ...prev };
        if (!next.endDate) {
          const now = new Date();
          next.endDate = now.toISOString().split('T')[0];
          changed = true;
        }
        if (!next.startDate) {
          const end = new Date(next.endDate);
          const past = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
          next.startDate = past.toISOString().split('T')[0];
          const sEpi = getMmwrEpiWeek(past);
          next.startYear = sEpi.year;
          next.startWeek = sEpi.week;
          changed = true;
        }
        if (!next.diseases) {
          next.diseases = prev.disease && prev.disease !== 'all' ? [prev.disease] : [];
          changed = true;
        }
        if (!next.countries) {
          next.countries = prev.country && prev.country !== 'all' && prev.country !== 'ASEAN' && prev.country !== 'global' ? [prev.country] : [];
          changed = true;
        }
        return changed ? next : prev;
      });
    }
  }, [prototypeMode]);

  const dateDiffDays = useMemo(() => {
    if (!draft.startDate || !draft.endDate) return 30;
    const s = new Date(draft.startDate).getTime();
    const e = new Date(draft.endDate).getTime();
    return Math.max(1, Math.round((e - s) / (24 * 60 * 60 * 1000)));
  }, [draft.startDate, draft.endDate]);

  // Calculate total number of weeks spanned
  const totalWeeksSpanned = useMemo(() => {
    if (prototypeMode && draft.startDate && draft.endDate) {
      return Math.max(1, Math.ceil(dateDiffDays / 7));
    }
    if (draft.startYear === draft.endYear) {
      return Math.max(1, draft.endWeek - draft.startWeek + 1);
    }
    const yearsDiff = draft.endYear - draft.startYear;
    return Math.max(1, yearsDiff * 52 + (draft.endWeek - draft.startWeek + 1));
  }, [prototypeMode, draft.startDate, draft.endDate, dateDiffDays, draft.startYear, draft.startWeek, draft.endYear, draft.endWeek]);

  const hasInvalidRange = useMemo(() => {
    if (prototypeMode && draft.startDate && draft.endDate) {
      return draft.startDate > draft.endDate;
    }
    if (draft.startYear > draft.endYear) return true;
    if (draft.startYear === draft.endYear && draft.startWeek > draft.endWeek) return true;
    return false;
  }, [prototypeMode, draft.startDate, draft.endDate, draft.startYear, draft.startWeek, draft.endYear, draft.endWeek]);

  const handleStartDateChange = (newStart: string) => {
    const match = newStart.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let startYear = draft.startYear;
    let startWeek = draft.startWeek;
    if (match) {
      const [, y, m, d] = match;
      const epi = getMmwrEpiWeek(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
      startYear = epi.year;
      startWeek = epi.week;
    }
    setDraft((prev) => ({
      ...prev,
      startDate: newStart,
      startYear,
      startWeek,
    }));
  };

  const handleEndDateChange = (newEnd: string) => {
    const match = newEnd.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let endYear = draft.endYear;
    let endWeek = draft.endWeek;
    if (match) {
      const [, y, m, d] = match;
      const epi = getMmwrEpiWeek(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
      endYear = epi.year;
      endWeek = epi.week;
    }
    setDraft((prev) => ({
      ...prev,
      endDate: newEnd,
      endYear,
      endWeek,
    }));
  };

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hasInvalidRange) return;
    setOpenDropdown(null);
    onChange(draft);
    onApply(draft);
  };

  const handleReset = () => {
    if (prototypeMode) {
      const now = new Date();
      const endIso = now.toISOString().split('T')[0];
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startIso = past.toISOString().split('T')[0];
      const sEpi = getMmwrEpiWeek(past);
      const eEpi = getMmwrEpiWeek(now);
      const defaultState: EpiFilterState = {
        disease: 'all',
        country: selectedRegion || 'ASEAN',
        startYear: sEpi.year,
        startWeek: sEpi.week,
        endYear: eEpi.year,
        endWeek: eEpi.week,
        startDate: startIso,
        endDate: endIso,
        diseases: [],
        countries: [],
      };
      setDraft(defaultState);
      setOpenDropdown(null);
      onChange(defaultState);
      onApply(defaultState);
      return;
    }

    const curW = currentEpi.week || 1;
    const curY = currentEpi.year || 2026;
    const defaultState: EpiFilterState = {
      disease: 'all',
      country: 'ASEAN',
      startYear: curY,
      startWeek: 1,
      endYear: curY,
      endWeek: curW,
      diseases: [],
      countries: [],
    };
    setDraft(defaultState);
    onChange(defaultState);
    onApply(defaultState);
  };

  // Standardized Diseases strictly from Master Data catalog
  const [masterDiseases, setMasterDiseases] = useState<string[]>(availableDiseases || []);
  const [masterCountries, setMasterCountries] = useState<MasterCountry[]>([]);

  useEffect(() => {
    fetchMasterCountries({ is_active: true, per_page: 200 })
      .then((rows) => setMasterCountries(Array.isArray(rows) ? rows : []))
      .catch(() => setMasterCountries([]));
  }, []);

  const EAST_ASIA_3_PARTNERS = useMemo<MasterCountry[]>(() => [
    { id: 'CHN', name: 'China', iso2: 'CN', iso3: 'CHN', display_order: 12, is_active: true, home_region: 'ASEAN+3' },
    { id: 'JPN', name: 'Japan', iso2: 'JP', iso3: 'JPN', display_order: 13, is_active: true, home_region: 'ASEAN+3' },
    { id: 'KOR', name: 'South Korea', iso2: 'KR', iso3: 'KOR', display_order: 14, is_active: true, home_region: 'ASEAN+3' },
  ], []);

  const isAseanPlusThree = (region: string) => {
    const r = (region || '').toLowerCase();
    return r === 'asean+3' || r === 'asean + 3' || r === 'asean3' || r === 'asean_plus_three';
  };

  const countryChoices = useMemo(() => {
    let baseList: MasterCountry[] = [];
    const members = regionOptions.find((option) => option.value === selectedRegion)?.region?.countries || [];
    if (selectedRegion !== 'global' && members.length) {
      const wanted = new Set(members.map((country) => country.name.toLowerCase()));
      // PR 154: membership comes from master_region_countries only (no forced partners),
      // so "All N members" matches the region's member_count ("11 States").
      baseList = masterCountries.filter((country) => wanted.has(country.name.toLowerCase()));
    } else {
      const scope = selectedRegion === 'global' ? 'global' : 'asean3';
      baseList = masterCountries.filter((country) => countryInScope(country, scope));
    }

    if (!baseList.length) {
      const aseanList = ASEAN11_DISPLAY.map((country) => ({
        id: country.value,
        name: country.label,
        iso2: '',
        iso3: '',
        display_order: 0,
        is_active: true,
        home_region: 'ASEAN',
      }));
      baseList = [...aseanList, ...EAST_ASIA_3_PARTNERS];
    } else if (!members.length || isAseanPlusThree(selectedRegion)) {
      // Ensure ASEAN+3 partners (China, Japan, South Korea) are in the list if ASEAN+3 is selected
      for (const partner of EAST_ASIA_3_PARTNERS) {
        const found = baseList.find((c) => sameCountry(c.name, partner.name));
        if (!found) {
          baseList.push(partner);
        } else if (!found.home_region || found.home_region === 'GLOBAL') {
          found.home_region = 'ASEAN+3';
        }
      }
    }
    // Always sort country list alphabetically by country name (e.g. Brunei, Cambodia, China, Indonesia, ...)
    return [...baseList].sort((a, b) => a.name.localeCompare(b.name));
  }, [masterCountries, selectedRegion, regionOptions, EAST_ASIA_3_PARTNERS]);

  const storedCountryValue = (name: string) => {
    const key = name.trim().toLowerCase();
    if (key.includes('brunei')) return 'Brunei';
    if (key === 'lao pdr' || key === 'laos' || key === 'lao') return 'Laos';
    if (key === 'viet nam' || key === 'vietnam') return 'Vietnam';
    if (key === 'china' || key === 'tiongkok') return 'China';
    if (key === 'japan' || key === 'jepang') return 'Japan';
    if (key === 'south korea' || key === 'korea' || key === 'republic of korea' || key === 'korea selatan') return 'South Korea';
    return name;
  };

  const countrySelectValue = useMemo(() => {
    if (selectedCountry === 'all') return 'all';
    const match = countryChoices.find((country) => sameCountry(country.name, selectedCountry));
    return storedCountryValue(match?.name || selectedCountry);
  }, [countryChoices, selectedCountry]);

  useEffect(() => {
    if (availableDiseases && availableDiseases.length > 0) {
      setMasterDiseases(availableDiseases);
    } else {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      fetch(((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/v1/disease-concepts?per_page=100'))
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data && Array.isArray(json.data)) {
            const names = json.data
              .filter((c: any) => c.is_active && c.canonical_name && !c.canonical_name.toLowerCase().includes('unknown'))
              .map((c: any) => c.canonical_name);
            setMasterDiseases(names);
          }
        })
        .catch(() => {});
    }
  }, [availableDiseases]);

  const diseaseOptions = useMemo(() => {
    const list = masterDiseases
      .filter((d) => d && d.trim() && !d.toUpperCase().startsWith('UNKNOWN') && !d.toUpperCase().startsWith('NEGATIVE'))
      .map((d) => d.trim());
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
  }, [masterDiseases]);

  // Multi-select helpers for diseases
  const selectedDiseases = useMemo(() => {
    if (draft.diseases && draft.diseases.length > 0) {
      return draft.diseases.filter((d) => d && d !== 'all');
    }
    if (draft.disease && draft.disease !== 'all') {
      return draft.disease.split(',').map((d) => d.trim()).filter(Boolean);
    }
    return [];
  }, [draft.diseases, draft.disease]);

  const toggleDisease = (dis: string) => {
    const exists = selectedDiseases.some((d) => d.toLowerCase() === dis.toLowerCase());
    const next = exists
      ? selectedDiseases.filter((d) => d.toLowerCase() !== dis.toLowerCase())
      : [...selectedDiseases, dis];
    setDraft((prev) => ({
      ...prev,
      diseases: next,
      disease: next.length === 1 ? next[0] : (next.length === 0 ? 'all' : next.join(',')),
    }));
  };

  const selectAllDiseases = () => {
    setDraft((prev) => ({
      ...prev,
      diseases: [...diseaseOptions],
      disease: diseaseOptions.join(','),
    }));
  };

  const clearAllDiseases = () => {
    setDraft((prev) => ({
      ...prev,
      diseases: [],
      disease: 'all',
    }));
  };

  const filteredDiseaseOptions = useMemo(() => {
    if (!diseaseSearch.trim()) return diseaseOptions;
    const q = diseaseSearch.toLowerCase().trim();
    return diseaseOptions.filter((d) => d.toLowerCase().includes(q));
  }, [diseaseOptions, diseaseSearch]);

  // Multi-select helpers for locations / countries
  const selectedCountries = useMemo(() => {
    if (draft.countries && draft.countries.length > 0) {
      return draft.countries.filter((c) => c && c !== 'all' && c !== 'ASEAN' && c !== 'global');
    }
    if (draft.country && draft.country !== 'all' && draft.country !== 'ASEAN' && draft.country !== 'global') {
      return draft.country.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return [];
  }, [draft.countries, draft.country]);

  const toggleCountry = (countryName: string) => {
    const val = storedCountryValue(countryName);
    const exists = selectedCountries.some((c) => sameCountry(c, val));
    const next = exists
      ? selectedCountries.filter((c) => !sameCountry(c, val))
      : [...selectedCountries, val];
    setDraft((prev) => ({
      ...prev,
      countries: next,
      country: next.length === 1 ? next[0] : (next.length === 0 ? selectedRegion : next.join(',')),
    }));
  };

  const selectAllCountries = () => {
    const all = countryChoices.map((c) => storedCountryValue(c.name));
    setDraft((prev) => ({
      ...prev,
      countries: Array.from(new Set(all)),
      country: selectedRegion,
    }));
  };

  const clearAllCountries = () => {
    setDraft((prev) => ({
      ...prev,
      countries: [],
      country: selectedRegion,
    }));
  };

  const filteredCountryChoices = useMemo(() => {
    if (!countrySearch.trim()) return countryChoices;
    const q = countrySearch.toLowerCase().trim();
    return countryChoices.filter((c) => c.name.toLowerCase().includes(q));
  }, [countryChoices, countrySearch]);

  return (
    <section ref={filterBarRef} className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all relative">
      {/* Top Header & Context Description */}
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-[#0060A9]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0060A9]">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Integrated Epidemiological Surveillance Filter
              </h2>
            </div>
            <p className="text-[11px] text-slate-500">
              {prototypeMode
                ? 'Multi-select disease, region scope, multi-select location, and date range picker (default 1 bulan)'
                : 'Select disease, region scope, specific country, and MMWR Epidemiological Week range (Sunday–Saturday)'}
            </p>
          </div>
        </div>

        {/* Current Active Range Human-Readable Badge (Solid, Anti-Slop) */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
            <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
            <span className="font-extrabold text-[11px] text-[#0060A9]">
              {prototypeMode && draft.startDate && draft.endDate
                ? formatFilterDateText(draft.startDate, draft.endDate, dateLocale)
                : formatEpiRangeDescription(
                    draft.startYear,
                    draft.startWeek,
                    draft.endYear,
                    draft.endWeek,
                    dateLocale
                  )}
            </span>
            <span className="ml-1 rounded-md bg-[#0060A9] px-1.5 py-0.5 text-[9.5px] font-bold text-white">
              {prototypeMode ? `${dateDiffDays} Hari` : `${totalWeeksSpanned} Wk`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Filter Form Inputs */}
      <form onSubmit={handleApply} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* 1. Diseases Filter */}
          <div className={`${prototypeMode ? 'lg:col-span-3' : 'lg:col-span-2'} flex flex-col gap-1 relative`}>
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Bug className="h-3 w-3 text-red-500" />
                {prototypeMode ? 'Disease (Multi-Select)' : 'Disease'}
              </span>
              {prototypeMode && selectedDiseases.length > 0 && (
                <span className="text-[9.5px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded-md">
                  {selectedDiseases.length} dipilih
                </span>
              )}
            </label>

            {prototypeMode ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'disease' ? null : 'disease'))}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100 transition px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer text-left"
                >
                  <span className="truncate pr-2">
                    {selectedDiseases.length === 0
                      ? 'All Diseases'
                      : selectedDiseases.length === 1
                      ? selectedDiseases[0]
                      : `${selectedDiseases.length} Diseases (${selectedDiseases.slice(0, 2).join(', ')}${selectedDiseases.length > 2 ? '...' : ''})`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedDiseases.length > 0 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAllDiseases();
                        }}
                        title="Clear selections"
                        className="rounded-full hover:bg-slate-200 p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${openDropdown === 'disease' ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {openDropdown === 'disease' && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search disease..."
                        value={diseaseSearch}
                        onChange={(e) => setDiseaseSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-0.5 text-[11px]">
                      <span className="font-bold text-slate-500">
                        {selectedDiseases.length} of {diseaseOptions.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllDiseases}
                          className="font-black text-[#0060A9] hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearAllDiseases}
                          className="font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 max-h-52 overflow-y-auto space-y-0.5 pr-1">
                      {filteredDiseaseOptions.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">No diseases found</p>
                      ) : (
                        filteredDiseaseOptions.map((dis) => {
                          const isChecked = selectedDiseases.some((d) => d.toLowerCase() === dis.toLowerCase());
                          return (
                            <label
                              key={dis}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer transition ${
                                isChecked ? 'bg-blue-50 text-[#0060A9] font-bold' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleDisease(dis)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-blue-100 cursor-pointer"
                              />
                              <span className="truncate flex-1">{dis}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(null)}
                      className="mt-2 w-full rounded-xl bg-[#0060A9] py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#004e8a] transition"
                    >
                      Done
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 px-1 mt-1 truncate">
                  {selectedDiseases.length === 0
                    ? 'All classifications'
                    : `Selected: ${selectedDiseases.join(', ')}`}
                </p>
              </div>
            ) : (
              <div>
                <div className="relative rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                  <select
                    id="select-disease"
                    value={draft.disease}
                    onChange={(e) => setDraft({ ...draft, disease: e.target.value })}
                    className="w-full appearance-none bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8"
                  >
                    <option value="all">All Diseases</option>
                    {diseaseOptions.map((dis) => (
                      <option key={dis} value={dis}>
                        {dis}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="text-[10px] text-slate-500 px-1 truncate">
                  {draft.disease === 'all'
                    ? 'All classifications'
                    : `Selected: ${draft.disease}`}
                </p>
              </div>
            )}
          </div>

          {/* 2. Region / Scope (2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label htmlFor="select-region" className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
              <Globe2 className="h-3 w-3 text-[#0060A9]" />
              Region / Scope
            </label>
            <div className="relative rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
              <select
                id="select-region"
                value={selectedRegion}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="w-full appearance-none bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8"
              >
                {regionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500 px-1 truncate">
              {selectedRegion === 'global'
                ? 'Global surveillance'
                : `${selectedRegionLabel} regional scope`}
            </p>
          </div>

          {/* 3. Location / Country Filter */}
          <div className={`${prototypeMode ? 'lg:col-span-3' : 'lg:col-span-2'} flex flex-col gap-1 relative`}>
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-emerald-600" />
                {prototypeMode ? 'Location (Multi-Select)' : 'Country Filter'}
              </span>
              {prototypeMode && selectedCountries.length > 0 && (
                <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md">
                  {selectedCountries.length} dipilih
                </span>
              )}
            </label>

            {prototypeMode ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown((prev) => (prev === 'country' ? null : 'country'))}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100 transition px-3 py-2 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer text-left"
                >
                  <span className="truncate pr-2">
                    {selectedCountries.length === 0
                      ? `All Countries (${selectedRegionLabel})`
                      : selectedCountries.length === 1
                      ? selectedCountries[0]
                      : `${selectedCountries.length} Locations (${selectedCountries.slice(0, 2).join(', ')}${selectedCountries.length > 2 ? '...' : ''})`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedCountries.length > 0 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAllCountries();
                        }}
                        title="Clear selections"
                        className="rounded-full hover:bg-slate-200 p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${openDropdown === 'country' ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {openDropdown === 'country' && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search country..."
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white"
                      />
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-0.5 text-[11px]">
                      <span className="font-bold text-slate-500">
                        {selectedCountries.length} of {countryChoices.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllCountries}
                          className="font-black text-emerald-600 hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearAllCountries}
                          className="font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 max-h-52 overflow-y-auto space-y-0.5 pr-1">
                      {filteredCountryChoices.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">No countries found</p>
                      ) : selectedRegion !== 'global' ? (
                        <div className="mb-2">
                          {filteredCountryChoices.map((country) => {
                            const storedVal = storedCountryValue(country.name);
                            const isChecked = selectedCountries.some((c) => sameCountry(c, storedVal));
                            return (
                              <label
                                key={country.iso3 || country.name}
                                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition ${
                                  isChecked ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleCountry(country.name)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-100 cursor-pointer"
                                />
                                <span className="truncate flex-1">{country.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        (['ASEAN', 'ASEAN+3', 'GLOBAL'] as const).map((group) => {
                          const rows = filteredCountryChoices
                            .filter((country) => (country.home_region || 'GLOBAL') === group)
                            .sort((a, b) => a.name.localeCompare(b.name));
                          if (!rows.length) return null;
                          return (
                            <div key={group} className="mb-2">
                              <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {group === 'ASEAN+3' ? 'ASEAN+3' : group === 'GLOBAL' ? 'Global' : 'ASEAN'}
                              </p>
                              {rows.map((country) => {
                                const storedVal = storedCountryValue(country.name);
                                const isChecked = selectedCountries.some((c) => sameCountry(c, storedVal));
                                return (
                                  <label
                                    key={country.iso3 || country.name}
                                    className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer transition ${
                                      isChecked ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleCountry(country.name)}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-100 cursor-pointer"
                                    />
                                    <span className="truncate flex-1">{country.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(null)}
                      className="mt-2 w-full rounded-xl bg-emerald-600 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      Done
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 px-1 mt-1 truncate">
                  {selectedCountries.length === 0
                    ? `All countries in ${selectedRegionLabel}`
                    : `Filtered: ${selectedCountries.join(', ')}`}
                </p>
              </div>
            ) : (
              <div>
                <div className="relative rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                  <select
                    id="select-country"
                    value={countrySelectValue}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full appearance-none bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8"
                  >
                    <option value="all">
                      {`All Countries (${selectedRegionLabel})`}
                    </option>
                    {selectedRegion !== 'global' ? (
                      countryChoices.map((country) => (
                        <option key={country.iso3 || country.name} value={storedCountryValue(country.name)}>
                          {country.name}
                        </option>
                      ))
                    ) : (
                      (['ASEAN', 'ASEAN+3', 'GLOBAL'] as const).map((group) => {
                        const rows = countryChoices
                          .filter((country) => (country.home_region || 'GLOBAL') === group)
                          .sort((a, b) => a.name.localeCompare(b.name));
                        if (!rows.length) return null;
                        return (
                          <optgroup key={group} label={group === 'ASEAN+3' ? 'ASEAN+3' : group === 'GLOBAL' ? 'Global' : 'ASEAN'}>
                            {rows.map((country) => (
                              <option key={country.iso3 || country.name} value={storedCountryValue(country.name)}>
                                {country.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })
                    )}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                </div>
                <p className="text-[10px] text-slate-500 px-1 truncate">
                  {selectedCountry === 'all'
                    ? (selectedRegion === 'global' ? 'All countries included' : `All ${countryChoices.length} ${selectedRegionLabel} members`)
                    : `Filtered: ${selectedCountry}`}
                </p>
              </div>
            )}
          </div>

          {/* 4 & 5. Date Filter: in prototypeMode replace with Date Picker (default 1 month) */}
          {prototypeMode ? (
            <div className="lg:col-span-2 flex flex-col gap-1">
              <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <CalendarDays className="h-3 w-3 text-[#0060A9]" />
                Date Range
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  aria-label="Start Date"
                  value={draft.startDate || ''}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white focus:ring-1 focus:ring-blue-100 transition cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-400">–</span>
                <input
                  type="date"
                  aria-label="End Date"
                  value={draft.endDate || ''}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white focus:ring-1 focus:ring-blue-100 transition cursor-pointer"
                />
              </div>
            </div>
          ) : (
            <>
              {/* 4. Start MMWR epi-week & year (2 cols) */}
              <div className="lg:col-span-2 flex flex-col gap-1">
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-emerald-600" />
                  Start: Week & Year
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                    <select
                      id="select-start-week"
                      aria-label="Start week"
                      value={draft.startWeek}
                      onChange={(e) => setDraft({ ...draft, startWeek: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {startWeeksList.map((w) => (
                        <option key={w} value={w}>
                          W{w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="relative w-20 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                    <select
                      id="select-start-year"
                      aria-label="Start year"
                      value={draft.startYear}
                      onChange={(e) => setDraft({ ...draft, startYear: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {availableYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[9.5px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5 mt-0.5 truncate">
                  📅 {startRange.startFormatted}
                </p>
              </div>

              {/* 5. End MMWR epi-week & year (2 cols) */}
              <div className="lg:col-span-2 flex flex-col gap-1">
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-blue-600" />
                  End: Week & Year
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                    <select
                      id="select-end-week"
                      aria-label="End week"
                      value={draft.endWeek}
                      onChange={(e) => setDraft({ ...draft, endWeek: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {endWeeksList.map((w) => (
                        <option key={w} value={w}>
                          W{w}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="relative w-20 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                    <select
                      id="select-end-year"
                      aria-label="End year"
                      value={draft.endYear}
                      onChange={(e) => setDraft({ ...draft, endYear: Number(e.target.value) })}
                      className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    >
                      {availableYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[9.5px] font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-1.5 py-0.5 mt-0.5 truncate">
                  📅 {endRange.endFormatted}
                </p>
              </div>
            </>
          )}

          {/* 6. Action Buttons: Apply & Reset (Solid, Anti-Slop, 2 cols) */}
          <div className="lg:col-span-2 flex items-end gap-1.5 pb-0.5">
            <button
              type="submit"
              id="btn-apply-filter"
              disabled={isLoading || hasInvalidRange}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0060A9] hover:bg-[#004e8a] active:bg-[#003c6b] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white border border-[#004e8a] shadow-xs transition active:scale-98 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Apply</span>
                </>
              )}
            </button>
            <button
              type="button"
              id="btn-reset-filter"
              onClick={handleReset}
              title="Reset to default"
              aria-label="Reset filter"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition active:scale-98 shadow-xs cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Error alert if start is after end */}
        {hasInvalidRange && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {prototypeMode
                ? 'Invalid date range: Start date must be earlier than or equal to End date.'
                : 'Invalid week range: the start week must be earlier than or equal to the end week.'}
            </span>
          </div>
        )}
      </form>
    </section>
  );
}

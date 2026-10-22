'use client'
// PR 018: /penyakit = disease summary cards (mockup #s1 "Ringkasan per penyakit"), one per registry disease
// (/api/v1/analytics/summary), following the global filter bar (Sumber, Penyakit, Provinsi, Kab/Kota, Periode).
// Search and category chips narrow the list on the client. Each card links to /penyakit/[kode].
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import SearchInput from '@/components/SearchInput'
import SkdrFilterBar, { type SkdrFilterState } from '@/components/SkdrFilterBar'
import { Empty } from '@/components/analytics/SourceBadge'
import { useEpiRange } from '@/components/analytics/EpiRangePicker'
import DiseaseCard, { diseaseActive } from '@/components/dashboard/DiseaseCard'
import type { SummaryDisease } from '@/components/dashboard/DiseaseTable'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch } from '@/lib/pe-api'
import { qs } from '@/lib/analytics-api'
import { useSumber } from '@/lib/use-sumber'
import { geoParams, useGeoFilter } from '@/lib/use-geo-filter'
import { ErrorState, SkeletonCards } from '@/components/ui/Skeleton'

export default function PenyakitPage() {
  const { t } = useTranslation()
  const { sumber, setSumber, ready: sReady } = useSumber()
  const { range, setRange, ready: rReady } = useEpiRange()
  const { geo, setGeo, ready: gReady } = useGeoFilter()
  const ready = sReady && rReady && gReady
  const [rows, setRows] = useState<SummaryDisease[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  // PR 016: Beranda search falls back to /penyakit?q=…
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v) }, [])
  const [cat, setCat] = useState('all')
  const [tick, setTick] = useState(0)
  const query = useMemo(() => qs({ source: sumber, ...geoParams(geo), start_year: range.startYear, start_week: range.startWeek, end_year: range.endYear, end_week: range.endWeek }), [sumber, geo, range])
  useEffect(() => {
    if (!ready) return
    let a = true
    setErr(''); setRows(null)
    peFetch<{ data: { diseases: SummaryDisease[] } }>(`/api/v1/analytics/summary?${query}`).then((j) => a && setRows(j.data.diseases)).catch((e) => a && setErr(e.message))
    return () => { a = false }
  }, [query, ready, tick])
  const barValue: SkdrFilterState = useMemo(() => ({ ...geo, source: sumber, ...range }), [geo, sumber, range])

  const groups = useMemo(() => Array.from(new Set((rows || []).map((r) => (r.category || '').split('/')[0].trim()).filter(Boolean))).sort(), [rows])
  const list = useMemo(() => {
    const sel = new Set(geo.diseases.map((d) => d.toLowerCase()))
    const s = q.trim().toLowerCase()
    return (rows || []).filter((r) => {
      const okD = !sel.size || sel.has(r.code.toLowerCase())
      const okQ = !s || [r.name, r.code, r.category].some((x) => (x || '').toLowerCase().includes(s))
      return okD && okQ && (cat === 'all' || (r.category || '').startsWith(cat))
    }).sort((a, b) => Number(diseaseActive(b, sumber)) - Number(diseaseActive(a, sumber)) || a.name.localeCompare(b.name, 'id'))
  }, [rows, geo.diseases, q, cat, sumber])

  return (
    <div className="w-full space-y-5 bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('skdr.penyakit.title')} subtitle={t('skdr.penyakit.subtitleSummary')} />
      <SkdrFilterBar compact value={barValue} sumber={sumber} onSumberChange={setSumber} onChange={() => {}} isLoading={!rows && !err}
        onApply={(f) => { setGeo({ diseases: f.diseases, provinceIds: f.provinceIds, kabkotaIds: f.kabkotaIds, units: f.units || [] }); setRange({ startYear: f.startYear, startWeek: f.startWeek, endYear: f.endYear, endWeek: f.endWeek }) }} />
      <div className="flex flex-wrap items-center gap-3 border-b skdr-rule pb-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <SearchInput value={q} onChange={setQ} placeholder={t('skdr.penyakit.searchPh')} />
        </div>
        <div className="flex flex-wrap gap-1">
          {['all', ...groups].map((g) => (
            <button key={g} onClick={() => setCat(g)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${cat === g ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {g === 'all' ? t('skdr.penyakit.allCategories') : g}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">{t('skdr.penyakit.count', { n: list.length })}</span>
      </div>
      {err ? <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} /> : null}
      {!rows && !err ? <SkeletonCards /> : null}
      {rows && !list.length ? <Empty>{t('skdr.penyakit.empty')}</Empty> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="disease-grid">
        {list.map((r) => <DiseaseCard key={r.id} r={r} sumber={sumber} />)}
      </div>
    </div>
  )
}

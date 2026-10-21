'use client'
// PR 012: menu "Penyakit" — grid of active master diseases (category badge, ICD-10, name, description), styled after
// globalinfectiousdisease.com/diseases. Content comes from master_diseases (editable in Master Data > Data Penyakit).
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import SearchInput from '@/components/SearchInput'
import { Empty, SourceKey } from '@/components/analytics/SourceBadge'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch } from '@/lib/pe-api'
import { fmt, type DiseaseInfo } from '@/lib/analytics-api'
import { ErrorState, SkeletonCards } from '@/components/ui/Skeleton'

const CAT_TONE = ['bg-sky-50 text-sky-700 border-sky-200', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-violet-50 text-violet-700 border-violet-200',
  'bg-amber-50 text-amber-700 border-amber-200', 'bg-rose-50 text-rose-700 border-rose-200', 'bg-teal-50 text-teal-700 border-teal-200', 'bg-slate-50 text-slate-600 border-slate-200']
const tone = (c: string) => CAT_TONE[[...c].reduce((a, ch) => a + ch.charCodeAt(0), 0) % CAT_TONE.length]

export default function PenyakitPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<DiseaseInfo[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  // PR 016: Beranda search falls back to /penyakit?q=…
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('q'); if (v) setQ(v) }, [])
  const [cat, setCat] = useState('all')
  const [tick, setTick] = useState(0)
  useEffect(() => { setErr(''); peFetch<{ data: DiseaseInfo[] }>('/api/v1/analytics/diseases').then((j) => setRows(j.data)).catch((e) => setErr(e.message)) }, [tick])
  const groups = useMemo(() => Array.from(new Set((rows || []).map((r) => (r.category || '').split('/')[0].trim()).filter(Boolean))).sort(), [rows])
  const list = (rows || []).filter((r) => {
    const s = q.trim().toLowerCase()
    const okQ = !s || [r.name, r.english_name, r.code, r.icd10, r.category].some((x) => (x || '').toLowerCase().includes(s))
    return okQ && (cat === 'all' || (r.category || '').startsWith(cat))
  })
  return (
    <div className="w-full space-y-5 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('skdr.penyakit.title')} subtitle={t('skdr.penyakit.subtitle')} />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
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
        {list.map((r) => (
          <Link key={r.id} href={`/penyakit/${r.code.toLowerCase()}`} data-testid="disease-card"
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              {r.category ? <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone(r.category)}`}>{r.category}</span> : <span />}
              {r.icd10 ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600" title="ICD-10">ICD-10 {r.icd10}</span> : null}
            </div>
            <h2 className="mt-3 text-base font-black text-slate-900 group-hover:text-primary">{r.name}</h2>
            {r.english_name ? <div className="text-[11px] italic text-slate-400">{r.english_name}</div> : null}
            <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-600">{r.description || t('skdr.penyakit.noDescription')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
              <SourceKey source="ebs" label={`${fmt(r.ebs_alerts ?? 0)} ${t('skdr.penyakit.alerts')}`} />
              <SourceKey source="pe" label={`${fmt(r.pe_cases ?? 0)} ${t('skdr.penyakit.cases')}`} />
              {r.is_zoonotic ? <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t('skdr.penyakit.zoonotic')}</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

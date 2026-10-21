'use client'
// PR 012: Dokumentasi — Alur Bisnis (mermaid), Glosarium, Status Indikator (moved from the main dashboard; data from
// app_settings.dashboard_executive), Sumber Data & Aturan, Panduan Form PE. Text lives in public/docs/dokumentasi/*.md.
import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import Markdown from '@/components/docs/Markdown'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { peFetch } from '@/lib/pe-api'

const TABS = [
  { id: 'alur', file: 'alur-bisnis.md' },
  { id: 'glosarium', file: 'glosarium.md' },
  { id: 'indikator', file: null },
  { id: 'aturan', file: 'sumber-data.md' },
  { id: 'panduan', file: 'panduan-pe.md' },
] as const
type Indicator = { no: string; name: string; status: string; note: string }
const IND_TONE: Record<string, string> = { tersedia: 'bg-emerald-50 text-emerald-700', sebagian: 'bg-amber-50 text-amber-700', tertunda: 'bg-slate-100 text-slate-600' }

function Indicators() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Indicator[] | null>(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState('all')
  useEffect(() => { peFetch<{ data: { config: { indicators: Indicator[] } } }>('/api/v1/dashboard/executive').then((j) => setRows(j.data.config.indicators || [])).catch((e) => setErr(e.message)) }, [])
  if (err) return <p className="text-sm text-red-600">{t('skdr.docs.loadFailed')}: {err}</p>
  if (!rows) return <p className="text-sm text-[#0060A9]">{t('skdr.docs.loading')}</p>
  const counts = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {})
  const list = rows.filter((r) => f === 'all' || r.status === f)
  return (
    <div data-testid="indicator-table">
      <p className="mb-3 text-sm text-slate-700">{t('skdr.docs.indicatorIntro')}</p>
      <div className="mb-3 flex flex-wrap gap-1" role="radiogroup" aria-label={t('skdr.docs.statusFilter')}>
        {['all', 'tersedia', 'sebagian', 'tertunda'].map((s) => (
          <button key={s} role="radio" aria-checked={f === s} onClick={() => setF(s)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${f === s ? 'border-[#0060A9] bg-[#0060A9] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {t(`skdr.docs.status.${s}`)} {s === 'all' ? rows.length : counts[s] || 0}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">{t('skdr.docs.colNo')}</th><th className="px-3 py-2">{t('skdr.docs.colName')}</th><th className="px-3 py-2">{t('skdr.docs.colStatus')}</th><th className="px-3 py-2">{t('skdr.docs.colNote')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((i, k) => (
              <tr key={k} className="align-top"><td className="w-28 px-3 py-2 font-mono text-slate-500">{i.no}</td><td className="px-3 py-2 text-slate-800">{i.name}</td>
                <td className="w-28 px-3 py-2"><span className={`rounded px-1.5 py-0.5 font-semibold ${IND_TONE[i.status] || ''}`}>{t(`skdr.docs.status.${i.status}`)}</span></td><td className="px-3 py-2 text-slate-500">{i.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DokumentasiPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('alur')
  const [md, setMd] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if (TABS.some((x) => x.id === h)) setTab(h as any)
  }, [])
  const cur = TABS.find((x) => x.id === tab)!
  useEffect(() => {
    if (!cur.file || md[cur.file]) return
    setErr('')
    fetch(`${PUBLIC_BASE_PATH}/docs/dokumentasi/${cur.file}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((txt) => setMd((m) => ({ ...m, [cur.file!]: txt }))).catch((e) => setErr(e.message))
  }, [cur.file]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="w-full space-y-5 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={t('skdr.docs.title')} subtitle={t('skdr.docs.subtitle')} />
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); history.replaceState(null, '', `#${x.id}`) }}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-xs font-bold uppercase tracking-wider ${tab === x.id ? 'border-[#0060A9] text-[#0060A9]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t(`skdr.docs.tab.${x.id}`)}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" role="tabpanel" data-testid={`doc-${tab}`}>
        {cur.file ? (err ? <p className="text-sm text-red-600">{t('skdr.docs.loadFailed')}: {err}</p> : md[cur.file] ? <Markdown text={md[cur.file]} /> : <p className="text-sm text-[#0060A9]">{t('skdr.docs.loading')}</p>) : <Indicators />}
      </section>
    </div>
  )
}

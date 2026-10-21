'use client'
// PR 005: Sinkronisasi EBS (SKDR Kemenkes API) — status, log, "Sinkron sekarang", pemetaan diagnosa -> master penyakit.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { masterSend } from '@/lib/skdr-master-api'
import { tableHeadCls, thCls } from '@/components/master/MasterUi'
import SearchInput from '@/components/SearchInput'

interface SyncLog { id: number; trigger: string; years: string; status: string; started_at: string | null; finished_at: string | null
  pages: number; rows_fetched: number; rows_upserted: number; retries: number; error: string | null }
interface EbsStatus {
  running: boolean; key_configured: boolean
  config: { enabled: boolean; api_url: string; years: number[]; interval_minutes: number; page_size: number; max_retries: number } | null
  totals: { rows: number; with_province: number; with_kabkota: number; with_disease: number; with_coordinates: number; cases: number; first_date: string | null; last_date: string | null }
  per_year: { year: number; rows: number }[]
  logs: SyncLog[]
}
interface Diagnosa { id: number; diagnosa: string; disease_id: number | null; disease_name: string | null; match_source: string | null; reports: number; cases: number }
interface Disease { id: number; name: string }

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${PUBLIC_BASE_PATH}${path}`, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok || j.success === false) throw new Error(j.error || `HTTP ${r.status}`)
  return j.data as T
}
const nf = (n: number) => n.toLocaleString('id-ID')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—')

export default function EbsSyncPage() {
  const { t } = useTranslation()
  const [st, setSt] = useState<EbsStatus | null>(null)
  const [diag, setDiag] = useState<Diagnosa[]>([])
  const [diseases, setDiseases] = useState<Disease[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, ds] = await Promise.all([
        get<EbsStatus>('/api/v1/admin/ebs/status'), get<Diagnosa[]>('/api/v1/admin/ebs/diagnosa'), get<Disease[]>('/api/v1/master/diseases'),
      ])
      setSt(s); setDiag(d); setDiseases(ds)
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!st?.running) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [st?.running, load])

  const syncNow = async () => {
    try {
      await masterSend('POST', '/api/v1/admin/ebs/sync', {})
      toast.success(t('skdr.ebs.started'))
      setTimeout(load, 1500)
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  const mapDiag = async (d: Diagnosa, diseaseId: string) => {
    try {
      await masterSend('PUT', `/api/v1/admin/ebs/diagnosa/${d.id}`, { disease_id: diseaseId ? Number(diseaseId) : null })
      toast.success(t('skdr.ebs.mapSaved', { name: d.diagnosa }))
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  const rows = useMemo(() => diag.filter((d) => (!onlyUnmapped || !d.disease_id) && d.diagnosa.toLowerCase().includes(search.toLowerCase())), [diag, search, onlyUnmapped])
  const mappedReports = diag.filter((d) => d.disease_id).reduce((s, d) => s + d.reports, 0)
  const tot = st?.totals
  const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-xs'
  const statusBadge = (s: string) =>
    s === 'sukses' ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{t('skdr.ebs.statusOk')}</span>
      : s === 'gagal' ? <span className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"><XCircle className="h-3 w-3" />{t('skdr.ebs.statusFail')}</span>
      : <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0060A9]"><Loader2 className="h-3 w-3 animate-spin" />{t('skdr.ebs.statusRunning')}</span>

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('skdr.ebs.title')}</h1>
            <p className="text-xs text-slate-500">{t('skdr.ebs.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('skdr.master.refresh')}
          </button>
          <button onClick={syncNow} disabled={!!st?.running || !st?.key_configured}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-[#004b85] disabled:opacity-50">
            {st?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} {st?.running ? t('skdr.ebs.running') : t('skdr.ebs.syncNow')}
          </button>
        </div>
      </div>

      {st && !st.key_configured && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{t('skdr.ebs.noKey')}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.ebs.rows')}</p><p className="mt-1 text-2xl font-bold text-[#0060A9]">{nf(tot?.rows ?? 0)}</p>
          <p className="text-[11px] text-slate-400">{tot?.first_date ?? '—'} s.d. {tot?.last_date ?? '—'}</p></div>
        <div className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.ebs.cases')}</p><p className="mt-1 text-2xl font-bold text-slate-800">{nf(tot?.cases ?? 0)}</p>
          <p className="text-[11px] text-slate-400">{(st?.per_year || []).map((y) => `${y.year}: ${nf(y.rows)}`).join(' · ')}</p></div>
        <div className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.ebs.withKabkota')}</p><p className="mt-1 text-2xl font-bold text-slate-800">{pct(tot?.with_kabkota ?? 0, tot?.rows ?? 0)}</p>
          <p className="text-[11px] text-slate-400">{t('skdr.ebs.withProvince')}: {pct(tot?.with_province ?? 0, tot?.rows ?? 0)}</p></div>
        <div className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.ebs.withDisease')}</p><p className="mt-1 text-2xl font-bold text-slate-800">{pct(tot?.with_disease ?? 0, tot?.rows ?? 0)}</p>
          <p className="text-[11px] text-slate-400">{t('skdr.ebs.diagMapped', { mapped: diag.filter((d) => d.disease_id).length, total: diag.length })}</p></div>
        <div className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.ebs.config')}</p>
          <p className="mt-1 text-xs text-slate-700">{st?.config ? t('skdr.ebs.configText', { years: st.config.years.join(', '), interval: st.config.interval_minutes, size: st.config.page_size, retries: st.config.max_retries }) : '—'}</p>
          <p className="text-[11px] text-slate-400">{st?.config?.enabled ? t('skdr.ebs.scheduleOn') : t('skdr.ebs.scheduleOff')}</p></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">{t('skdr.ebs.logTitle')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>#</th><th className={thCls}>{t('skdr.ebs.trigger')}</th><th className={thCls}>{t('skdr.ebs.years')}</th>
              <th className={thCls}>{t('skdr.ebs.start')}</th><th className={thCls}>{t('skdr.ebs.end')}</th>
              <th className={`${thCls} text-right`}>{t('skdr.ebs.pages')}</th><th className={`${thCls} text-right`}>{t('skdr.ebs.fetched')}</th>
              <th className={`${thCls} text-right`}>{t('skdr.ebs.upserted')}</th><th className={`${thCls} text-right`}>{t('skdr.ebs.retries')}</th>
              <th className={thCls}>{t('skdr.master.status')}</th><th className={thCls}>{t('skdr.ebs.error')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(st?.logs || []).length === 0 && <tr><td colSpan={11} className="p-8 text-center text-slate-400">{t('skdr.ebs.noLogs')}</td></tr>}
              {(st?.logs || []).map((l) => (
                <tr key={l.id} className="hover:bg-blue-50/30">
                  <td className="px-4 py-2 font-mono text-slate-500">{l.id}</td>
                  <td className="px-4 py-2">{l.trigger === 'manual' ? t('skdr.ebs.manual') : t('skdr.ebs.scheduled')}</td>
                  <td className="px-4 py-2 font-mono">{l.years}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{l.started_at} WIB</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{l.finished_at ? `${l.finished_at} WIB` : '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{nf(l.pages)}</td>
                  <td className="px-4 py-2 text-right font-mono">{nf(l.rows_fetched)}</td>
                  <td className="px-4 py-2 text-right font-mono">{nf(l.rows_upserted)}</td>
                  <td className="px-4 py-2 text-right font-mono">{l.retries}</td>
                  <td className="px-4 py-2">{statusBadge(l.status)}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-red-600" title={l.error || ''}>{l.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{t('skdr.ebs.mapTitle')}</span>
          <span className="text-[11px] text-slate-500">{t('skdr.ebs.mapCoverage', { reports: pct(mappedReports, diag.reduce((s, d) => s + d.reports, 0)) })}</span>
          <div className="relative ml-auto w-full max-w-xs"><SearchInput value={search} onChange={setSearch} placeholder={t('skdr.ebs.mapSearch')} /></div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} /> {t('skdr.ebs.onlyUnmapped')}</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>{t('skdr.ebs.diagnosa')}</th><th className={`${thCls} text-right`}>{t('skdr.ebs.reports')}</th>
              <th className={`${thCls} text-right`}>{t('skdr.ebs.cases')}</th><th className={thCls}>{t('skdr.ebs.mappedTo')}</th><th className={thCls}>{t('skdr.ebs.matchSource')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">{t('skdr.master.empty')}</td></tr>}
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-blue-50/30">
                  <td className="px-4 py-2 font-medium text-slate-800">{d.diagnosa}</td>
                  <td className="px-4 py-2 text-right font-mono">{nf(d.reports)}</td>
                  <td className="px-4 py-2 text-right font-mono">{nf(d.cases)}</td>
                  <td className="px-4 py-2">
                    <select value={d.disease_id ?? ''} onChange={(e) => mapDiag(d, e.target.value)}
                      className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#0060A9] focus:outline-none">
                      <option value="">{t('skdr.ebs.unmapped')}</option>
                      {diseases.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{d.match_source ? t(`skdr.ebs.match.${d.match_source}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

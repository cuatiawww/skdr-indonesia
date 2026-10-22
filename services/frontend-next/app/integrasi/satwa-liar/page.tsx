'use client'
// PR 019: Sinkronisasi Satwa Liar GBIF — Pemantauan perjumpaan unggas & burung liar untuk kewaspadaan zoonosis flu burung
import PageHeader from '@/components/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Loader2, Bird } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { masterSend } from '@/lib/skdr-master-api'
import { tableHeadCls, thCls } from '@/components/master/MasterUi'
import SearchInput from '@/components/SearchInput'

interface SyncLog {
  id: number
  trigger: string
  status: string
  started_at: string | null
  finished_at: string | null
  items_fetched: number
  items_upserted: number
  duration_ms: number
  error: string | null
}

interface OccurrenceItem {
  species?: string | null
  genericName?: string | null
  scientificName?: string | null
  country?: string | null
  eventDate?: string | null
  decimalLatitude: number
  decimalLongitude: number
}

interface WildlifeStatus {
  running: boolean
  totals: {
    total_occurrences: number
    species_group: string
    country: string
    coordinate_rate: string
    source: string
  }
  occurrences: OccurrenceItem[]
  logs: SyncLog[]
}

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${PUBLIC_BASE_PATH}${path}`, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok || j.success === false) throw new Error(j.error || `HTTP ${r.status}`)
  return j.data as T
}

const nf = (n: number) => n.toLocaleString('id-ID')

export default function WildlifeSyncPage() {
  const { t } = useTranslation()
  const [st, setSt] = useState<WildlifeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<WildlifeStatus>('/api/v1/integrasi/satwa-liar/status')
      setSt(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const syncNow = async () => {
    setSyncing(true)
    try {
      await masterSend('POST', '/api/v1/integrasi/satwa-liar/sync', {})
      toast.success(t('skdr.wildlife.started'))
      setTimeout(load, 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const filteredOccurrences = useMemo(() => {
    const list = st?.occurrences || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (o) =>
        (o.species && o.species.toLowerCase().includes(q)) ||
        (o.scientificName && o.scientificName.toLowerCase().includes(q)) ||
        (o.genericName && o.genericName.toLowerCase().includes(q)) ||
        (o.eventDate && o.eventDate.includes(q))
    )
  }, [st?.occurrences, search])

  const card = 'skdr-card p-4'
  const statusBadge = (s: string) =>
    s === 'sukses' || s === 'aktif' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        {t('skdr.ebs.statusOk')}
      </span>
    ) : s === 'gagal' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
        <XCircle className="h-3 w-3" />
        {t('skdr.ebs.statusFail')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('skdr.ebs.statusRunning')}
      </span>
    )

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={t('skdr.eyebrow.wildlife')}
        title={t('skdr.wildlife.title')}
        subtitle={<>{t('skdr.wildlife.subtitle')}</>}
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('skdr.master.refresh')}
            </button>
            <button
              onClick={syncNow}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {syncing ? t('skdr.wildlife.running') : t('skdr.wildlife.syncNow')}
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.wildlife.occurrences')}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{nf(st?.totals.total_occurrences ?? 0)}</p>
          <p className="text-[11px] text-slate-400">Perjumpaan Terdata</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.wildlife.group')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.species_group ?? 'Aves (Burung / Unggas)'}</p>
          <p className="text-[11px] text-slate-400">ClassKey 212 GBIF Backbone</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.wildlife.country')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.country ?? 'Indonesia (ID)'}</p>
          <p className="text-[11px] text-slate-400">Cakupan Wilayah Nasional</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.wildlife.georeferenced')}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{st?.totals.coordinate_rate ?? '100% Georeferenced'}</p>
          <p className="text-[11px] text-slate-400">Koordinat Lintang & Bujur Valid</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.wildlife.source')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.source ?? 'GBIF Occurrence API'}</p>
          <p className="text-[11px] text-slate-400">Global Biodiversity Information</p>
        </div>
      </div>

      {/* Occurrences Preview Table */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="skdr-eyebrow">{t('skdr.eyebrow.wildlife')}</div>
            <h2 className="skdr-section-title">{t('skdr.wildlife.occurrencesTitle')}</h2>
          </div>
          <div className="w-full max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari nama spesies, genus, tanggal..." />
          </div>
        </div>

        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.wildlife.species')}</th>
                <th className={thCls}>{t('skdr.wildlife.genus')}</th>
                <th className={thCls}>{t('skdr.wildlife.coordinates')}</th>
                <th className={thCls}>{t('skdr.wildlife.date')}</th>
                <th className={thCls}>{t('skdr.wildlife.countryCol')}</th>
                <th className={thCls}>{t('skdr.master.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOccurrences.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400">
                    Tidak ada catatan perjumpaan satwa liar.
                  </td>
                </tr>
              ) : (
                filteredOccurrences.map((o, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                    <td className="p-3">
                      <p className="font-bold text-slate-800 italic">{o.species ?? o.genericName ?? 'Aves sp.'}</p>
                      {o.scientificName && (
                        <p className="text-[10px] text-slate-400 truncate max-w-xs">{o.scientificName}</p>
                      )}
                    </td>
                    <td className="p-3 font-mono text-slate-600">{o.genericName ?? '—'}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-600">
                      {o.decimalLatitude.toFixed(4)}, {o.decimalLongitude.toFixed(4)}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">{o.eventDate ?? '—'}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                        {o.country ?? 'ID'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Terverifikasi
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Log History Table */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head">
          <div className="skdr-eyebrow">{t('skdr.eyebrow.ebsLog')}</div>
          <h2 className="skdr-section-title">{t('skdr.wildlife.logTitle')}</h2>
        </div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.ebs.trigger')}</th>
                <th className={thCls}>{t('skdr.ebs.start')}</th>
                <th className={thCls}>{t('skdr.ebs.end')}</th>
                <th className={`${thCls} text-right`}>Data Diambil</th>
                <th className={`${thCls} text-right`}>Durasi (ms)</th>
                <th className={thCls}>{t('skdr.master.status')}</th>
                <th className={thCls}>{t('skdr.ebs.error')}</th>
              </tr>
            </thead>
            <tbody>
              {!st?.logs || st.logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    {t('skdr.ebs.noLogs')}
                  </td>
                </tr>
              ) : (
                st.logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 font-mono text-slate-400">{log.id}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {log.trigger === 'jadwal' ? t('skdr.ebs.scheduled') : t('skdr.ebs.manual')}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-600">{log.started_at ?? '—'}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-600">{log.finished_at ?? '—'}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">{nf(log.items_fetched)} catatan</td>
                    <td className="p-3 text-right font-mono text-slate-600">{log.duration_ms} ms</td>
                    <td className="p-3">{statusBadge(log.status)}</td>
                    <td className="p-3 text-red-600 text-[11px]">{log.error ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

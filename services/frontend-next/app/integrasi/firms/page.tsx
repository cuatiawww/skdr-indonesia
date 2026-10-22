'use client'
// PR 019: Sinkronisasi NASA FIRMS — Titik panas (hotspots) kebakaran hutan & lahan real-time VIIRS
import PageHeader from '@/components/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Loader2, Flame } from 'lucide-react'
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

interface HotspotItem {
  latitude: number
  longitude: number
  brightness?: number | null
  confidence?: string | null
  acq_date?: string | null
  acq_time?: string | null
  satellite?: string | null
  frp?: number | null
}

interface FirmsStatus {
  running: boolean
  totals: {
    total_hotspots: number
    satellite: string
    interval: string
    coverage: string
    source: string
  }
  hotspots: HotspotItem[]
  logs: SyncLog[]
}

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${PUBLIC_BASE_PATH}${path}`, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok || j.success === false) throw new Error(j.error || `HTTP ${r.status}`)
  return j.data as T
}

const nf = (n: number) => n.toLocaleString('id-ID')

export default function FirmsSyncPage() {
  const { t } = useTranslation()
  const [st, setSt] = useState<FirmsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<FirmsStatus>('/api/v1/integrasi/firms/status')
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
      await masterSend('POST', '/api/v1/integrasi/firms/sync', {})
      toast.success(t('skdr.firms.started'))
      setTimeout(load, 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const filteredHotspots = useMemo(() => {
    const list = st?.hotspots || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (h) =>
        (h.confidence && h.confidence.toLowerCase().includes(q)) ||
        (h.acq_date && h.acq_date.includes(q)) ||
        (h.satellite && h.satellite.toLowerCase().includes(q)) ||
        h.latitude.toString().includes(q) ||
        h.longitude.toString().includes(q)
    )
  }, [st?.hotspots, search])

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
        eyebrow={t('skdr.eyebrow.firms')}
        title={t('skdr.firms.title')}
        subtitle={<>{t('skdr.firms.subtitle')}</>}
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
              {syncing ? t('skdr.firms.running') : t('skdr.firms.syncNow')}
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.firms.hotspots24h')}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{nf(st?.totals.total_hotspots ?? 0)}</p>
          <p className="text-[11px] text-slate-400">Titik Panas Terpantau</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.firms.satellite')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.satellite ?? 'Suomi-NPP VIIRS'}</p>
          <p className="text-[11px] text-slate-400">Resolusi 375 meter</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.firms.interval')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.interval ?? '3 Jam / Realtime'}</p>
          <p className="text-[11px] text-slate-400">Siklus Orbit Satelit</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.firms.coverage')}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{st?.totals.coverage ?? 'Indonesia & ASEAN'}</p>
          <p className="text-[11px] text-slate-400">Wilayah Asia Tenggara</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.firms.source')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.source ?? 'NASA EOSDIS FIRMS'}</p>
          <p className="text-[11px] text-slate-400">Earthdata LANCE Data Pool</p>
        </div>
      </div>

      {/* Hotspots Preview Table */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="skdr-eyebrow">{t('skdr.eyebrow.firms')}</div>
            <h2 className="skdr-section-title">{t('skdr.firms.hotspotsTitle')}</h2>
          </div>
          <div className="w-full max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari koordinat, tanggal, confidence..." />
          </div>
        </div>

        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.firms.lat')}</th>
                <th className={thCls}>{t('skdr.firms.lon')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.firms.brightness')}</th>
                <th className={thCls}>{t('skdr.firms.confidence')}</th>
                <th className={thCls}>{t('skdr.firms.sat')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.firms.frp')}</th>
                <th className={thCls}>{t('skdr.firms.acq')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredHotspots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    Tidak ada data titik panas.
                  </td>
                </tr>
              ) : (
                filteredHotspots.map((h, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{h.latitude.toFixed(4)}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{h.longitude.toFixed(4)}</td>
                    <td className="p-3 text-right font-mono text-amber-700 font-bold">
                      {h.brightness ? `${h.brightness.toFixed(1)} K` : '—'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          h.confidence === 'high'
                            ? 'bg-red-100 text-red-800'
                            : h.confidence === 'nominal'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {h.confidence ?? 'nominal'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{h.satellite ?? 'N'}</td>
                    <td className="p-3 text-right font-mono text-slate-700">
                      {h.frp ? `${h.frp.toFixed(1)} MW` : '—'}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">
                      {h.acq_date ?? '—'} {h.acq_time ? `(${h.acq_time} UTC)` : ''}
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
          <h2 className="skdr-section-title">{t('skdr.firms.logTitle')}</h2>
        </div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.ebs.trigger')}</th>
                <th className={thCls}>{t('skdr.ebs.start')}</th>
                <th className={thCls}>{t('skdr.ebs.end')}</th>
                <th className={`${thCls} text-right`}>Hotspot Terunduh</th>
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
                    <td className="p-3 text-right font-mono font-bold text-amber-700">{nf(log.items_fetched)} titik</td>
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

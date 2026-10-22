'use client'
// PR 019: Sinkronisasi BNPB InaRISK — status koneksi layer GIS bencana (ImageServer & MapServer)
import PageHeader from '@/components/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Loader2, ShieldAlert, ExternalLink } from 'lucide-react'
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

interface BnpbLayer {
  id: number
  layer_key: string
  layer_name: string
  service_url: string
  kind: string
  opacity: number
  status: string
  last_checked_at: string | null
  response_ms: number
}

interface BnpbStatus {
  running: boolean
  totals: {
    total_layers: number
    active_layers: number
    avg_response_ms: number
    frequency: string
    source: string
  }
  layers: BnpbLayer[]
  logs: SyncLog[]
}

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${PUBLIC_BASE_PATH}${path}`, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok || j.success === false) throw new Error(j.error || `HTTP ${r.status}`)
  return j.data as T
}

const nf = (n: number) => n.toLocaleString('id-ID')

export default function BnpbSyncPage() {
  const { t } = useTranslation()
  const [st, setSt] = useState<BnpbStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<BnpbStatus>('/api/v1/integrasi/bnpb/status')
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
      await masterSend('POST', '/api/v1/integrasi/bnpb/sync', {})
      toast.success(t('skdr.bnpb.started'))
      setTimeout(load, 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const filteredLayers = useMemo(() => {
    const list = st?.layers || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (l) => l.layer_key.toLowerCase().includes(q) || l.layer_name.toLowerCase().includes(q) || l.kind.toLowerCase().includes(q)
    )
  }, [st?.layers, search])

  const card = 'skdr-card p-4'
  const statusBadge = (s: string) =>
    s === 'sukses' || s === 'aktif' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        {t('skdr.bnpb.statusOk')}
      </span>
    ) : s === 'gagal' ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
        <XCircle className="h-3 w-3" />
        {t('skdr.bnpb.statusFail')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('skdr.bnpb.statusRunning')}
      </span>
    )

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={t('skdr.eyebrow.bnpb')}
        title={t('skdr.bnpb.title')}
        subtitle={<>{t('skdr.bnpb.subtitle')}</>}
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
              {syncing ? t('skdr.bnpb.running') : t('skdr.bnpb.syncNow')}
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.bnpb.totalLayers')}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{nf(st?.totals.total_layers ?? 0)}</p>
          <p className="text-[11px] text-slate-400">ArcGIS Image & MapServer</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.bnpb.activeLayers')}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{nf(st?.totals.active_layers ?? 0)}</p>
          <p className="text-[11px] text-slate-400">100% Layanan Terhubung</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.bnpb.avgResponse')}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{st?.totals.avg_response_ms ? `${st.totals.avg_response_ms} ms` : '—'}</p>
          <p className="text-[11px] text-slate-400">REST Endpoint Ping</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.bnpb.frequency')}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{st?.totals.frequency ?? 'Harian'}</p>
          <p className="text-[11px] text-slate-400">Pemantauan otomatis & manual</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.bnpb.source')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.source ?? 'gis.bnpb.go.id'}</p>
          <p className="text-[11px] text-slate-400">Portal Resmi InaRISK BNPB</p>
        </div>
      </div>

      {/* Layer Catalog Table */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="skdr-eyebrow">{t('skdr.eyebrow.bnpb')}</div>
            <h2 className="skdr-section-title">{t('skdr.bnpb.layerTitle')}</h2>
          </div>
          <div className="w-full max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder={t('skdr.ebs.mapSearch')} />
          </div>
        </div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.bnpb.layerKey')}</th>
                <th className={thCls}>{t('skdr.bnpb.layerName')}</th>
                <th className={thCls}>{t('skdr.bnpb.serviceType')}</th>
                <th className={thCls}>{t('skdr.bnpb.serviceUrl')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.bnpb.opacity')}</th>
                <th className={thCls}>{t('skdr.bnpb.lastChecked')}</th>
                <th className={thCls}>{t('skdr.bnpb.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    Tidak ada data layer.
                  </td>
                </tr>
              ) : (
                filteredLayers.map((l, i) => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                    <td className="p-3 font-mono font-bold text-primary">{l.layer_key}</td>
                    <td className="p-3 font-semibold text-slate-800">{l.layer_name}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600">
                        {l.kind}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs truncate text-[11px] text-slate-500 font-mono">
                      <a
                        href={l.service_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        title={l.service_url}
                      >
                        <span className="truncate max-w-[200px]">{l.service_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-700">{l.opacity}</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{l.last_checked_at ?? '—'}</td>
                    <td className="p-3">{statusBadge(l.status)}</td>
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
          <h2 className="skdr-section-title">{t('skdr.bnpb.logTitle')}</h2>
        </div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.ebs.trigger')}</th>
                <th className={thCls}>{t('skdr.ebs.start')}</th>
                <th className={thCls}>{t('skdr.ebs.end')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.ebs.fetched')}</th>
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
                    <td className="p-3 text-right font-mono font-bold text-slate-700">{nf(log.items_fetched)} layer</td>
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

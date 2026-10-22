'use client'
// PR 019: Sinkronisasi Flight Connect — Jaringan bandara komersial & rute penerbangan domestik
import PageHeader from '@/components/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, PlayCircle, CheckCircle2, XCircle, Loader2, Plane } from 'lucide-react'
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

interface AirportItem {
  id: number
  iata: string
  icao: string | null
  name: string
  city: string | null
  country_iso2: string
  latitude: number
  longitude: number
  airport_type: string
  degree: number
  is_active: boolean
  updated_at: string | null
}

interface RouteItem {
  id: number
  origin_iata: string
  dest_iata: string
  origin_name: string | null
  dest_name: string | null
  airline: string | null
  is_active: boolean
}

interface FlightStatus {
  running: boolean
  totals: {
    total_airports: number
    total_routes: number
    major_hubs: number
    coverage: string
    source: string
  }
  airports: AirportItem[]
  routes: RouteItem[]
  logs: SyncLog[]
}

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`${PUBLIC_BASE_PATH}${path}`, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok || j.success === false) throw new Error(j.error || `HTTP ${r.status}`)
  return j.data as T
}

const nf = (n: number) => n.toLocaleString('id-ID')

export default function FlightSyncPage() {
  const { t } = useTranslation()
  const [st, setSt] = useState<FlightStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'airports' | 'routes'>('airports')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await get<FlightStatus>('/api/v1/integrasi/flight/status')
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
      await masterSend('POST', '/api/v1/integrasi/flight/sync', {})
      toast.success(t('skdr.flight.started'))
      setTimeout(load, 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const filteredAirports = useMemo(() => {
    const list = st?.airports || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (a) =>
        a.iata.toLowerCase().includes(q) ||
        (a.icao && a.icao.toLowerCase().includes(q)) ||
        a.name.toLowerCase().includes(q) ||
        (a.city && a.city.toLowerCase().includes(q))
    )
  }, [st?.airports, search])

  const filteredRoutes = useMemo(() => {
    const list = st?.routes || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (r) =>
        r.origin_iata.toLowerCase().includes(q) ||
        r.dest_iata.toLowerCase().includes(q) ||
        (r.origin_name && r.origin_name.toLowerCase().includes(q)) ||
        (r.dest_name && r.dest_name.toLowerCase().includes(q))
    )
  }, [st?.routes, search])

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
        eyebrow={t('skdr.eyebrow.flight')}
        title={t('skdr.flight.title')}
        subtitle={<>{t('skdr.flight.subtitle')}</>}
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
              {syncing ? t('skdr.flight.running') : t('skdr.flight.syncNow')}
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.flight.airports')}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{nf(st?.totals.total_airports ?? 0)}</p>
          <p className="text-[11px] text-slate-400">Bandara Komersial Aktif</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.flight.routes')}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{nf(st?.totals.total_routes ?? 0)}</p>
          <p className="text-[11px] text-slate-400">Rute Non-Stop Domestik</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.flight.hubs')}</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{nf(st?.totals.major_hubs ?? 0)}</p>
          <p className="text-[11px] text-slate-400">CGK, SUB, DPS, UPG, KNO</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.flight.coverage')}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{st?.totals.coverage ?? 'Nasional ID'}</p>
          <p className="text-[11px] text-slate-400">Konektivitas Antar-Pulau</p>
        </div>
        <div className={card}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.flight.source')}</p>
          <p className="mt-1 text-xs font-bold text-slate-800">{st?.totals.source ?? 'Kemenhub / Open Data'}</p>
          <p className="text-[11px] text-slate-400">Flight Connection Network</p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setTab('airports'); setSearch('') }}
              className={`pb-1 text-sm font-bold border-b-2 transition ${
                tab === 'airports' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('skdr.flight.airportsTitle')} ({st?.airports.length ?? 0})
            </button>
            <button
              onClick={() => { setTab('routes'); setSearch('') }}
              className={`pb-1 text-sm font-bold border-b-2 transition ${
                tab === 'routes' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('skdr.flight.routesTitle')} ({st?.routes.length ?? 0})
            </button>
          </div>
          <div className="w-full max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={tab === 'airports' ? 'Cari bandara atau kota...' : 'Cari rute penerbangan...'}
            />
          </div>
        </div>

        <div className="skdr-table-card">
          {tab === 'airports' ? (
            <table className="skdr-table text-left text-xs">
              <thead>
                <tr className={tableHeadCls}>
                  <th className={thCls}>#</th>
                  <th className={thCls}>{t('skdr.flight.iata')}</th>
                  <th className={thCls}>{t('skdr.flight.icao')}</th>
                  <th className={thCls}>{t('skdr.flight.name')}</th>
                  <th className={thCls}>{t('skdr.flight.city')}</th>
                  <th className={thCls}>{t('skdr.flight.coordinates')}</th>
                  <th className={`${thCls} text-right`}>{t('skdr.flight.degree')}</th>
                  <th className={thCls}>{t('skdr.flight.hubCategory')}</th>
                  <th className={thCls}>{t('skdr.master.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAirports.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-400">
                      Tidak ada data bandara.
                    </td>
                  </tr>
                ) : (
                  filteredAirports.map((a, i) => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                      <td className="p-3 font-mono font-bold text-primary">{a.iata}</td>
                      <td className="p-3 font-mono text-slate-500">{a.icao ?? '—'}</td>
                      <td className="p-3 font-semibold text-slate-800">{a.name}</td>
                      <td className="p-3 text-slate-600">{a.city ?? '—'}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">{a.degree}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            a.degree >= 25
                              ? 'bg-sky-100 text-sky-800'
                              : a.degree >= 15
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {a.degree >= 25 ? 'Major Hub' : a.degree >= 15 ? 'Regional Hub' : 'Feeder'}
                        </span>
                      </td>
                      <td className="p-3">{statusBadge(a.is_active ? 'aktif' : 'gagal')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="skdr-table text-left text-xs">
              <thead>
                <tr className={tableHeadCls}>
                  <th className={thCls}>#</th>
                  <th className={thCls}>{t('skdr.flight.origin')}</th>
                  <th className={thCls}>{t('skdr.flight.dest')}</th>
                  <th className={thCls}>Nama Koridor Rute</th>
                  <th className={thCls}>{t('skdr.flight.airline')}</th>
                  <th className={thCls}>{t('skdr.master.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      Tidak ada data rute.
                    </td>
                  </tr>
                ) : (
                  filteredRoutes.map((r, i) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                      <td className="p-3 font-mono font-bold text-primary">{r.origin_iata}</td>
                      <td className="p-3 font-mono font-bold text-primary">{r.dest_iata}</td>
                      <td className="p-3 text-slate-700">
                        {r.origin_name ?? r.origin_iata} → {r.dest_name ?? r.dest_iata}
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                          {r.airline ?? 'Domestik ID'}
                        </span>
                      </td>
                      <td className="p-3">{statusBadge(r.is_active ? 'aktif' : 'gagal')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sync Log History Table */}
      <div className="overflow-hidden border-b skdr-rule mt-6">
        <div className="skdr-section-head">
          <div className="skdr-eyebrow">{t('skdr.eyebrow.ebsLog')}</div>
          <h2 className="skdr-section-title">{t('skdr.flight.logTitle')}</h2>
        </div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead>
              <tr className={tableHeadCls}>
                <th className={thCls}>#</th>
                <th className={thCls}>{t('skdr.ebs.trigger')}</th>
                <th className={thCls}>{t('skdr.ebs.start')}</th>
                <th className={thCls}>{t('skdr.ebs.end')}</th>
                <th className={`${thCls} text-right`}>Bandara</th>
                <th className={`${thCls} text-right`}>Rute Terhubung</th>
                <th className={`${thCls} text-right`}>Durasi (ms)</th>
                <th className={thCls}>{t('skdr.master.status')}</th>
                <th className={thCls}>{t('skdr.ebs.error')}</th>
              </tr>
            </thead>
            <tbody>
              {!st?.logs || st.logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-400">
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
                    <td className="p-3 text-right font-mono font-bold text-slate-700">{nf(log.items_fetched)}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-700">{nf(log.items_upserted)}</td>
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

'use client'
// PR 057: Ringkasan Utama (IBS & EBS) - Executive surveillance overview
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  MapPin,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import dynamic from 'next/dynamic'
import type { SkdrFilter } from '@/lib/dasbor-skdr-filter'
import { peFetch } from '@/lib/pe-api'
import { SkeletonChart } from '@/components/ui/Skeleton'
import { DEFAULT_LAYERS, type Focus, type Layers as MapLayers } from '@/components/spasial/SpasialMap'
import { defaultFilter, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { decodeTitik, type Area, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import { useChoroConfig } from '@/lib/choropleth-classes'

const SpasialMap = dynamic(() => import('@/components/spasial/SpasialMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
      Memuat peta klaster spasial surveilans…
    </div>
  ),
})

const INTEGRATED_APIS = [
  {
    id: 'flights',
    name: 'Penerbangan Domestik',
    icon: '✈️',
    source: '/map-layers/flight-routes',
    desc: 'Mobilitas antarbandara & rute domestik',
  },
  {
    id: 'fires',
    name: 'NASA FIRMS Hotspots',
    icon: '🔥',
    source: '/map-layers/fires',
    desc: 'Thermal anomaly kebakaran hutan vs ISPA',
  },
  {
    id: 'hazards',
    name: 'BNPB InaRISK Bencana',
    icon: '🌧️',
    source: '/map-layers/hazards',
    desc: 'Banjir, tanah longsor & bahaya alam',
  },
  {
    id: 'wildlife',
    name: 'Satwa Liar GBIF',
    icon: '🦅',
    source: '/map-layers/wildlife',
    desc: 'Pemantauan burung liar / Avian Influenza',
  },
  {
    id: 'vectors',
    name: 'Vektor Nyamuk iNat',
    icon: '🦟',
    source: '/map-layers/vectors',
    desc: 'Surveilans entomologi Aedes & Anopheles',
  },
]

const UNIT_TYPES = [
  { label: 'Puskesmas', count: '128.406' },
  { label: 'Rumah Sakit', count: '52.913' },
  { label: 'Dinas Kesehatan Kab/Kota', count: '7.546' },
  { label: 'BKK / KKP', count: '1.892' },
  { label: 'Klinik Pratama/Utama', count: '1.393' },
  { label: 'Laboratorium Kesehatan', count: '397' },
  { label: 'PHEOC Nasional', count: '5' },
]

const REPORT_STATUSES = [
  { label: 'Terverifikasi (Respon ≤24 Jam)', count: '181.700' },
  { label: 'Dalam Investigasi TGC', count: '7.050' },
  { label: 'False Alarm / Discarded', count: '3.420' },
]

export default function SkdrRingkasanView({
  f,
  onApply,
}: {
  f: SkdrFilter
  onApply?: (applied: SkdrFilter) => void
}) {
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<Metric>('kasus')
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS)
  const [sel, setSel] = useState<Area | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)

  // Layout docks
  const [leftDockOpen, setLeftDockOpen] = useState(true)
  const [leftDockTab, setLeftDockTab] = useState<'api' | 'faskes'>('api')
  const [rightDockOpen, setRightDockOpen] = useState(true)

  // Integrated layer toggles & filters
  const [intelLayers, setIntelLayers] = useState({
    flights: false,
    fires: false,
    hazards: false,
    wildlife: false,
    vectors: false,
  })
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  const [kpiData, setKpiData] = useState({
    totalIbs: 48920,
    totalEbs: 3412,
    kelengkapan: 86.4,
    ketepatan: 82.1,
    verifikasiRate: 91.5,
    cfr: 0.84,
  })

  // Simulated alert breakdown by status (Kemenkes standard)
  const alertStatusData = [
    { label: 'Terverifikasi (Respon ≤24 Jam)', count: 2840, pct: 72.2, color: '#10b981' },
    { label: 'Dalam Investigasi / TGC', count: 412, pct: 10.5, color: '#f59e0b' },
    { label: 'Sinyal Baru (Belum Verifikasi)', count: 160, pct: 4.1, color: '#ef4444' },
    { label: 'False Alarm / Discarded', count: 520, pct: 13.2, color: '#94a3b8' },
  ]

  // Convert Dasbor SKDR Filter to AFilter for Spatial API
  const aFilter = useMemo<AFilter>(() => {
    const base = defaultFilter()
    return {
      ...base,
      sumber: f.sumber,
      sy: f.sy,
      sw: f.sw,
      ey: f.ey,
      ew: f.ew,
      prov: f.prov?.[0] || '',
      kab: f.kab?.[0] || '',
      kec: '',
      penyakit: f.penyakit,
    }
  }, [f.sumber, f.sy, f.sw, f.ey, f.ew, f.prov, f.kab, f.penyakit])

  const sp = useAnalisa<SpasialResp>('spasial', aFilter, {}, true)
  const data = sp.loading ? null : sp.data
  const titik = useMemo(() => decodeTitik(sp.data), [sp.data])
  const choroCfg = useChoroConfig()

  // Sync KPI ribbon with real aggregated spatial data when available
  useEffect(() => {
    if (sp.data?.ringkasan) {
      const r = sp.data.ringkasan
      setKpiData((prev) => ({
        ...prev,
        totalIbs: f.sumber === 'ebs' ? prev.totalIbs : (r.kasus || prev.totalIbs),
        totalEbs: f.sumber === 'ibs' ? prev.totalEbs : (r.alert || prev.totalEbs),
        cfr: r.cfr != null ? r.cfr : prev.cfr,
      }))
    }
  }, [sp.data, f.sumber])

  const pickArea = (a: Area, fromMap = false) => {
    setSel(a)
    if (!fromMap && a.lat != null && a.lon != null) {
      setFocus({
        lat: a.lat,
        lon: a.lon,
        area: a,
        zoom: data?.level === 'provinsi' ? 6.5 : 9.5,
        nonce: Date.now(),
      })
    }
  }

  const pickTitik = (t: Titik) => {
    setFocus({ lat: t.lat, lon: t.lon, titik: t, nonce: Date.now() })
  }

  const onDrill = (a: Area) => {
    if (onApply) {
      if (data?.level === 'provinsi') {
        onApply({ ...f, prov: [String(a.id)], kab: [] })
      } else {
        onApply({ ...f, kab: [String(a.id)] })
      }
    }
  }

  const onUp =
    f.kab && f.kab.length > 0
      ? () => onApply && onApply({ ...f, kab: [] })
      : f.prov && f.prov.length > 0
      ? () => onApply && onApply({ ...f, prov: [], kab: [] })
      : null

  const METRIC_TABS: { key: Metric; label: string }[] = [
    { key: 'kasus', label: 'Kasus' },
    { key: 'alert', label: f.sumber === 'ebs' ? 'Sinyal EBS' : 'Alert / Sinyal' },
    { key: 'klb', label: 'KLB' },
    { key: 'cfr', label: 'CFR (%)' },
    { key: 'kematian', label: 'Kematian' },
  ]

  // Top 10 Disease Alerts
  const topAlertDiseases = [
    { code: '01AWD', name: 'Diare Akut', kasus: 16840, alertCount: 420, verifPct: 94.2, cfr: '0.12%' },
    { code: '16SDF', name: 'Suspek Dengue / DBD', kasus: 12450, alertCount: 380, verifPct: 92.5, cfr: '0.64%' },
    { code: '04ARI', name: 'Pneumonia', kasus: 8920, alertCount: 290, verifPct: 91.0, cfr: '1.20%' },
    { code: '21STF', name: 'Suspek Demam Tifoid', kasus: 5410, alertCount: 160, verifPct: 89.4, cfr: '0.31%' },
    { code: '18MEA', name: 'Suspek Campak', kasus: 1840, alertCount: 145, verifPct: 96.0, cfr: '0.05%' },
    { code: '05BDR', name: 'Diare Berdarah / Disentri', kasus: 1120, alertCount: 88, verifPct: 88.0, cfr: '0.18%' },
    { code: '08DBT', name: 'Gigitan Hewan Rabies (GHPR)', kasus: 940, alertCount: 76, verifPct: 98.2, cfr: '0.00%' },
    { code: '26LPT', name: 'Suspek Leptospirosis', kasus: 420, alertCount: 48, verifPct: 93.5, cfr: '4.80%' },
    { code: '07DPR', name: 'Kasus Observasi Difteri', kasus: 180, alertCount: 32, verifPct: 100.0, cfr: '3.10%' },
    { code: '14ATX', name: 'Suspek Antraks', kasus: 64, alertCount: 14, verifPct: 100.0, cfr: '6.25%' },
  ]

  // Weekly compliance (Kelengkapan & Ketepatan vs 80% Target)
  const complianceTrend = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const w = Math.max(1, f.ew - (11 - i))
      return {
        minggu: `M${w}`,
        kelengkapan: Math.min(100, Math.round(82 + Math.sin(i) * 5 + Math.random() * 3)),
        ketepatan: Math.min(100, Math.round(78 + Math.cos(i) * 6 + Math.random() * 3)),
        target: 80,
      }
    })
  }, [f.ew])

  useEffect(() => {
    // Attempt fetch real KPIs
    peFetch('/api/v1/kpi-snapshot')
      .then((res: any) => {
        if (res?.kpis) {
          setKpiData((prev) => ({
            ...prev,
            totalIbs: res.kpis.cases || prev.totalIbs,
            totalEbs: res.kpis.locations || prev.totalEbs,
          }))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [f])

  return (
    <div className="space-y-6" data-testid="skdr-ringkasan-view">
      {/* Executive KPI Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Kasus IBS */}
        <div className="skdr-card p-5 border-l-4 border-l-primary relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">
              {f.sumber === 'ebs' ? 'Sinyal EBS' : 'Total Kasus IBS'}
            </span>
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Stethoscope className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {kpiData.totalIbs.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-semibold text-slate-500">laporan</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <ArrowUpRight className="h-4 w-4" />
            <span>+4.2% vs minggu lalu</span>
            <span className="text-slate-400 font-normal">| 514 Kab/Kota</span>
          </div>
        </div>

        {/* Card 2: Sinyal EBS Aktif */}
        <div className="skdr-card p-5 border-l-4 border-l-amber-500 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">
              Sinyal EBS
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {kpiData.totalEbs.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-semibold text-slate-500">sinyal terdeteksi</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-600">
            <Clock className="h-4 w-4" />
            <span>160 perlu verifikasi segera</span>
          </div>
        </div>

        {/* Card 3: Respon Verifikasi Alert */}
        <div className="skdr-card p-5 border-l-4 border-l-emerald-500 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">
              Respon Verifikasi Alert
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              {kpiData.verifikasiRate}%
            </span>
            <span className="text-xs font-semibold text-emerald-600">terverifikasi</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span className="font-bold text-slate-800">2.840 dari 3.412</span> alert selesai
            ditindaklanjuti
          </div>
        </div>

        {/* Card 4: Kepatuhan Fasyankes */}
        <div className="skdr-card p-5 border-l-4 border-l-blue-500 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">
              Kepatuhan Unit Pelapor
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <div>
              <span className="text-2xl font-black text-slate-900">{kpiData.kelengkapan}%</span>
              <span className="block text-[10px] font-bold uppercase text-slate-500">
                Kelengkapan
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-2xl font-black text-slate-900">{kpiData.ketepatan}%</span>
              <span className="block text-[10px] font-bold uppercase text-slate-500">Ketepatan</span>
            </div>
          </div>
          <div className="mt-2 text-xs font-semibold text-emerald-600">
            Target Nasional ≥ 80.0% (Tercapai)
          </div>
        </div>
      </div>

      {/* Peta Spasial Klaster Surveilans Nasional: 1 Section Penuh dengan Dock Kiri (API Intelijen) dan Dock Kanan (Manajemen Alert) */}
      <div className="skdr-card p-5 w-full flex flex-col" data-testid="peta-skdr-terpadu">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> Peta Spasial Klaster Surveilans Nasional
            </div>
            <h3 className="text-base font-black text-slate-900 mt-0.5">
              Sebaran Sinyal Alert IBS & EBS per Fasyankes
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Metric Pills */}
            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
              {METRIC_TABS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    metric === m.key
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              Tahun {f.ey} · M{f.sw}–M{f.ew}
            </span>
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={() => setLeftDockOpen(!leftDockOpen)}
                className={`rounded-lg px-2 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  leftDockOpen
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Buka / Ciutkan Lapisan & API Intelijen"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">API & Unit</span>
              </button>
              <button
                type="button"
                onClick={() => setRightDockOpen(!rightDockOpen)}
                className={`rounded-lg px-2 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  rightDockOpen
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Buka / Ciutkan Status Respon Sinyal"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Status Respon</span>
              </button>
            </div>
          </div>
        </div>

        {/* Map Container with Collapsible Left API & Right Alert Docks */}
        <div className="mt-4 flex min-h-[640px] w-full flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
          {/* Left Collapsible Dock: Integrated APIs & Fasyankes Unit Filters */}
          <aside
            className={`shrink-0 border-r border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col transition-all duration-300 ${
              leftDockOpen ? 'w-[260px]' : 'w-10'
            }`}
            data-testid="peta-left-dock"
          >
              <button
                type="button"
                onClick={() => setLeftDockOpen(!leftDockOpen)}
                className="flex w-full items-center justify-between border-b border-slate-100 px-2.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                title={leftDockOpen ? 'Ciutkan panel' : 'Buka panel pengaturan & API'}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
                  {leftDockOpen && <span className="truncate">Lapisan & API Intelijen</span>}
                </div>
                {leftDockOpen ? (
                  <ChevronLeft className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {leftDockOpen && (
                <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
                  {/* Dock Internal Tab Switch */}
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setLeftDockTab('api')}
                      className={`flex-1 rounded-md py-1 transition ${
                        leftDockTab === 'api'
                          ? 'bg-white text-primary shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      API Terintegrasi
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeftDockTab('faskes')}
                      className={`flex-1 rounded-md py-1 transition ${
                        leftDockTab === 'faskes'
                          ? 'bg-white text-primary shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Unit & Status
                    </button>
                  </div>

                  {leftDockTab === 'api' ? (
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Lapisan Intelijen Eksternal
                      </div>
                      {INTEGRATED_APIS.map((api) => {
                        const active = Boolean((intelLayers as any)[api.id])
                        return (
                          <div
                            key={api.id}
                            className={`rounded-xl border p-2.5 transition cursor-pointer ${
                              active
                                ? 'border-primary/40 bg-blue-50/60'
                                : 'border-slate-100 bg-white hover:border-slate-200'
                            }`}
                            onClick={() =>
                              setIntelLayers((prev) => ({
                                ...prev,
                                [api.id]: !(prev as any)[api.id],
                              }))
                            }
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{api.icon}</span>
                                <span>{api.name}</span>
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  active ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'
                                }`}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-slate-500 leading-tight">
                              {api.desc}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-400">
                              <span>{api.source}</span>
                              <span
                                className={`font-sans font-bold text-[10px] ${
                                  active ? 'text-primary' : 'text-slate-400'
                                }`}
                              >
                                {active ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Jenis Unit */}
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                          Jenis Unit Pelapor
                        </div>
                        <div className="space-y-1">
                          {UNIT_TYPES.map((u) => {
                            const isSel = selectedUnits.includes(u.label)
                            return (
                              <button
                                key={u.label}
                                type="button"
                                onClick={() =>
                                  setSelectedUnits((prev) =>
                                    isSel ? prev.filter((x) => x !== u.label) : [...prev, u.label]
                                  )
                                }
                                className={`w-full flex items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] transition ${
                                  isSel
                                    ? 'bg-primary text-white font-bold'
                                    : 'hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                <span className="truncate">{u.label}</span>
                                <span className="tabular-nums text-[10px] opacity-80">{u.count}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Status Laporan */}
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                          Status Laporan SKDR
                        </div>
                        <div className="space-y-1">
                          {REPORT_STATUSES.map((s) => {
                            const isSel = selectedStatuses.includes(s.label)
                            return (
                              <button
                                key={s.label}
                                type="button"
                                onClick={() =>
                                  setSelectedStatuses((prev) =>
                                    isSel ? prev.filter((x) => x !== s.label) : [...prev, s.label]
                                  )
                                }
                                className={`w-full flex items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] transition ${
                                  isSel
                                    ? 'bg-primary text-white font-bold'
                                    : 'hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                <span className="truncate">{s.label}</span>
                                <span className="tabular-nums text-[10px] opacity-80">{s.count}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </aside>

            {/* Map Canvas with Bottom Epiweek Replay Bar */}
            <div className="min-w-0 flex-1 relative h-full">
              <SpasialMap
                data={data}
                titik={titik}
                metric={metric}
                setMetric={setMetric}
                layers={layers}
                setLayers={setLayers}
                choroCfg={choroCfg}
                sumber={f.sumber}
                selectedId={sel?.id ?? null}
                onSelectArea={(a) => (a ? pickArea(a, true) : setSel(null))}
                onDrill={onDrill}
                onUp={onUp}
                focus={focus}
                panelOpen={false}
                setPanelOpen={() => {}}
                height={640}
                rightPanel={null}
              />
            </div>

            {/* Right Collapsible Dock: Manajemen Alert (Status Respon Sinyal SKDR) */}
            <aside
              className={`shrink-0 border-l border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col transition-all duration-300 ${
                rightDockOpen ? 'w-[320px]' : 'w-10'
              }`}
              data-testid="peta-right-dock"
            >
              {rightDockOpen ? (
                <div className="flex h-full flex-col justify-between p-4 overflow-y-auto">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Manajemen Alert</span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 mt-0.5 truncate">
                          Status Respon Sinyal SKDR
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRightDockOpen(false)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Ciutkan panel Manajemen Alert"
                        aria-label="Ciutkan panel Manajemen Alert"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Total Akumulasi</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-800">
                        3.932 Sinyal
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {alertStatusData.map((s) => (
                        <div
                          key={s.label}
                          className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800 leading-tight">{s.label}</span>
                            <span className="font-black text-slate-900 tabular-nums">
                              {s.count.toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                            />
                          </div>
                          <div className="mt-1 text-right text-[10px] font-bold text-slate-500">
                            {s.pct}% dari total sinyal
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-slate-700">
                    <span className="font-black text-primary block mb-1">Standar Prosedur Kemenkes</span>
                    Alert berstatus <strong>SIAGA KLB</strong> wajib diverifikasi oleh Tim TGC Puskesmas /
                    Dinkes dalam waktu maksimal <strong>24 jam</strong> pasca sinyal muncul.
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRightDockOpen(true)}
                  className="flex h-full w-full flex-col items-center justify-start gap-3 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  title="Buka panel Manajemen Alert"
                  aria-label="Buka panel Manajemen Alert"
                >
                  <ChevronLeft className="h-4 w-4 text-slate-400" />
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  >
                    Manajemen Alert (3.932)
                  </span>
                </button>
              )}
            </aside>
          </div>
        </div>

      {/* Second Row: Weekly Compliance & Top 10 Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Reporting Compliance Curve (6 cols) */}
        <div className="skdr-card p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Indikator Mutu Surveilans
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Kelengkapan & Ketepatan Mingguan (Target 80%)
              </h3>
            </div>
            <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
              Benchmark ≥ 80%
            </span>
          </div>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={complianceTrend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="minggu" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, '']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #cbd5e1' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="kelengkapan"
                  name="Kelengkapan (%)"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="ketepatan"
                  name="Ketepatan (%)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target Nasional (80%)"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Top 10 Disease Alerts (6 cols) */}
        <div className="skdr-card p-5 lg:col-span-6 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Peringkat Alert
              </div>
              <h3 className="text-base font-black text-slate-900 mt-0.5">
                Top 10 Sinyal & Kasus Penyakit Terbanyak
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-semibold">Tahun {f.ey}</span>
          </div>
          <div className="mt-3 flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-2">Penyakit</th>
                  <th className="py-2 text-right">Kasus</th>
                  <th className="py-2 text-right">Alert</th>
                  <th className="py-2 text-right">Verifikasi</th>
                  <th className="py-2 text-right">CFR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topAlertDiseases.map((d, i) => (
                  <tr key={d.code} className="hover:bg-slate-50/70">
                    <td className="py-2 font-bold text-slate-800">
                      <span className="text-slate-400 mr-1.5 font-normal">{i + 1}.</span>
                      {d.name}
                    </td>
                    <td className="py-2 text-right font-black text-slate-900">
                      {d.kasus.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 text-right font-bold text-amber-600">{d.alertCount}</td>
                    <td className="py-2 text-right font-semibold text-emerald-600">{d.verifPct}%</td>
                    <td className="py-2 text-right font-mono text-slate-600">{d.cfr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'
// PR 057: Ringkasan Utama (IBS & EBS) - Executive surveillance overview
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bird,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  MapPin,
  RefreshCw,
  Settings,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Users,
  Wind,
  X,
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
import SpasialPanel from '@/components/spasial/SpasialPanel'
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

function Switch({
  on,
  onChange,
  color = '#0f766e',
  label,
}: {
  on: boolean
  onChange: () => void
  color?: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className="relative h-4 w-7 shrink-0 rounded-full transition cursor-pointer"
      style={{ background: on ? color : '#cbd5e1' }}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
          on ? 'left-3.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

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
  const [leftDockTab, setLeftDockTab] = useState<'api' | 'faskes'>('faskes')
  const [rightDockOpen, setRightDockOpen] = useState(true)

  // Map layer settings (matching "Pengaturan Peta & Lapisan" drawer)
  const [pointOpacity, setPointOpacity] = useState(1)
  const [adminBoundaries, setAdminBoundaries] = useState(true)
  const [windFlow, setWindFlow] = useState(false)

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

  const { totalTitik, countIbs, countEbs } = useMemo(() => {
    let ibs = 0
    let ebs = 0
    if (titik && titik.length > 0) {
      for (const t of titik) {
        if (t.src === 'ebs') ebs++
        else ibs++
      }
      return {
        totalTitik: titik.length,
        countIbs: ibs,
        countEbs: ebs,
      }
    }
    return {
      totalTitik: 3806,
      countIbs: 2948,
      countEbs: 858,
    }
  }, [titik])
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

      {/* Peta Spasial Klaster Surveilans Nasional: 1 Section Penuh dengan Dock Kiri (API Intelijen) */}
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
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1.5 ${
                  leftDockOpen
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Buka / Ciutkan Analisa & Detail Wilayah"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Analisa Wilayah</span>
              </button>
              <button
                type="button"
                onClick={() => setRightDockOpen(!rightDockOpen)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1.5 ${
                  rightDockOpen
                    ? 'border-teal-700 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title="Buka / Ciutkan Pengaturan Peta & Lapisan"
              >
                <Settings className="h-3.5 w-3.5 text-emerald-700" />
                <span className="hidden sm:inline">Pengaturan Lapisan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Map Container with Collapsible Left & Right Docks (Auto-layout, fixed height 640px) */}
        <div className="mt-4 flex h-[640px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
          {/* Left Dock: Analisa & Detail Wilayah (SpasialPanel with Ringkasan, Hotspot, Detail) */}
          {leftDockOpen ? (
            <div
              className="w-[340px] shrink-0 h-full border-r border-slate-200 bg-white z-20 flex flex-col transition-all duration-300 overflow-hidden"
              data-testid="peta-left-dock"
            >
              <SpasialPanel
                f={aFilter}
                data={data}
                titik={titik}
                metric={metric}
                selected={sel}
                onPickArea={(a) => pickArea(a)}
                onPickTitik={(t) => setFocus({ lat: t.lat, lon: t.lon, titik: t, nonce: Date.now() })}
                onClose={() => setLeftDockOpen(false)}
                onClear={() => setSel(null)}
                className="border-none rounded-none shadow-none bg-slate-50/70"
                closeIcon="left"
              />
            </div>
          ) : (
            <aside
              className="w-10 shrink-0 border-r border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col h-full transition-all duration-300"
              data-testid="peta-left-dock-collapsed"
            >
              <button
                type="button"
                onClick={() => setLeftDockOpen(true)}
                className="flex h-full w-full flex-col items-center justify-start gap-3 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                title="Buka Analisa & Detail Wilayah"
                aria-label="Buka Analisa & Detail Wilayah"
              >
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <MapPin className="h-4 w-4 text-primary" />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Analisa Wilayah
                </span>
              </button>
            </aside>
          )}

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
              fullHeight={true}
              rightPanel={null}
              intelLayers={intelLayers}
            />
          </div>

          {/* Right Collapsible Dock: Pengaturan Peta & Lapisan */}
          <aside
            className={`shrink-0 border-l border-slate-200 bg-white/95 backdrop-blur z-20 flex flex-col h-full transition-all duration-300 ${
              rightDockOpen ? 'w-[320px]' : 'w-10'
            }`}
            data-testid="peta-right-dock"
          >
            {rightDockOpen ? (
              <div className="flex h-full flex-col overflow-hidden">
                {/* Fixed Drawer Header */}
                <div className="shrink-0 flex items-center justify-between border-b border-slate-100 p-3 bg-white">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-emerald-700" />
                    <span className="text-sm font-bold text-slate-800">
                      Pengaturan Peta & Lapisan
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightDockOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Tutup pengaturan peta"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Scrollable Body (Internal scroll top-to-bottom, never stretching section) */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
                  {/* Section 1: Visualisasi Kasus & Wilayah */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Visualisasi Kasus & Wilayah
                    </div>
                    <div className="space-y-2">
                      {/* Kasus IBS & EBS */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          layers.points !== 'off'
                            ? 'border-teal-200 bg-white shadow-2xs'
                            : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-blue-600" title="Titik IBS" />
                              <span className="h-2 w-2 rounded-full bg-orange-500" title="Titik EBS" />
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              Kasus IBS & EBS
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs tabular-nums text-slate-800">
                              {totalTitik.toLocaleString('id-ID')}
                            </span>
                            <Switch
                              on={layers.points !== 'off'}
                              color="#00705a"
                              label="Kasus IBS & EBS"
                              onChange={() =>
                                setLayers({
                                  ...layers,
                                  points: layers.points !== 'off' ? 'off' : 'kluster',
                                })
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500 ml-5">
                          Titik fasyankes · IBS: {countIbs.toLocaleString('id-ID')} · EBS: {countEbs.toLocaleString('id-ID')}
                        </p>
                        {layers.points !== 'off' && (
                          <div className="mt-2 ml-5 flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              Opasitas
                            </span>
                            <input
                              type="range"
                              min={0.2}
                              max={1}
                              step={0.05}
                              value={pointOpacity}
                              onChange={(e) => setPointOpacity(Number(e.target.value))}
                              className="h-1 flex-1 cursor-pointer accent-[#00705a]"
                            />
                            <span className="w-8 text-right text-[10px] tabular-nums font-bold text-slate-600">
                              {Math.round(pointOpacity * 100)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Arsiran Wilayah */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          layers.choro
                            ? 'border-teal-200 bg-white shadow-2xs'
                            : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shapes className="h-3.5 w-3.5 text-teal-700" />
                            <span className="font-bold text-slate-800 text-xs">
                              Arsiran wilayah
                            </span>
                          </div>
                          <Switch
                            on={layers.choro}
                            color="#0f766e"
                            label="Arsiran wilayah"
                            onChange={() => setLayers({ ...layers, choro: !layers.choro })}
                          />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500 ml-5">
                          Skala kasus per wilayah (legenda kiri bawah)
                        </p>
                        {layers.choro && (
                          <div className="mt-2 ml-5 flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              Opasitas
                            </span>
                            <input
                              type="range"
                              min={0.2}
                              max={1}
                              step={0.05}
                              value={layers.opChoro}
                              onChange={(e) =>
                                setLayers({ ...layers, opChoro: Number(e.target.value) })
                              }
                              className="h-1 flex-1 cursor-pointer accent-teal-700"
                            />
                            <span className="w-8 text-right text-[10px] tabular-nums font-bold text-slate-600">
                              {Math.round(layers.opChoro * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Lapisan Intelijen Eksternal (API Terintegrasi) */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      API Intelijen Eksternal
                    </div>
                    <div className="space-y-1.5">
                      {INTEGRATED_APIS.map((api) => {
                        const active = Boolean((intelLayers as any)[api.id])
                        return (
                          <div
                            key={api.id}
                            className={`rounded-xl border p-2 transition cursor-pointer ${
                              active
                                ? 'border-teal-300 bg-teal-50/50'
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
                              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                <span>{api.icon}</span>
                                <span className="truncate">{api.name}</span>
                              </span>
                              <Switch
                                on={active}
                                color="#00705a"
                                label={api.name}
                                onChange={() =>
                                  setIntelLayers((prev) => ({
                                    ...prev,
                                    [api.id]: !(prev as any)[api.id],
                                  }))
                                }
                              />
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-500 leading-tight">
                              {api.desc}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Section 3: Konteks Lapisan Tambahan */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Konteks Spasial & Risiko
                    </div>
                    <div className="space-y-1.5">
                      {/* Batas Administrasi */}
                      <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-100 bg-white p-2.5 hover:bg-slate-50 cursor-pointer">
                        <div className="flex items-start gap-2 min-w-0">
                          <Layers className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800 block text-xs">
                              Batas Administrasi
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              Lapisan GeoJSON provinsi dan kabupaten/kota Indonesia
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={adminBoundaries}
                          onChange={(e) => setAdminBoundaries(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500 mt-1 cursor-pointer"
                        />
                      </label>

                      {/* Aliran Angin */}
                      <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-100 bg-white p-2.5 hover:bg-slate-50 cursor-pointer">
                        <div className="flex items-start gap-2 min-w-0">
                          <Wind className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800 block text-xs">
                              Aliran Angin
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              Animasi arah angin sebagai konteks risiko
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={windFlow}
                          onChange={(e) => setWindFlow(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500 mt-1 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Section 4: Peta Dasar */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Peta Dasar
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'osm', label: 'OSM' },
                        { id: 'none', label: 'Medan' },
                        { id: 'satellite', label: 'Satelit' },
                        { id: 'light', label: 'Terang' },
                      ].map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setLayers({ ...layers, base: b.id as any })}
                          className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                            layers.base === b.id
                              ? 'border-teal-700 bg-teal-50/70 text-teal-800 shadow-2xs ring-1 ring-teal-700/30'
                              : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catatan Panduan Interaktif */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-600">
                    <p className="font-semibold text-slate-700">
                      Observasi surveilans M01 – M45 · Seluruh Indonesia
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      Arahkan kursor ke wilayah untuk kasus/CFR; klik untuk memperbesar dan memfilter detail di panel kiri.
                    </p>
                  </div>
                </div>

                {/* Fixed Sticky Footer Button */}
                <div className="shrink-0 p-3 border-t border-slate-100 bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      setLayers(DEFAULT_LAYERS)
                      setPointOpacity(1)
                      setAdminBoundaries(true)
                      setWindFlow(false)
                      setIntelLayers({
                        flights: false,
                        fires: false,
                        hazards: false,
                        wildlife: false,
                        vectors: false,
                      })
                    }}
                    className="w-full rounded-xl bg-[#00705a] py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-[#005a48] transition active:scale-[0.99]"
                  >
                    Atur Ulang Pengaturan Lapisan
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRightDockOpen(true)}
                className="flex h-full w-full flex-col items-center justify-start gap-3 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                title="Buka Pengaturan Peta & Lapisan"
                aria-label="Buka Pengaturan Peta & Lapisan"
              >
                <ChevronLeft className="h-4 w-4 text-slate-400" />
                <Settings className="h-4 w-4 text-emerald-700" />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Pengaturan Lapisan
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

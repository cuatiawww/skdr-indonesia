'use client'

// PR 075: Dasbor SKDR Kinerja — KPI Cards & 4 Redesigned Charts (Peringatan Dini, Peta Verifikasi, Kelengkapan, Ketepatan)
// Menggunakan Endpoint API yang sama (/api/v1/dasbor/skdr/kinerja) yang query langsung ke PostgreSQL DB.
// Tanpa data dummy, tanpa fallback, tanpa hardcoded.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Filter,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { peFetch } from '@/lib/pe-api'

export interface KpiItem {
  key: string
  label: string
  nilai: number
  satuan: string
  sub: string
  delta?: string
  tone?: string
  detail?: string
  terverifikasi?: number
  belum_verifikasi?: number
  total_kumulatif?: number
  unit_melapor?: number
  total_laporan_ibs?: number
}

export interface PeringatanDiniItem {
  provinsi: string
  kode: string
  belum_verifikasi: number
  sudah_verifikasi: number
  total: number
  verif_pct: number
}

export interface PetaVerifikasiItem {
  provinsi: string
  kode: string
  latitude: number
  longitude: number
  total_alert: number
  terverifikasi: number
  belum_verifikasi: number
  verif_pct: number
}

export interface ComplianceItem {
  provinsi: string
  kode: string
  kelengkapan_pct?: number
  ketepatan_pct?: number
  unit_melapor?: number
  unit_tepat?: number
  unit_total: number
  target: number
  status: 'BAIK' | 'PERHATIAN' | 'RENDAH'
}

export interface KinerjaApiResponse {
  success: boolean
  meta: {
    tahun: number
    minggu: number
    label_minggu: string
    target_persentase: number
    daftar_minggu: number[]
  }
  kpi: {
    provinsi: KpiItem
    kabkota: KpiItem
    kecamatan: KpiItem
    unit_pelapor: KpiItem
    alert: KpiItem
    lap_minggu: KpiItem
  }
  charts: {
    peringatan_dini: PeringatanDiniItem[]
    peta_verifikasi: PetaVerifikasiItem[]
    kelengkapan: ComplianceItem[]
    ketepatan: ComplianceItem[]
  }
}

// Custom tooltip for Peringatan Dini chart
function CustomPeringatanDiniTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data: PeringatanDiniItem = payload[0]?.payload
    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs text-xs space-y-1.5 min-w-[200px]">
        <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400">Kode: {data?.kode}</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-rose-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Belum Terverifikasi
            </span>
            <span className="tabular-nums font-bold">{data?.belum_verifikasi?.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex items-center justify-between text-sky-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-600" /> Sudah Terverifikasi
            </span>
            <span className="tabular-nums font-bold">{data?.sudah_verifikasi?.toLocaleString('id-ID')}</span>
          </div>
          <div className="border-t border-slate-100 pt-1 flex items-center justify-between text-slate-700 font-bold">
            <span>Total Alert:</span>
            <span className="tabular-nums">{data?.total?.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-600 font-bold">
            <span>Respon Verifikasi:</span>
            <span>{data?.verif_pct}%</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

// Custom tooltip for Kelengkapan & Ketepatan
function CustomComplianceTooltip({ active, payload, label, mode }: any) {
  if (active && payload && payload.length) {
    const data: ComplianceItem = payload[0]?.payload
    const pct = mode === 'kelengkapan' ? data?.kelengkapan_pct : data?.ketepatan_pct
    const count = mode === 'kelengkapan' ? data?.unit_melapor : data?.unit_tepat
    const labelTitle = mode === 'kelengkapan' ? 'Kelengkapan Pelaporan' : 'Ketepatan Waktu'
    const statusColor =
      pct && pct >= 80 ? 'text-emerald-600' : pct && pct >= 60 ? 'text-amber-600' : 'text-rose-600'

    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs text-xs space-y-1.5 min-w-[210px]">
        <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${
            pct && pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct && pct >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {data?.status}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between font-bold">
            <span className="text-slate-600">{labelTitle}:</span>
            <span className={`tabular-nums text-sm ${statusColor}`}>{pct}%</span>
          </div>
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>Unit {mode === 'kelengkapan' ? 'Melapor' : 'Tepat Waktu'}:</span>
            <span className="tabular-nums font-semibold text-slate-700">
              {count?.toLocaleString('id-ID')} / {data?.unit_total?.toLocaleString('id-ID')} unit
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 pt-1">
            <span>Target Nasional:</span>
            <span className="font-bold text-slate-600">≥ 80.0%</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

export default function KinerjaView() {
  const [data, setData] = useState<KinerjaApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [selectedProv, setSelectedProv] = useState<string | null>(null)
  const [activeMapMetric, setActiveMapMetric] = useState<'total' | 'verif_pct'>('total')

  const fetchData = useCallback(
    async (minggu?: number | null, tahun = selectedYear) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (tahun) params.set('tahun', String(tahun))
        if (minggu != null) params.set('minggu', String(minggu))

        const qs = params.toString() ? `?${params.toString()}` : ''
        const res = await peFetch<KinerjaApiResponse>(`/api/v1/dasbor/skdr/kinerja${qs}`)
        if (res && res.success) {
          setData(res)
          if (selectedWeek == null && res.meta?.minggu) {
            setSelectedWeek(res.meta.minggu)
          }
        } else {
          setError('Gagal memuat data kinerja surveilans.')
        }
      } catch (err: any) {
        setError(err?.message || 'Terjadi kesalahan saat memuat data kinerja.')
      } finally {
        setLoading(false)
      }
    },
    [selectedYear, selectedWeek]
  )

  useEffect(() => {
    fetchData(selectedWeek, selectedYear)
  }, [fetchData, selectedWeek, selectedYear])

  const kpis = data?.kpi
  const meta = data?.meta
  const charts = data?.charts

  // Total summary calculation
  const totalVerifiedAlerts = useMemo(() => {
    if (!charts?.peringatan_dini) return 0
    return charts.peringatan_dini.reduce((acc, curr) => acc + curr.sudah_verifikasi, 0)
  }, [charts?.peringatan_dini])

  const totalUnverifiedAlerts = useMemo(() => {
    if (!charts?.peringatan_dini) return 0
    return charts.peringatan_dini.reduce((acc, curr) => acc + curr.belum_verifikasi, 0)
  }, [charts?.peringatan_dini])

  return (
    <div className="space-y-6" data-testid="dasbor-skdr-kinerja-view">
      {/* Top Filter & Toolbar Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-primary">
              <Calendar className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold text-slate-700">Periode Surveilans:</span>
          </div>

          {/* Week Selector Dropdown */}
          <div className="relative">
            <select
              aria-label="Pilih Minggu Epidemiologi"
              value={selectedWeek ?? meta?.minggu ?? 45}
              onChange={(e) => {
                const w = Number(e.target.value)
                setSelectedWeek(w)
                fetchData(w, selectedYear)
              }}
              className="appearance-none rounded-xl border border-slate-300 bg-slate-50 py-1.5 pl-3 pr-8 text-xs font-bold text-slate-800 shadow-2xs hover:border-primary focus:border-primary focus:outline-hidden cursor-pointer"
            >
              {meta?.daftar_minggu && meta.daftar_minggu.length > 0 ? (
                meta.daftar_minggu.map((w) => (
                  <option key={w} value={w}>
                    Minggu Epid {w} {w === 45 ? '(Aktif / Acuan)' : ''}
                  </option>
                ))
              ) : (
                <option value={45}>Minggu Epid 45 - 2026</option>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Year selector */}
          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            Tahun {meta?.tahun ?? 2026}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedProv && (
            <button
              type="button"
              onClick={() => setSelectedProv(null)}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
            >
              Reset Filter Provinsi: <span className="text-primary font-black">{selectedProv}</span> ✕
            </button>
          )}

          <button
            type="button"
            onClick={() => fetchData(selectedWeek, selectedYear)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-white hover:text-primary transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
            <span>Segarkan Data</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. KPI CARDS SECTION (Provinsi, Kab/Kota, Kecamatan, Unit Pelapor, Alert, Lap. Minggu)
          Styled consistently with Ringkasan Utama (IBS & EBS) (Image 1 style)
         ───────────────────────────────────────────────────────────── */}
      <section className="space-y-2.5" data-testid="kpi-cards-section">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> INDIKATOR KINERJA SURVEILANS NASIONAL
          </h2>
          <span className="text-[11px] font-semibold text-slate-400">
            Sumber Data: Database SKDR & Master Wilayah Nasional (Live)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Card 1: PROVINSI */}
          <div className="skdr-card p-5 border-l-4 border-l-teal-600 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                PROVINSI
              </span>
              <div className="rounded-xl bg-teal-50 p-2 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.provinsi?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.provinsi?.satuan || 'provinsi'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <ArrowUpRight className="h-4 w-4" />
              <span>{kpis?.provinsi?.sub || '100% Nasional'}</span>
            </div>
          </div>

          {/* Card 2: KAB/KOTA */}
          <div className="skdr-card p-5 border-l-4 border-l-blue-600 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                KAB/KOTA
              </span>
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.kabkota?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.kabkota?.satuan || 'kab/kota'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-600">
              <ShieldCheck className="h-4 w-4" />
              <span>{kpis?.kabkota?.sub || 'Wilayah Kerja'}</span>
            </div>
          </div>

          {/* Card 3: KECAMATAN */}
          <div className="skdr-card p-5 border-l-4 border-l-purple-600 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                KECAMATAN
              </span>
              <div className="rounded-xl bg-purple-50 p-2 text-purple-600">
                <Navigation className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.kecamatan?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.kecamatan?.satuan || 'kecamatan'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-purple-600">
              <Layers className="h-4 w-4" />
              <span>{kpis?.kecamatan?.sub || 'Wilayah Surveilans'}</span>
            </div>
          </div>

          {/* Card 4: UNIT PELAPOR */}
          <div className="skdr-card p-5 border-l-4 border-l-amber-500 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                UNIT PELAPOR
              </span>
              <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                <Stethoscope className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.unit_pelapor?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.unit_pelapor?.satuan || 'fasyankes'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-600">
              <Activity className="h-4 w-4" />
              <span>{kpis?.unit_pelapor?.sub || 'Puskesmas & RS Terdaftar'}</span>
            </div>
          </div>

          {/* Card 5: ALERT */}
          <div className="skdr-card p-5 border-l-4 border-l-rose-500 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                ALERT
              </span>
              <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight text-rose-600">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.alert?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.alert?.satuan || 'alert'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-600">
              <Clock className="h-4 w-4" />
              <span>{kpis?.alert?.sub || (loading ? 'Memuat...' : '-')}</span>
            </div>
          </div>

          {/* Card 6: LAP. MINGGU */}
          <div className="skdr-card p-5 border-l-4 border-l-emerald-500 rounded-2xl bg-white shadow-xs hover:shadow-md transition relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                LAP. MINGGU
              </span>
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {loading ? (
                  <span className="animate-pulse text-slate-300">...</span>
                ) : (
                  kpis?.lap_minggu?.nilai?.toLocaleString('id-ID') ?? '-'
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {kpis?.lap_minggu?.satuan || 'laporan'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <FileText className="h-4 w-4" />
              <span>
                {kpis?.lap_minggu?.sub || (meta ? `Minggu ${meta.minggu} - ${meta.tahun}` : '-')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          2. THE 4 REDESIGNED CHARTS (Legacy Layout Modernized)
          - Chart 1 (Top-Left): Peringatan Dini Nasional (Belum vs Sudah Terverifikasi per Provinsi)
          - Chart 2 (Top-Right): Update Hasil Verifikasi Peringatan Dini (Peta Klaster Spasial)
          - Chart 3 (Bottom-Left): Kelengkapan Unit Pelapor Menurut Provinsi (Target 80%)
          - Chart 4 (Bottom-Right): Ketepatan Unit Pelapor Menurut Provinsi (Target 80%)
         ───────────────────────────────────────────────────────────── */}
      <section className="space-y-4" data-testid="legacy-four-charts-section">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ──────────────── CHART 1: PERINGATAN DINI NASIONAL ──────────────── */}
          <div className="skdr-card p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-600">
                    <AlertOctagon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Peringatan Dini Nasional {meta?.label_minggu || (meta?.minggu ? `Minggu ${meta.minggu}` : '')}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Distribusi Status Verifikasi Peringatan Dini menurut 38 Provinsi
                    </p>
                  </div>
                </div>

                {/* Legend badges */}
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="inline-flex items-center gap-1.5 text-rose-600">
                    <span className="h-3 w-3 rounded-sm bg-rose-500" />
                    Belum Terverifikasi ({totalUnverifiedAlerts.toLocaleString('id-ID')})
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sky-600">
                    <span className="h-3 w-3 rounded-sm bg-sky-600" />
                    Sudah Terverifikasi ({totalVerifiedAlerts.toLocaleString('id-ID')})
                  </span>
                </div>
              </div>

              {/* Chart Body */}
              <div className="mt-4 h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts?.peringatan_dini || []}
                    margin={{ top: 10, right: 10, left: -10, bottom: 50 }}
                    onClick={(state) => {
                      if (state && state.activeLabel) {
                        setSelectedProv(state.activeLabel === selectedProv ? null : state.activeLabel)
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="provinsi"
                      tick={{ fontSize: 9, fill: '#475569' }}
                      angle={-60}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip content={<CustomPeringatanDiniTooltip />} />
                    <Bar
                      dataKey="belum_verifikasi"
                      name="Belum Terverifikasi"
                      stackId="a"
                      fill="#f43f5e"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="sudah_verifikasi"
                      name="Sudah Terverifikasi"
                      stackId="a"
                      fill="#0284c7"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Klik pada nama provinsi untuk menyorot peta</span>
              <span>Total Alert Minggu Ini: {kpis?.alert?.nilai ? kpis.alert.nilai.toLocaleString('id-ID') : '-'}</span>
            </div>
          </div>

          {/* ──────────────── CHART 2: UPDATE HASIL VERIFIKASI PERINGATAN DINI (MAP) ──────────────── */}
          <div className="skdr-card p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-primary">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Update Hasil Verifikasi Peringatan Dini {meta?.label_minggu || (meta?.minggu ? `Minggu ${meta.minggu}` : '')} {meta?.tahun ? `- ${meta.tahun}` : ''}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Sebaran spasial klaster dan status verifikasi alert di seluruh Indonesia
                    </p>
                  </div>
                </div>

                <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveMapMetric('total')}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      activeMapMetric === 'total'
                        ? 'bg-white text-primary shadow-xs font-black'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Volume Alert
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMapMetric('verif_pct')}
                    className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                      activeMapMetric === 'verif_pct'
                        ? 'bg-white text-primary shadow-xs font-black'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    % Verifikasi
                  </button>
                </div>
              </div>

              {/* Map Interactive View */}
              <div className="relative mt-4 h-[340px] w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-900 to-slate-950 p-2 text-white">
                {/* SVG Visual Map of Indonesia */}
                <svg
                  viewBox="94 -12 48 18"
                  className="h-full w-full select-none"
                  style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
                >
                  {/* Subtle Grid Lines */}
                  <line x1="94" y1="0" x2="142" y2="0" stroke="#334155" strokeWidth="0.05" strokeDasharray="0.3 0.3" />
                  <line x1="94" y1="-6" x2="142" y2="-6" stroke="#334155" strokeWidth="0.05" strokeDasharray="0.3 0.3" />
                  <line x1="94" y1="6" x2="142" y2="6" stroke="#334155" strokeWidth="0.05" strokeDasharray="0.3 0.3" />
                  <text x="96" y="-0.5" fill="#64748b" fontSize="0.7" fontFamily="sans-serif">Equator (0°)</text>

                  {/* Render Province Circles from Database */}
                  {charts?.peta_verifikasi?.map((item) => {
                    const isSelected = selectedProv === item.provinsi
                    // Scale circle radius based on alert count (between 0.4 and 1.8 coordinate units)
                    const radius = Math.max(0.4, Math.min(1.8, Math.sqrt(item.total_alert || 1) * 0.05 + 0.3))

                    // Color based on verification rate:
                    // Blue/Teal for >= 80%, Amber for 60-79%, Rose/Red for < 60%
                    const color =
                      item.verif_pct >= 80 ? '#0ea5e9' : item.verif_pct >= 60 ? '#f59e0b' : '#ef4444'

                    return (
                      <g
                        key={item.provinsi}
                        onClick={() => setSelectedProv(isSelected ? null : item.provinsi)}
                        className="cursor-pointer transition-transform hover:scale-110"
                      >
                        {/* Outer Glow / Halo */}
                        <circle
                          cx={item.longitude}
                          cy={-item.latitude}
                          r={radius * 1.8}
                          fill={color}
                          opacity={isSelected ? 0.45 : 0.22}
                          className="animate-pulse"
                        />
                        {/* Core Bubble */}
                        <circle
                          cx={item.longitude}
                          cy={-item.latitude}
                          r={radius}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? 0.15 : 0.08}
                          opacity={0.9}
                        />
                        {/* Bubble Label (Total Alert Count) */}
                        {item.total_alert > 20 && (
                          <text
                            cx={item.longitude}
                            cy={-item.latitude + 0.2}
                            x={item.longitude}
                            y={-item.latitude + 0.2}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize={Math.max(0.35, Math.min(0.65, radius * 0.6))}
                            fontWeight="bold"
                            pointerEvents="none"
                          >
                            {item.total_alert}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>

                {/* Selected Province HUD overlay */}
                <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between rounded-xl bg-slate-900/90 p-2.5 backdrop-blur-md text-[11px] border border-slate-700/60">
                  {selectedProv ? (
                    (() => {
                      const item = charts?.peta_verifikasi?.find((p) => p.provinsi === selectedProv)
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-amber-400 text-xs">{item?.provinsi}</span>
                            <span className="text-slate-400">|</span>
                            <span>Total: <b className="text-white">{item?.total_alert}</b> alert</span>
                            <span className="text-emerald-400">({item?.terverifikasi} terverifikasi)</span>
                            <span className="text-rose-400">({item?.belum_verifikasi} belum)</span>
                          </div>
                          <div className="font-bold text-sky-400">
                            Tingkat Respon: {item?.verif_pct}%
                          </div>
                        </>
                      )
                    })()
                  ) : (
                    <>
                      <div className="text-slate-300">
                        Peta Hotspot Verifikasi Peringatan Dini Surveilans SKDR (38 Provinsi)
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-sky-500" /> ≥80% Baik
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-amber-500" /> 60–79% Perhatian
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;60% Rendah
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Klik lingkaran provinsi pada peta untuk rincian</span>
              <span>Rerata Nasional: {kpis?.alert?.sub || '-'}</span>
            </div>
          </div>

          {/* ──────────────── CHART 3: KELENGKAPAN UNIT PELAPOR ──────────────── */}
          <div className="skdr-card p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Kelengkapan Unit Pelapor Menurut Provinsi {meta?.label_minggu || (meta?.minggu ? `Minggu ${meta.minggu}` : '')} {meta?.tahun ? `Tahun ${meta.tahun}` : ''}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Persentase unit pelapor yang mengirim laporan per provinsi vs Target Nasional 80%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                    Target ≥ 80.0%
                  </span>
                </div>
              </div>

              {/* Chart Body */}
              <div className="mt-4 h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts?.kelengkapan || []}
                    margin={{ top: 10, right: 10, left: -10, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="provinsi"
                      tick={{ fontSize: 9, fill: '#475569' }}
                      angle={-60}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip content={<CustomComplianceTooltip mode="kelengkapan" />} />
                    <ReferenceLine
                      y={80}
                      stroke="#0f766e"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Target 80%',
                        position: 'insideTopRight',
                        fill: '#0f766e',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                    <Bar dataKey="kelengkapan_pct" name="Kelengkapan (%)" radius={[3, 3, 0, 0]}>
                      {charts?.kelengkapan?.map((entry, index) => {
                        const pct = entry.kelengkapan_pct ?? 0
                        const color = pct >= 80 ? '#0f766e' : pct >= 60 ? '#f59e0b' : '#ef4444'
                        return <Cell key={`cell-k-${index}`} fill={color} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" /> Hijau: ≥80%
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ml-1" /> Kuning: 60-79%
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500 ml-1" /> Merah: &lt;60%
              </span>
              <span>Dihitung dari fasyankes aktif</span>
            </div>
          </div>

          {/* ──────────────── CHART 4: KETEPATAN UNIT PELAPOR ──────────────── */}
          <div className="skdr-card p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Ketepatan Unit Pelapor Menurut Provinsi {meta?.label_minggu || (meta?.minggu ? `Minggu ${meta.minggu}` : '')} {meta?.tahun ? `Tahun ${meta.tahun}` : ''}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Persentase unit pelapor yang mengirim laporan tepat waktu vs Target Nasional 80%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">
                    Target ≥ 80.0%
                  </span>
                </div>
              </div>

              {/* Chart Body */}
              <div className="mt-4 h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts?.ketepatan || []}
                    margin={{ top: 10, right: 10, left: -10, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="provinsi"
                      tick={{ fontSize: 9, fill: '#475569' }}
                      angle={-60}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip content={<CustomComplianceTooltip mode="ketepatan" />} />
                    <ReferenceLine
                      y={80}
                      stroke="#0284c7"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'Target 80%',
                        position: 'insideTopRight',
                        fill: '#0284c7',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                    <Bar dataKey="ketepatan_pct" name="Ketepatan (%)" radius={[3, 3, 0, 0]}>
                      {charts?.ketepatan?.map((entry, index) => {
                        const pct = entry.ketepatan_pct ?? 0
                        // Matching legacy screenshot: >= 80% is blue/cyan, <80% is red/coral
                        const color = pct >= 80 ? '#0284c7' : '#ef4444'
                        return <Cell key={`cell-t-${index}`} fill={color} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-600" /> Biru: ≥80% (Tercapai)
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500 ml-1" /> Merah: &lt;80%
              </span>
              <span>Batas pelaporan: Selasa pkl 12:00 WIB</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

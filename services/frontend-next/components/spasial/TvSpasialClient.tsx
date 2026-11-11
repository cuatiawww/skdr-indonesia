'use client'
// PR 050: Mode TV (/tv) — Pusat Komando Spasial & Meja Analisa Epidemiologi (Full-Screen Spatial Dashboard).
// Tampil penuh 100vw × 100vh tanpa header/sidebar aplikasi, dengan desain yang 100% konsisten dengan halaman Spasial (/dashboard/spasial):
// 1. Bilah Komando Atas (Tombol Kembali ke Dasbor Spasial, Badge Status Risiko Epidemiologi, Sumber IBS/EBS/Semua, Indikator Peta, Preset Periode, Kontrol Panel)
// 2. 6 Kartu KPI Epidemiologi bergaya SKDR (Transmisi, Mortalitas & CFR Wilson 95% CI, Sinyal & Verifikasi, KLB & Respons <=24J, Sebaran Pareto, Fasyankes di Peta)
// 3. Dock Lapisan & Triase Titik 1-Klik di kiri bawah KPI (tidak pernah menabrak KPI maupun Legenda)
// 4. Panel Meja Analisa Epidemiologi di kanan bawah KPI (Kajian Epid, Triase Wilayah, Hotspot Unit, Inspeksi Wilayah)
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, AlertTriangle, ArrowLeft, ChevronRight, Clock, Compass, Crosshair, Eye, EyeOff,
  Filter, Flame, Layers, ListTree, Loader2, MapPin, Maximize2, Minimize2, PanelRight,
  RefreshCw, ShieldAlert, SlidersHorizontal, Sparkles, Stethoscope, Target, Tv, X
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AFilter, apiQuery, fetchAnalisa, nf, preset, readFilter, SumberA, useAnalisa, writeFilter } from '@/lib/analisa-api'
import FilterBar, { activeFilterCount, scopeFilter } from '@/components/analisa/FilterBar'
import { InfoTip, Seg } from '@/components/analisa/ui'
import { DEFAULT_LAYERS, type BaseMap, type Focus, type Layers as MapLayers, type MapHudCtrl, type PointMode } from '@/components/spasial/SpasialMap'
import { decodeTitik, fmtPct, METRICS, STATUS, type Area, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import { useChoroConfig } from '@/lib/choropleth-classes'

const SpasialMap = dynamic(() => import('@/components/spasial/SpasialMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100 text-xs font-bold text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-teal-700" />
      Memuat Peta Spasial Mode TV…
    </div>
  ),
})

type TriageMode = 'all' | 'klb' | 'unverified' | 'late24' | 'verified'
type EpidTab = 'sitrep' | 'wilayah' | 'fasyankes' | 'detail'
const TAB = 'sinyal' as const

export default function TvSpasialClient() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-100 text-xs font-bold text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin text-teal-700" />Memuat Mode TV Spasial…</div>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [f, setFState] = useState<AFilter>(() => readFilter(sp))
  const [metric, setMetric] = useState<Metric>(() => ((sp.get('indikator') as Metric) || 'kasus'))
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS)
  const [triage, setTriage] = useState<TriageMode>('all')
  const [kpiOpen, setKpiOpen] = useState(true)
  const [dockOpen, setDockOpen] = useState(true)
  const [filterDrawer, setFilterDrawer] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [epidTab, setEpidTab] = useState<EpidTab>('sitrep')
  const [selected, setSelected] = useState<Area | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [clock, setClock] = useState<string>('')
  const choroCfg = useChoroConfig()

  useEffect(() => { setFState(readFilter(sp)) }, [sp])
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const setF = useCallback((patch: Partial<AFilter>) => {
    setSelected(null)
    setFState((prev) => {
      const next = { ...prev, ...patch }
      const url = new URL(window.location.href)
      writeFilter(url, next)
      router.replace(`${pathname}?${url.searchParams.toString()}`, { scroll: false })
      return next
    })
  }, [pathname, router])

  const sf = useMemo(() => scopeFilter(f, TAB), [f])
  const opsi = useAnalisa('opsi', { ...sf, penyakit: [] })
  const spasial = useAnalisa<SpasialResp>('spasial', sf)
  const data = spasial.loading ? null : spasial.data
  const r = spasial.data?.ringkasan
  const nAktif = activeFilterCount(f, TAB)

  const allTitik = useMemo(() => decodeTitik(spasial.data), [spasial.data])

  // Epidemiological unit triage counts
  const triageStats = useMemo(() => {
    let klbUnits = 0
    let unverifiedUnits = 0
    let late24Units = 0
    let verifiedUnits = 0
    let totalAlertSignals = 0
    let totalVerifSignals = 0
    let totalResp24Signals = 0
    let totalRespDenom = 0

    for (const t of allTitik) {
      if (t.st === 'klb' || t.b > 0) klbUnits++
      if (t.st === 'alert') unverifiedUnits++
      if (t.rn > t.r) late24Units++
      if (t.st === 'verif') verifiedUnits++
      totalAlertSignals += t.a || 0
      totalVerifSignals += t.v || 0
      totalResp24Signals += t.r || 0
      totalRespDenom += t.rn || 0
    }

    const verifRate = totalAlertSignals > 0
      ? Math.min(100, Math.round((totalVerifSignals / totalAlertSignals) * 1000) / 10)
      : null
    const resp24Rate = totalRespDenom > 0
      ? Math.min(100, Math.round((totalResp24Signals / totalRespDenom) * 1000) / 10)
      : null

    return {
      all: allTitik.length,
      klbUnits,
      unverifiedUnits,
      late24Units,
      verifiedUnits,
      totalAlertSignals,
      totalVerifSignals,
      unverifiedSignals: Math.max(0, totalAlertSignals - totalVerifSignals),
      lateSignals: Math.max(0, totalRespDenom - totalResp24Signals),
      verifRate,
      resp24Rate,
    }
  }, [allTitik])

  // Apply 1-click Triage filter to map points
  const filteredTitik = useMemo(() => {
    if (triage === 'all') return allTitik
    if (triage === 'klb') return allTitik.filter((t) => t.st === 'klb' || t.b > 0)
    if (triage === 'unverified') return allTitik.filter((t) => t.st === 'alert')
    if (triage === 'late24') return allTitik.filter((t) => t.rn > t.r)
    if (triage === 'verified') return allTitik.filter((t) => t.st === 'verif')
    return allTitik
  }, [allTitik, triage])

  // Spatial Pareto & Epidemic Curve Synthesis
  const epiSynthesis = useMemo(() => {
    const areas = spasial.data?.wilayah || []
    const totalAreas = areas.length
    const affectedAreas = areas.filter((a) => a.kasus > 0).length
    const spreadPct = totalAreas > 0 ? Math.round((affectedAreas / totalAreas) * 1000) / 10 : 0

    const sortedByKasus = [...areas].filter((a) => a.kasus > 0).sort((a, b) => b.kasus - a.kasus)
    const top3 = sortedByKasus.slice(0, 3)
    const totalKasus = r?.kasus || 0
    const top3Kasus = top3.reduce((acc, a) => acc + a.kasus, 0)
    const top3Share = totalKasus > 0 ? Math.round((top3Kasus / totalKasus) * 1000) / 10 : 0

    const kurva = r?.kurva || []
    let peakWeek: { label: string; kasus: number; alert: number } | null = null
    for (const w of kurva) {
      if (!peakWeek || w.kasus > peakWeek.kasus) peakWeek = w
    }
    const n = kurva.length
    let phaseLabel = 'Data Historis Terbatas'
    let phaseTone: 'red' | 'amber' | 'emerald' | 'slate' = 'slate'
    let momentumPct: number | null = null
    if (n >= 4) {
      const recent2 = (kurva[n - 1]?.kasus || 0) + (kurva[n - 2]?.kasus || 0)
      const prev2 = (kurva[n - 3]?.kasus || 0) + (kurva[n - 4]?.kasus || 0)
      if (prev2 > 0) {
        momentumPct = Math.round(((recent2 - prev2) / prev2) * 1000) / 10
        if (momentumPct >= 15) {
          phaseLabel = 'Fase Akselerasi (Naik)'
          phaseTone = 'red'
        } else if (momentumPct <= -10) {
          phaseLabel = 'Fase Dekelerasi (Melandai)'
          phaseTone = 'emerald'
        } else {
          phaseLabel = 'Fase Plateau (Fluktuatif)'
          phaseTone = 'amber'
        }
      }
    }

    const klbCount = r?.klb || 0
    const chgWeek = r?.chg_minggu ?? 0
    const cfrVal = r?.cfr ?? 0
    let riskLevel: 'SIAGA KLB' | 'WASPADA SINYAL' | 'TERKENDALI' = 'TERKENDALI'
    let riskBadgeCls = 'border-emerald-200 bg-emerald-50 text-emerald-800'
    let riskDotCls = 'bg-emerald-600'
    if (klbCount > 0 || cfrVal >= 2.0 || (chgWeek >= 25 && totalKasus >= 50)) {
      riskLevel = 'SIAGA KLB'
      riskBadgeCls = 'border-red-200 bg-red-50 text-red-700'
      riskDotCls = 'bg-red-600 animate-ping'
    } else if ((r?.alert || 0) > 0 || chgWeek > 5 || cfrVal >= 0.5) {
      riskLevel = 'WASPADA SINYAL'
      riskBadgeCls = 'border-amber-200 bg-amber-50 text-amber-800'
      riskDotCls = 'bg-amber-500 animate-pulse'
    }

    const unitPeta = r?.unit || 0
    const unitExact = r?.unit_persis || 0
    const exactPct = unitPeta > 0 ? Math.round((unitExact / unitPeta) * 1000) / 10 : 100

    return {
      totalAreas,
      affectedAreas,
      spreadPct,
      top3,
      top3Share,
      peakWeek,
      phaseLabel,
      phaseTone,
      momentumPct,
      riskLevel,
      riskBadgeCls,
      riskDotCls,
      exactPct,
    }
  }, [spasial.data?.wilayah, r])

  useEffect(() => {
    const d = spasial.data
    if (!d) return
    if (d.kab?.length === 1) {
      const a = d.wilayah.find((x) => x.id === d.kab[0]) || null
      setSelected(a)
    } else if (selected) {
      setSelected(d.wilayah.find((x) => x.id === selected.id) || null)
    }
  }, [spasial.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDrill = useCallback((a: Area) => {
    const lv = spasial.data?.level
    if (!lv) return
    if (lv === 'provinsi') {
      setF({ prov: String(a.id), kab: '', kec: '' })
    } else {
      setF({ kab: String(a.id), kec: '' })
    }
  }, [spasial.data?.level, setF])

  const onUp = useMemo(() => {
    if (f.kec) return () => setF({ kec: '' })
    if (f.kab) return () => setF({ kab: '', kec: '' })
    if (f.prov) return () => setF({ prov: '', kab: '', kec: '' })
    return null
  }, [f.prov, f.kab, f.kec, setF])

  const pickArea = useCallback((a: Area) => {
    setSelected(a)
    setEpidTab('detail')
    if (a.lat != null && a.lon != null) {
      setFocus({ lat: a.lat, lon: a.lon, area: a, zoom: spasial.data?.level === 'provinsi' ? 6.5 : 9.5, nonce: Date.now() })
    }
  }, [spasial.data?.level])

  const pickTitik = useCallback((t: Titik) => {
    setFocus({ lat: t.lat, lon: t.lon, titik: t, zoom: 13, nonce: Date.now() })
  }, [])

  const applyTriage = useCallback((mode: TriageMode) => {
    setTriage(mode)
    if (layers.points === 'off') {
      setLayers((prev) => ({ ...prev, points: 'kluster' }))
    }
  }, [layers.points])

  const crumbs: any[] = spasial.data?.meta?.breadcrumb || []
  const alertLabel = f.sumber === 'ebs' ? 'Sinyal EBS' : 'Alert / Sinyal'
  const toolbarBtn = (on: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition ${
      on
        ? 'border-teal-200 bg-teal-50 text-teal-800'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`

  // Keep query params when returning to /dashboard/spasial
  const backSpasialHref = useMemo(() => {
    const q = sp.toString()
    return q ? `/dashboard/spasial?${q}` : '/dashboard/spasial'
  }, [sp])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100 select-none" data-testid="tv-spasial-page">
      <SpasialMap
        data={data}
        titik={filteredTitik}
        metric={metric}
        setMetric={setMetric}
        layers={layers}
        setLayers={setLayers}
        choroCfg={choroCfg}
        sumber={sf.sumber}
        selectedId={selected?.id ?? null}
        onSelectArea={(a) => {
          setSelected(a)
          if (a) setEpidTab('detail')
        }}
        onDrill={onDrill}
        onUp={onUp}
        focus={focus}
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        fullHeight
        hideDefaultToolbar
        topHud={(ctrl: MapHudCtrl) => (
          <div className="space-y-2">
            {/* ── TOP COMMAND BAR (Consistent White & Kemenkes Teal Theme) ── */}
            <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-slate-800 shadow-lg backdrop-blur">
              {/* Left: Back to Spasial + Title + Risk Level + Scope Breadcrumb */}
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={backSpasialHref}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-extrabold text-slate-700 transition hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
                  title="Kembali ke Halaman Dasbor Spasial"
                  data-testid="tv-back-spasial"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-teal-700" />
                  <span>Kembali ke Spasial</span>
                </Link>

                <span className="h-5 w-px bg-slate-200 hidden sm:inline" />

                <div className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1">
                  <Tv className="h-3.5 w-3.5 text-teal-700" />
                  <span className="text-[11px] font-black tracking-tight text-teal-900">Mode TV Spasial</span>
                </div>

                {/* Auto-computed Epidemiological Risk Badge */}
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${epiSynthesis.riskBadgeCls}`}
                  title="Status kesiapsiagaan otomatis berdasarkan KLB aktif, kecepatan kenaikan mingguan, dan CFR"
                >
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${epiSynthesis.riskDotCls}`} />
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        epiSynthesis.riskLevel === 'SIAGA KLB'
                          ? 'bg-red-600'
                          : epiSynthesis.riskLevel === 'WASPADA SINYAL'
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                    />
                  </span>
                  {epiSynthesis.riskLevel}
                </div>

                {/* Scope Breadcrumb & Drill-Up */}
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
                  {onUp ? (
                    <button
                      type="button"
                      onClick={onUp}
                      className="mr-0.5 flex items-center gap-1 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-teal-800"
                      title="Naik satu tingkat wilayah"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Naik
                    </button>
                  ) : null}
                  <Compass className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                  <span className="font-extrabold text-slate-900 truncate max-w-[200px]">
                    {crumbs.map((c) => c.label).join(' › ') || 'Indonesia'}
                  </span>
                  <span className="text-[10.5px] font-semibold text-slate-500">
                    · {spasial.data?.meta?.periode_label || `M${f.sw}/${f.sy}–M${f.ew}/${f.ey}`}
                  </span>
                </div>
              </div>

              {/* Center: Sumber (Seg) + Choropleth Metric + Quick Period Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 hidden xl:inline">Sumber</span>
                  <Seg
                    value={f.sumber}
                    onChange={(v) => setF({ sumber: v as SumberA })}
                    options={[
                      { value: 'ibs', label: 'IBS' },
                      { value: 'ebs', label: 'EBS' },
                      { value: 'semua', label: 'Semua' },
                    ]}
                    testId="tv-sumber-cepat"
                  />
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hidden sm:inline">Warna Peta:</span>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                    className="bg-transparent font-extrabold text-teal-800 focus:outline-none cursor-pointer"
                    aria-label="Indikator Choropleth"
                  >
                    {METRICS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hidden lg:flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[10.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => setF(preset('4minggu'))}
                    className="rounded-md px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900"
                    title="4 Minggu Epidemiologi Terakhir"
                  >
                    4M
                  </button>
                  <button
                    type="button"
                    onClick={() => setF(preset('12minggu'))}
                    className="rounded-md px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900"
                    title="12 Minggu Epidemiologi Terakhir"
                  >
                    12M
                  </button>
                  <button
                    type="button"
                    onClick={() => setF(preset('tahun'))}
                    className="rounded-md px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900"
                    title="Tahun Berjalan (M1 s.d. Minggu Ini)"
                  >
                    Tahun berjalan
                  </button>
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterDrawer(!filterDrawer)}
                  className={toolbarBtn(filterDrawer)}
                  title="Filter Wilayah, Penyakit & Kriteria Lanjutan"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Filter</span>
                  {nAktif > 0 ? (
                    <span className="rounded-full bg-teal-700 px-1.5 text-[9.5px] font-black text-white">
                      {nAktif}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setKpiOpen(!kpiOpen)}
                  className={toolbarBtn(kpiOpen)}
                  title={kpiOpen ? 'Sembunyikan Kartu KPI' : 'Tampilkan Kartu KPI'}
                >
                  {kpiOpen ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span className="hidden md:inline">KPI</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDockOpen(!dockOpen)}
                  className={toolbarBtn(dockOpen)}
                  title="Tampilkan/Sembunyikan Lapisan & Triase Titik"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Lapisan</span>
                </button>

                <button
                  type="button"
                  onClick={() => ctrl.setShowLegend(!ctrl.showLegend)}
                  className={toolbarBtn(ctrl.showLegend)}
                  title="Tampilkan/Sembunyikan Legenda"
                >
                  <ListTree className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Legenda</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPanelOpen(!panelOpen)}
                  className={toolbarBtn(panelOpen)}
                  title="Tampilkan/Sembunyikan Panel Meja Analisa Epidemiologi"
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Analisa Epid</span>
                </button>

                <button
                  type="button"
                  onClick={ctrl.fitAll}
                  className={toolbarBtn(false)}
                  title="Tampilkan seluruh wilayah terpilih"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => spasial.reload()}
                  className={toolbarBtn(false)}
                  title="Segarkan Data Spasial"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${spasial.loading ? 'animate-spin text-teal-700' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={ctrl.toggleFs}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-2.5 text-[11px] font-bold text-white transition hover:bg-teal-800"
                  title={ctrl.fs ? 'Keluar layar penuh' : 'Layar penuh'}
                >
                  {ctrl.fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{ctrl.fs ? 'Keluar' : 'Layar Penuh'}</span>
                </button>

                {clock ? (
                  <span className="ml-0.5 hidden 2xl:inline-block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-extrabold text-slate-600 tabular-nums">
                    {clock}
                  </span>
                ) : null}
              </div>
            </div>

            {/* ── 6 EPIDEMIOLOGICAL KPI CARDS (Consistent with /dashboard/spasial <Kpi> style) ── */}
            {kpiOpen ? (
              <div className="pointer-events-auto grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6" data-testid="tv-kpi-grid">
                {/* 1. Kasus & Kecepatan Transmisi */}
                <TvKpiCard
                  label="Kasus"
                  tip="Jumlah kasus pada rentang minggu epid; klik untuk mewarnai peta menurut jumlah kasus."
                  value={nf(r?.kasus)}
                  tone="teal"
                  active={metric === 'kasus'}
                  onClick={() => setMetric('kasus')}
                  delta={r?.chg?.kasus ?? null}
                  deltaLabel="vs periode lalu"
                  sub={
                    <span className="flex items-center justify-between">
                      <span>{spasial.data?.minggu_ini || 'Minggu ini'}: <b className="text-slate-700 tabular-nums">{nf(r?.minggu_ini)}</b></span>
                      <span className={`font-bold tabular-nums ${(r?.chg_minggu ?? 0) > 0 ? 'text-red-600' : (r?.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {r?.chg_minggu != null ? `${r.chg_minggu > 0 ? '▲' : r.chg_minggu < 0 ? '▼' : '■'} ${Math.abs(r.chg_minggu).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% vs M lalu` : 'stabil'}
                      </span>
                    </span>
                  }
                />

                {/* 2. Kematian & CFR (Wilson 95% CI) */}
                <TvKpiCard
                  label="Kematian & CFR"
                  tip="Case Fatality Rate = Kematian ÷ Kasus × 100 dengan interval kepercayaan Wilson 95%. Klik untuk mewarnai peta menurut CFR."
                  value={`${fmtPct(r?.cfr)} (${nf(r?.kematian)})`}
                  tone="red"
                  active={metric === 'cfr' || metric === 'kematian'}
                  onClick={() => setMetric('cfr')}
                  delta={r?.chg?.kematian ?? null}
                  deltaLabel="kematian vs periode lalu"
                  sub={
                    <span className="flex items-center justify-between">
                      <span>95% CI: <b className="text-slate-700 tabular-nums">{r?.cfr_ci ? `${fmtPct(r.cfr_ci[0])}–${fmtPct(r.cfr_ci[1])}` : '0–0%'}</b></span>
                      <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold ${(r?.cfr ?? 0) >= 2 ? 'bg-red-50 text-red-700' : (r?.cfr ?? 0) >= 0.5 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {(r?.cfr ?? 0) >= 2 ? 'Tinggi' : (r?.cfr ?? 0) >= 0.5 ? 'Waspada' : 'Rendah'}
                      </span>
                    </span>
                  }
                />

                {/* 3. Alert / Sinyal & Verifikasi */}
                <TvKpiCard
                  label={alertLabel}
                  tip="Jumlah sinyal kewaspadaan dini SKDR dan cakupan verifikasi sinyal pada titik pelapor. Klik untuk mewarnai peta menurut Alert/Sinyal."
                  value={nf(r?.alert)}
                  tone="amber"
                  active={metric === 'alert'}
                  onClick={() => setMetric('alert')}
                  delta={r?.chg?.alert ?? null}
                  deltaLabel="vs periode lalu"
                  sub={
                    <span className="flex items-center justify-between">
                      <span>Terverifikasi: <b className="text-slate-700 tabular-nums">{triageStats.verifRate != null ? fmtPct(triageStats.verifRate) : '–'}</b></span>
                      <span className={`font-bold tabular-nums ${triageStats.unverifiedUnits > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {nf(triageStats.unverifiedUnits)} unit blm verif
                      </span>
                    </span>
                  }
                />

                {/* 4. KLB & Ketepatan Respons <= 24 Jam */}
                <TvKpiCard
                  label="KLB & Respons ≤24J"
                  tip="Kejadian Luar Biasa (KLB) dan ketepatan waktu respons sinyal ≤ 24 jam. Klik untuk mewarnai peta menurut KLB."
                  value={nf(r?.klb)}
                  tone="red"
                  active={metric === 'klb'}
                  onClick={() => setMetric('klb')}
                  delta={r?.chg?.klb ?? null}
                  deltaLabel="vs periode lalu"
                  sub={
                    <span className="flex items-center justify-between">
                      <span>Respons ≤24j: <b className="text-slate-700 tabular-nums">{triageStats.resp24Rate != null ? fmtPct(triageStats.resp24Rate) : '–'}</b></span>
                      <span className={`font-bold tabular-nums ${triageStats.late24Units > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {nf(triageStats.late24Units)} unit &gt;24j
                      </span>
                    </span>
                  }
                />

                {/* 5. Sebaran Wilayah & Konsentrasi Pareto */}
                <TvKpiCard
                  label="Sebaran & Pareto"
                  tip="Jumlah wilayah (provinsi/kab-kota) terdampak dan persentase beban kasus yang terkonsentrasi pada 3 wilayah teratas (Pareto). Klik untuk melihat perubahan mingguan."
                  value={`${epiSynthesis.affectedAreas} / ${epiSynthesis.totalAreas}`}
                  tone="blue"
                  active={metric === 'chg_minggu'}
                  onClick={() => setMetric('chg_minggu')}
                  sub={
                    <span className="flex items-center justify-between">
                      <span>Cakupan: <b className="text-slate-700 tabular-nums">{fmtPct(epiSynthesis.spreadPct)}</b></span>
                      <span>Top-3: <b className="text-teal-800 tabular-nums">{fmtPct(epiSynthesis.top3Share)} kasus</b></span>
                    </span>
                  }
                />

                {/* 6. Unit Pelapor di Peta & Laporan */}
                <TvKpiCard
                  label="Unit Pelapor di Peta"
                  tip="Unit pelapor yang muncul sebagai titik di peta beserta persentase koordinat presisi unit vs perkiraan pusat kab/kota. Klik untuk mengganti mode Kluster / Titik."
                  value={nf(r?.unit)}
                  tone="slate"
                  active={layers.points === 'titik'}
                  onClick={() => setLayers((prev) => ({ ...prev, points: prev.points === 'kluster' ? 'titik' : 'kluster' }))}
                  delta={r?.chg?.laporan ?? null}
                  deltaLabel={`(${nf(r?.laporan)} laporan)`}
                  sub={
                    <span className="flex items-center justify-between">
                      <span>{fmtPct(epiSynthesis.exactPct)} koordinat unit</span>
                      <span>{nf(r?.unit_perkiraan)} perkiraan</span>
                    </span>
                  }
                />
              </div>
            ) : null}
          </div>
        )}
        leftDock={
          dockOpen ? (
            <div className="pointer-events-auto w-[265px] space-y-2.5 rounded-2xl border border-slate-200 bg-white/95 p-3 text-[11px] text-slate-700 shadow-lg backdrop-blur" data-testid="tv-left-dock">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-teal-700" />
                  <b className="text-xs font-black text-slate-800">Lapisan & Triase Titik</b>
                </div>
                <button
                  type="button"
                  onClick={() => setDockOpen(false)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Tutup panel lapisan"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 1-Click Point Triage Filter */}
              <div>
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Triase Cepat Titik Unit</p>
                <div className="space-y-1">
                  {([
                    { key: 'all', label: 'Semua Unit Pelapor', count: triageStats.all, color: '#0f766e' },
                    { key: 'klb', label: 'Khusus KLB Aktif', count: triageStats.klbUnits, color: '#dc2626' },
                    { key: 'unverified', label: 'Alert Belum Diverifikasi', count: triageStats.unverifiedUnits, color: '#f97316' },
                    { key: 'late24', label: 'Respons > 24 Jam', count: triageStats.late24Units, color: '#111827' },
                    { key: 'verified', label: 'Terverifikasi', count: triageStats.verifiedUnits, color: '#d97706' },
                  ] as { key: TriageMode; label: string; count: number; color: string }[]).map((item) => {
                    const active = triage === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => applyTriage(item.key)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left font-bold transition ${
                          active
                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${active ? 'bg-white text-teal-900' : 'bg-slate-100 text-slate-600'}`}>
                          {nf(item.count)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Layer Modes */}
              <div className="border-t border-slate-100 pt-2 space-y-2">
                <div>
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Titik Unit Pelapor</p>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ['kluster', 'Kluster'],
                      ['titik', 'Titik'],
                      ['off', 'Sembunyi'],
                    ] as [PointMode, string][]).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLayers({ ...layers, points: k })}
                        className={`rounded-md border px-1 py-1 font-bold transition ${
                          layers.points === k
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                    <span>Choropleth</span>
                    <input
                      type="checkbox"
                      checked={layers.choro}
                      onChange={(e) => setLayers({ ...layers, choro: e.target.checked })}
                      className="accent-teal-700"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                    <span>Heatmap</span>
                    <input
                      type="checkbox"
                      checked={layers.heat}
                      onChange={(e) => setLayers({ ...layers, heat: e.target.checked })}
                      className="accent-teal-700"
                    />
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                    <span>Transparansi choropleth</span>
                    <span className="tabular-nums">{Math.round(layers.opChoro * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={layers.opChoro}
                    onChange={(e) => setLayers({ ...layers, opChoro: Number(e.target.value) })}
                    className="w-full accent-teal-700"
                  />
                </div>

                <div>
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Peta Dasar</p>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      ['light', 'Terang'],
                      ['osm', 'OSM'],
                      ['satellite', 'Satelit'],
                      ['none', 'Polos'],
                    ] as [BaseMap, string][]).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLayers({ ...layers, base: k })}
                        className={`rounded-md border px-1 py-1 font-bold ${
                          layers.base === k
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 pt-0.5 font-bold text-slate-700">
                  <span>Kasus minimal per unit</span>
                  <input
                    type="number"
                    min={0}
                    value={layers.kasusMin || ''}
                    placeholder="0"
                    onChange={(e) => setLayers({ ...layers, kasusMin: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-7 w-20 rounded-md border border-slate-200 px-1.5 text-right"
                  />
                </label>
              </div>
            </div>
          ) : null
        }
        rightPanel={
          <EpidemiologyPanel
            data={spasial.data}
            f={sf}
            titik={filteredTitik}
            allTitikCount={allTitik.length}
            triage={triage}
            onSelectTriage={applyTriage}
            triageStats={triageStats}
            epiSynthesis={epiSynthesis}
            selected={selected}
            onPickArea={pickArea}
            onDrill={onDrill}
            onPickTitik={pickTitik}
            onClose={() => setPanelOpen(false)}
            onClear={() => setSelected(null)}
            tab={epidTab}
            setTab={setEpidTab}
          />
        }
      />

      {/* ── FLOATING FILTER DRAWER OVERLAY ── */}
      {filterDrawer ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Filter analisa">
          <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[1px]" onClick={() => setFilterDrawer(false)} />
          <aside className="relative m-3 max-h-[calc(100vh-24px)] w-[310px] max-w-[90vw] overflow-y-auto rounded-2xl shadow-2xl">
            <FilterBar f={f} set={setF} tab={TAB} opsi={opsi.data} opsiLoading={opsi.loading} onClose={() => setFilterDrawer(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function TvKpiCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  tip,
  tone = 'teal',
  active = false,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  delta?: number | null
  deltaLabel?: string
  tip?: string
  tone?: 'teal' | 'red' | 'blue' | 'amber' | 'slate'
  active?: boolean
  onClick?: () => void
}) {
  const bar = { teal: 'bg-teal-600', red: 'bg-red-600', blue: 'bg-blue-600', amber: 'bg-amber-500', slate: 'bg-slate-500' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-white/95 p-3 text-left shadow-md backdrop-blur transition hover:border-teal-600/60 ${
        active ? 'border-teal-600 ring-2 ring-teal-600/20' : 'border-slate-200'
      }`}
      data-testid="tv-kpi-card"
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
        <span className="truncate">{label}</span>
        <InfoTip text={tip} />
      </div>
      <div className="mt-0.5 text-xl font-black tabular-nums text-slate-900">{value}</div>
      {delta !== undefined ? (
        <div
          className={`mt-0.5 text-[10.5px] font-bold ${
            delta === null
              ? 'text-slate-400'
              : delta > 0
              ? 'text-red-600'
              : delta < 0
              ? 'text-emerald-600'
              : 'text-slate-500'
          }`}
        >
          {delta === null
            ? 'pembanding belum ada data'
            : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}{' '}
          {deltaLabel ? <span className="font-medium text-slate-500">{deltaLabel}</span> : null}
        </div>
      ) : null}
      {sub ? <div className="mt-1 border-t border-slate-100 pt-1 text-[10.5px] text-slate-500">{sub}</div> : null}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT PANEL: MEJA ANALISA EPIDEMIOLOGI (Consistent with SpasialPanel.tsx)
// ─────────────────────────────────────────────────────────────────────────────
function EpidemiologyPanel({
  data,
  f,
  titik,
  allTitikCount,
  triage,
  onSelectTriage,
  triageStats,
  epiSynthesis,
  selected,
  onPickArea,
  onDrill,
  onPickTitik,
  onClose,
  onClear,
  tab,
  setTab,
}: {
  data: SpasialResp | null
  f: AFilter
  titik: Titik[]
  allTitikCount: number
  triage: TriageMode
  onSelectTriage: (m: TriageMode) => void
  triageStats: {
    all: number
    klbUnits: number
    unverifiedUnits: number
    late24Units: number
    verifiedUnits: number
    totalAlertSignals: number
    totalVerifSignals: number
    unverifiedSignals: number
    lateSignals: number
    verifRate: number | null
    resp24Rate: number | null
  }
  epiSynthesis: {
    totalAreas: number
    affectedAreas: number
    spreadPct: number
    top3: Area[]
    top3Share: number
    peakWeek: { label: string; kasus: number; alert: number } | null
    phaseLabel: string
    phaseTone: 'red' | 'amber' | 'emerald' | 'slate'
    momentumPct: number | null
    riskLevel: string
    exactPct: number
  }
  selected: Area | null
  onPickArea: (a: Area) => void
  onDrill: (a: Area) => void
  onPickTitik: (t: Titik) => void
  onClose: () => void
  onClear: () => void
  tab: EpidTab
  setTab: (t: EpidTab) => void
}) {
  const [det, setDet] = useState<any | null>(null)
  const [detLoading, setDetLoading] = useState(false)
  const lv = data?.level === 'kabkota' ? 'kab' : 'prov'
  const fq = apiQuery(f)

  useEffect(() => {
    setDet(null)
    if (!selected) return
    let alive = true
    setDetLoading(true)
    fetchAnalisa('spasial/wilayah', f, { wlv: lv, wid: selected.id })
      .then((d) => alive && setDet(d))
      .catch(() => alive && setDet({ error: true }))
      .finally(() => alive && setDetLoading(false))
    return () => { alive = false }
  }, [selected?.id, lv, fq]) // eslint-disable-line react-hooks/exhaustive-deps

  // Composite Epidemiological Risk Scoring for Wilayah Triage
  const triagedAreas = useMemo(() => {
    const areas = data?.wilayah || []
    return [...areas]
      .filter((a) => a.kasus > 0 || a.alert > 0 || a.klb > 0)
      .map((a) => {
        const klbScore = (a.klb || 0) * 50
        const alertScore = Math.min(40, (a.alert || 0) * 0.5)
        const growthScore = a.chg_minggu != null && a.chg_minggu > 0 && a.minggu_ini >= 5 ? Math.min(35, a.chg_minggu * 0.5) : 0
        const cfrScore = a.kasus >= 10 && a.cfr >= 1 ? Math.min(40, a.cfr * 8) : 0
        const burdenScore = (a.porsi || 0) * 0.6
        const score = Math.round(klbScore + alertScore + growthScore + cfrScore + burdenScore)

        let zone: 'merah' | 'oranye' | 'hijau' = 'hijau'
        if (a.klb > 0 || (a.chg_minggu != null && a.chg_minggu >= 25 && a.minggu_ini >= 10) || (a.kasus >= 15 && a.cfr >= 2)) {
          zone = 'merah'
        } else if (a.alert > 0 || (a.chg_minggu != null && a.chg_minggu > 5)) {
          zone = 'oranye'
        }
        return { a, score, zone }
      })
      .sort((x, y) => {
        const zOrder = { merah: 0, oranye: 1, hijau: 2 }
        if (zOrder[x.zone] !== zOrder[y.zone]) return zOrder[x.zone] - zOrder[y.zone]
        if (y.score !== x.score) return y.score - x.score
        return y.a.kasus - x.a.kasus
      })
  }, [data?.wilayah])

  const topUnits = useMemo(() => {
    return [...titik]
      .sort((a, b) => {
        if ((b.b > 0 ? 1 : 0) !== (a.b > 0 ? 1 : 0)) return (b.b > 0 ? 1 : 0) - (a.b > 0 ? 1 : 0)
        return b.k - a.k || b.a - a.a
      })
      .slice(0, 25)
  }, [titik])

  const r = data?.ringkasan
  const lvLabel = data?.level === 'kabkota' ? 'Kab/Kota' : 'Provinsi'

  const matriksHref = useMemo(() => {
    const p = new URLSearchParams(fq)
    const u = new URLSearchParams()
    u.set('sumber', f.sumber)
    u.set('startYear', String(f.sy))
    u.set('startWeek', String(f.sw))
    u.set('endYear', String(f.ey))
    u.set('endWeek', String(f.ew))
    if (selected) {
      if (lv === 'prov') u.set('prov', String(selected.id))
      else {
        if (f.prov) u.set('prov', f.prov)
        u.set('kab', String(selected.id))
      }
    }
    if (p.get('penyakit')) u.set('penyakit', p.get('penyakit')!)
    return `/dashboard/matriks-analisa?${u.toString()}`
  }, [f, fq, lv, selected])

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/95 shadow-xl backdrop-blur">
      {/* Header — identical visual style to SpasialPanel.tsx */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-black text-slate-800">
            <Stethoscope className="h-4 w-4 shrink-0 text-teal-700" />
            <span className="truncate">
              {selected ? selected.nama : (data?.meta?.breadcrumb || []).map((c: any) => c.label).slice(-1)[0] || 'Indonesia'}
            </span>
          </p>
          <p className="text-[11px] text-slate-500">
            {data?.meta?.periode_label} · {data?.meta?.sumber_label || 'Analisa Epidemiologi'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {selected ? (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
            >
              <X className="mr-0.5 inline h-3 w-3" />
              Wilayah
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Tutup panel"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4 Tabs — identical tab style to SpasialPanel.tsx */}
      <div role="tablist" className="flex gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
        {([
          ['sitrep', 'Kajian Epid'],
          ['wilayah', `Triase (${triagedAreas.length})`],
          ['fasyankes', `Hotspot (${nf(titik.length)})`],
          ['detail', 'Detail wilayah'],
        ] as [EpidTab, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-1.5 py-1 text-[11px] font-bold transition ${
              tab === k ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[11px] text-slate-700">
        {!data ? (
          <p className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
            Memuat telaah epidemiologi…
          </p>
        ) : null}

        {/* ── TAB 1: KAJIAN EPIDEMIOLOGI (SITREP & INTERPRETASI AHLI) ── */}
        {data && tab === 'sitrep' ? (
          <>
            {/* 1. Fase & Kecepatan Transmisi */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  1. Dinamika & Kurva Epidemi
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                    epiSynthesis.phaseTone === 'red'
                      ? 'bg-red-50 text-red-700'
                      : epiSynthesis.phaseTone === 'emerald'
                      ? 'bg-emerald-50 text-emerald-700'
                      : epiSynthesis.phaseTone === 'amber'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {epiSynthesis.phaseLabel}
                </span>
              </div>

              <p className="leading-snug text-slate-700">
                Pada <b>{data.meta.periode_label}</b> tercatat <b>{nf(r?.kasus)} kasus</b> dan <b>{nf(r?.kematian)} kematian</b> (CFR <b>{fmtPct(r?.cfr)}</b>; 95% CI {r?.cfr_ci ? `${fmtPct(r.cfr_ci[0])}–${fmtPct(r.cfr_ci[1])}` : '0–0%'}).
                {epiSynthesis.peakWeek ? (
                  <> Puncak epidemi terjadi pada <b>{epiSynthesis.peakWeek.label}</b> (<b>{nf(epiSynthesis.peakWeek.kasus)} kasus</b>).</>
                ) : null}
              </p>

              <div className="mt-2">
                <EpidCurve rows={r?.kurva || []} />
              </div>

              <div className="mt-1 grid grid-cols-3 gap-1 border-t border-slate-100 pt-1.5 text-center">
                <div>
                  <p className="text-slate-400">{data.minggu_lalu}</p>
                  <b className="tabular-nums text-slate-800">{nf(r?.minggu_lalu)}</b>
                </div>
                <div>
                  <p className="text-slate-400">{data.minggu_ini}</p>
                  <b className="tabular-nums text-slate-800">{nf(r?.minggu_ini)}</b>
                </div>
                <div>
                  <p className="text-slate-400">Perubahan</p>
                  <b className={(r?.chg_minggu ?? 0) > 0 ? 'text-red-600' : (r?.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                    {fmtPct(r?.chg_minggu, true)}
                  </b>
                </div>
              </div>
            </section>

            {/* 2. Pola Klaster Spasial & Konsentrasi Pareto */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  2. Sebaran Spasial & Pareto
                </p>
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-800">
                  {epiSynthesis.top3Share >= 50 ? 'Terkonsentrasi (Klaster)' : 'Menyebar (Difus)'}
                </span>
              </div>
              <p className="leading-snug text-slate-700">
                Kasus tersebar di <b>{epiSynthesis.affectedAreas} dari {epiSynthesis.totalAreas} {lvLabel.toLowerCase()}</b> ({fmtPct(epiSynthesis.spreadPct)}).
                Sebanyak <b>{fmtPct(epiSynthesis.top3Share)}</b> beban kasus berada di 3 wilayah teratas:
              </p>
              {epiSynthesis.top3.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {epiSynthesis.top3.map((a, idx) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPickArea(a)}
                      className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="w-4 text-right font-black text-slate-400">{idx + 1}</span>
                        <b className="truncate text-slate-800">{a.nama}</b>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-700">
                        <b>{nf(a.kasus)}</b> ({fmtPct(a.porsi)})
                        {a.klb > 0 ? <span className="ml-1 font-bold text-red-600">· {a.klb} KLB</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {/* 3. Evaluasi Kinerja Surveilans & Bottleneck Respons */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  3. Kinerja Verifikasi & Respons 24J
                </p>
                <span className="text-[10px] text-slate-400">Target ≥80%</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-500">Verifikasi Alert</span>
                    <b className={`tabular-nums ${(triageStats.verifRate ?? 100) >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {triageStats.verifRate != null ? fmtPct(triageStats.verifRate) : '–'}
                    </b>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <b>{nf(triageStats.unverifiedUnits)}</b> unit blm verifikasi
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-500">Respons ≤24 Jam</span>
                    <b className={`tabular-nums ${(triageStats.resp24Rate ?? 100) >= 80 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {triageStats.resp24Rate != null ? fmtPct(triageStats.resp24Rate) : '–'}
                    </b>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <b>{nf(triageStats.late24Units)}</b> unit respons &gt;24 jam
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {triageStats.unverifiedUnits > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectTriage(triage === 'unverified' ? 'all' : 'unverified')}
                    className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                      triage === 'unverified'
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    {triage === 'unverified' ? '✓ Titik Belum Verif Aktif' : `Tampilkan ${nf(triageStats.unverifiedUnits)} Unit Blm Verif`}
                  </button>
                ) : null}
                {triageStats.late24Units > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectTriage(triage === 'late24' ? 'all' : 'late24')}
                    className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                      triage === 'late24'
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {triage === 'late24' ? '✓ Titik Respons >24J Aktif' : `Tampilkan ${nf(triageStats.late24Units)} Unit >24J`}
                  </button>
                ) : null}
              </div>
            </section>

            {/* 4. Rekomendasi Epidemiologi & Interpretasi */}
            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                4. Rekomendasi Tindak Lanjut Epidemiologi
              </p>
              <ul className="list-disc space-y-1 pl-4 leading-snug">
                {(r?.klb || 0) > 0 ? (
                  <li>
                    <b>Investigasi KLB:</b> Prioritaskan Penyelidikan Epidemiologi (PE) lapangan pada <b>{nf(triageStats.klbUnits)} unit pelapor</b> berstatus KLB ({nf(r?.klb)} kejadian).
                  </li>
                ) : null}
                {triageStats.unverifiedUnits > 0 ? (
                  <li>
                    <b>Verifikasi Sinyal:</b> Tindak lanjuti <b>{nf(triageStats.unverifiedSignals)} alert belum terverifikasi</b> yang tersebar di {nf(triageStats.unverifiedUnits)} fasyankes.
                  </li>
                ) : null}
                {epiSynthesis.top3.length > 0 ? (
                  <li>
                    <b>Fokus Wilayah Pareto:</b> Perkuat pengendalian faktor risiko di <b>{epiSynthesis.top3.map((x) => x.nama).join(', ')}</b> ({fmtPct(epiSynthesis.top3Share)} dari total kasus).
                  </li>
                ) : null}
                {(data.interpretasi || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {/* ── TAB 2: TRIASE RISIKO WILAYAH ── */}
        {data && tab === 'wilayah' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="tv-triase-wilayah">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Peringkat Risiko {lvLabel}
              </p>
              <span className="text-[10px] text-slate-400">Klik wilayah untuk detail</span>
            </div>

            {triagedAreas.length > 0 ? (
              <ol className="space-y-1.5">
                {triagedAreas.map(({ a, zone }, idx) => {
                  const zoneBadge =
                    zone === 'merah'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : zone === 'oranye'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  const zoneLabel = zone === 'merah' ? 'Zona Merah' : zone === 'oranye' ? 'Waspada' : 'Terkendali'

                  return (
                    <li
                      key={a.id}
                      className={`rounded-lg border p-2 transition ${
                        selected?.id === a.id ? 'border-teal-600 bg-teal-50/50' : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onPickArea(a)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <span className="w-4 text-right font-black text-slate-400 tabular-nums">{idx + 1}</span>
                          <span className="truncate font-bold text-slate-900">{a.nama}</span>
                        </button>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase ${zoneBadge}`}>
                          {zoneLabel}
                        </span>
                      </div>

                      <div className="mt-1 ml-5 grid grid-cols-4 gap-1 text-[10px] tabular-nums">
                        <div>
                          <span className="block text-slate-400">Kasus</span>
                          <b className="text-slate-800">{nf(a.kasus)}</b>
                        </div>
                        <div>
                          <span className="block text-slate-400">Δ Minggu</span>
                          <b className={(a.chg_minggu ?? 0) > 0 ? 'text-red-600' : (a.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                            {fmtPct(a.chg_minggu, true)}
                          </b>
                        </div>
                        <div>
                          <span className="block text-slate-400">Alert</span>
                          <b className="text-amber-700">{nf(a.alert)}</b>
                        </div>
                        <div>
                          <span className="block text-slate-400">KLB / CFR</span>
                          <b className={a.klb > 0 ? 'text-red-600' : 'text-slate-700'}>
                            {a.klb > 0 ? `${a.klb} KLB` : fmtPct(a.cfr)}
                          </b>
                        </div>
                      </div>

                      {data.level === 'provinsi' ? (
                        <div className="mt-1.5 ml-5 flex justify-end">
                          <button
                            type="button"
                            onClick={() => onDrill(a)}
                            className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 hover:bg-teal-100"
                          >
                            Perbesar ke Kab/Kota →
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-slate-500">Tidak ada wilayah terdampak pada filter ini.</p>
            )}
          </section>
        ) : null}

        {/* ── TAB 3: HOTSPOT UNIT PELAPOR ── */}
        {data && tab === 'fasyankes' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="tv-hotspot-fasyankes">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Hotspot Unit Pelapor
                </p>
                <p className="text-[10px] text-slate-400">
                  {topUnits.length} teratas dari {nf(titik.length)} titik ({nf(allTitikCount)} total)
                </p>
              </div>
              {triage !== 'all' ? (
                <button
                  type="button"
                  onClick={() => onSelectTriage('all')}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                >
                  Semua Titik
                </button>
              ) : null}
            </div>

            {topUnits.length > 0 ? (
              <ol className="space-y-1">
                {topUnits.map((t, i) => (
                  <li key={t.idx}>
                    <button
                      type="button"
                      onClick={() => onPickTitik(t)}
                      className="w-full rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 text-right font-black text-slate-400">{i + 1}</span>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[t.st]?.color }} />
                          <span className="truncate font-bold text-slate-800">{t.unit || '(unit tanpa nama)'}</span>
                        </span>
                        <b className="shrink-0 tabular-nums text-slate-900">{nf(t.k)}</b>
                      </div>
                      <div className="ml-5 truncate text-[10px] text-slate-500">
                        {[t.kec ? `Kec. ${t.kec}` : null, t.kab].filter(Boolean).join(' · ')}
                        {t.a ? ` · ${nf(t.a)} ${t.src === 'ebs' ? 'sinyal' : 'alert'}` : ''}
                        {t.b ? <span className="font-bold text-red-600">{` · ${nf(t.b)} KLB`}</span> : ''}
                        {t.rn > t.r ? <span className="font-bold text-amber-700">{' · >24j'}</span> : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-slate-500">Tidak ada unit pelapor bertitik.</p>
            )}
          </section>
        ) : null}

        {/* ── TAB 4: DETAIL WILAYAH (Identical to SpasialPanel.tsx) ── */}
        {data && tab === 'detail' ? (
          !selected ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-slate-500">
              Klik wilayah pada peta atau baris pada tab <b>Triase</b> untuk melihat detail: penyakit teratas,{' '}
              {data.level === 'kabkota' ? 'kecamatan' : 'kab/kota'} dan unit pelapor teratas, serta kurva mingguan.
            </p>
          ) : (
            <>
              <section className="rounded-xl border-2 border-teal-700/20 bg-white p-3" data-testid="tv-spasial-detail">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-slate-400">Kasus</p>
                    <b className="text-base tabular-nums">{nf(selected.kasus)}</b>
                  </div>
                  <div>
                    <p className="text-slate-400">Kematian</p>
                    <b className="text-base tabular-nums">{nf(selected.kematian)}</b>
                  </div>
                  <div>
                    <p className="text-slate-400">CFR</p>
                    <b className="text-base tabular-nums">{selected.kasus ? fmtPct(selected.cfr) : '–'}</b>
                  </div>
                  <div>
                    <p className="text-slate-400">vs minggu lalu</p>
                    <b className={(selected.chg_minggu ?? 0) > 0 ? 'text-red-600' : (selected.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                      {fmtPct(selected.chg_minggu, true)}
                    </b>
                  </div>
                  <div>
                    <p className="text-slate-400">vs periode lalu</p>
                    <b className={(selected.chg_periode ?? 0) > 0 ? 'text-red-600' : (selected.chg_periode ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                      {fmtPct(selected.chg_periode, true)}
                    </b>
                  </div>
                  <div>
                    <p className="text-slate-400">KLB</p>
                    <b className={selected.klb ? 'text-red-600' : ''}>{nf(selected.klb)}</b>
                  </div>
                </div>

                {data.level === 'provinsi' ? (
                  <button
                    type="button"
                    onClick={() => onDrill(selected)}
                    className="mt-2 w-full rounded-lg bg-teal-700 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800"
                  >
                    Perbesar ke kab/kota provinsi ini
                  </button>
                ) : null}

                {detLoading ? (
                  <p className="mt-2 flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat detail…
                  </p>
                ) : null}
                {det?.kurva ? (
                  <div className="mt-2">
                    <EpidCurve rows={det.kurva} h={110} />
                  </div>
                ) : null}
                <Link
                  href={matriksHref}
                  className="mt-2 block rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-center text-[11px] font-bold text-teal-800 hover:bg-teal-100"
                >
                  Buka wilayah ini di Matriks Analisa
                </Link>
              </section>

              {det?.penyakit ? <MiniTable title="Penyakit teratas" rows={det.penyakit} /> : null}
              {det?.sub ? <MiniTable title={`${det.sub_label} teratas`} rows={det.sub} /> : null}
              {det?.unit ? <MiniTable title="Unit pelapor teratas" rows={det.unit} /> : null}
              {det?.error ? <p className="text-red-600">Detail gagal dimuat.</p> : null}
            </>
          )
        ) : null}
      </div>
    </aside>
  )
}

function EpidCurve({ rows, h = 115 }: { rows: { label: string; kasus: number; alert?: number }[]; h?: number }) {
  if (!rows.length) return <p className="text-slate-400">Tidak ada data mingguan.</p>
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 9.5 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9.5 }} />
          <Tooltip
            formatter={(v: any, name: any) => [nf(Number(v)), name === 'alert' ? 'Alert/Sinyal' : 'Kasus']}
            contentStyle={{ fontSize: 11, borderRadius: 8 }}
          />
          <Bar dataKey="kasus" fill="#0f766e" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MiniTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400">
            <th className="text-left font-semibold">Nama</th>
            <th className="text-right font-semibold">Kasus</th>
            <th className="text-right font-semibold">Mati</th>
            <th className="text-right font-semibold">Alert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="max-w-[155px] truncate py-0.5" title={r.nama}>
                {r.nama}
                {r.kecamatan ? <span className="text-slate-400"> · {r.kecamatan}</span> : null}
              </td>
              <td className="text-right tabular-nums">{nf(r.kasus)}</td>
              <td className="text-right tabular-nums">{nf(r.kematian)}</td>
              <td className="text-right tabular-nums">
                {nf(r.alert)}
                {r.klb ? <span className="ml-0.5 font-bold text-red-600">·{r.klb} KLB</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

'use client'
// PR 050: Mode TV (/tv) — Pusat Komando Spasial & Meja Analisa Epidemiologi (PHEOC Spatial Command Center).
// Menampilkan peta interaktif penuh layar (full-viewport spatial canvas) dengan:
// 1. Bilah Komando Atas (Top Command Bar) + Badge Status Risiko Epidemiologi Otomatis
// 2. 6 Kartu KPI Epidemiologi HUD (Transmisi, Mortalitas/CFR Wilson CI, Sinyal & Verifikasi, KLB & Respons <=24J, Sebaran Pareto, Presisi GPS Fasyankes)
// 3. Dock Lapisan & Triase Titik 1-Klik di sisi kiri (Semua, Khusus KLB, Belum Verifikasi, Respons >24J, Terverifikasi)
// 4. Panel Meja Analisa Epidemiologi di sisi kanan (Kajian Epid/SitRep, Triase Risiko Wilayah, Hotspot Fasyankes, Detail Wilayah)
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock, Compass,
  Crosshair, Eye, EyeOff, Filter, Flame, Layers, ListTree, Loader2, MapPin, Maximize2,
  Minimize2, PanelRight, RefreshCw, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles,
  Stethoscope, Target, Tv, X
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AFilter, apiQuery, defaultFilter, nf, preset, readFilter, SumberA, useAnalisa, writeFilter } from '@/lib/analisa-api'
import { peFetch } from '@/lib/pe-api'
import FilterBar from '@/components/analisa/FilterBar'
import { Seg } from '@/components/analisa/ui'
import SpasialMap, { DEFAULT_LAYERS, type BaseMap, type Focus, type Layers as MapLayers, type MapHudCtrl, type PointMode } from '@/components/spasial/SpasialMap'
import { fmtPct, METRICS, STATUS, statusFor, unpackTitik, type Area, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import { loadChoroConfig, type ChoroConfig } from '@/lib/choropleth-classes'

type TriageMode = 'all' | 'klb' | 'unverified' | 'late24' | 'verified'
type EpidTab = 'sitrep' | 'wilayah' | 'fasyankes' | 'detail'

export default function TvSpasialClient() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-56px)] items-center justify-center bg-slate-900 text-sm font-bold text-slate-200"><Loader2 className="mr-2 h-5 w-5 animate-spin text-teal-400" />Memuat Pusat Komando Spasial Epidemiologi…</div>}>
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
  const [choroCfg, setChoroCfg] = useState<ChoroConfig | null>(null)
  const [clock, setClock] = useState<string>('')

  useEffect(() => { setFState(readFilter(sp)) }, [sp])
  useEffect(() => { loadChoroConfig().then(setChoroCfg) }, [])
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const setF = useCallback((patch: Partial<AFilter> | ((prev: AFilter) => AFilter)) => {
    setFState((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      const url = new URL(window.location.href)
      writeFilter(url, next)
      router.replace(`${pathname}?${url.searchParams.toString()}`, { scroll: false })
      return next
    })
  }, [pathname, router])

  // Spasial API uses verification-agnostic points & choropleth so unverified alerts remain visible
  const sf = useMemo(() => ({ ...f, basis: 'rumor' as const }), [f])
  const opsi = useAnalisa('opsi', sf, { prov: sf.prov, kab: sf.kab })
  const spasial = useAnalisa<SpasialResp>('spasial', sf)
  const data = spasial.data
  const r = data?.ringkasan

  const allTitik = useMemo(() => unpackTitik(data?.titik), [data?.titik])

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
    const areas = data?.wilayah || []
    const totalAreas = areas.length
    const affectedAreas = areas.filter((a) => a.kasus > 0).length
    const spreadPct = totalAreas > 0 ? Math.round((affectedAreas / totalAreas) * 1000) / 10 : 0

    const sortedByKasus = [...areas].filter((a) => a.kasus > 0).sort((a, b) => b.kasus - a.kasus)
    const top3 = sortedByKasus.slice(0, 3)
    const totalKasus = r?.kasus || 0
    const top3Kasus = top3.reduce((acc, a) => acc + a.kasus, 0)
    const top3Share = totalKasus > 0 ? Math.round((top3Kasus / totalKasus) * 1000) / 10 : 0

    // Epidemic curve peak & 4-week momentum
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
          phaseLabel = 'Fase Akselerasi / Transmisi Meningkat'
          phaseTone = 'red'
        } else if (momentumPct <= -10) {
          phaseLabel = 'Fase Dekelerasi / Transmisi Melandai'
          phaseTone = 'emerald'
        } else {
          phaseLabel = 'Fase Plateau / Transmisi Fluktuatif'
          phaseTone = 'amber'
        }
      }
    }

    // Overall PHEOC Alert Level
    const klbCount = r?.klb || 0
    const chgWeek = r?.chg_minggu ?? 0
    const cfrVal = r?.cfr ?? 0
    let riskLevel: 'SIAGA KLB' | 'WASPADA SINYAL' | 'TERKENDALI' = 'TERKENDALI'
    let riskColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
    let riskDot = 'bg-emerald-400'
    if (klbCount > 0 || cfrVal >= 2.0 || (chgWeek >= 25 && totalKasus >= 50)) {
      riskLevel = 'SIAGA KLB'
      riskColor = 'bg-red-500/25 text-red-200 border-red-400/50'
      riskDot = 'bg-red-500 animate-ping'
    } else if ((r?.alert || 0) > 0 || chgWeek > 5 || cfrVal >= 0.5) {
      riskLevel = 'WASPADA SINYAL'
      riskColor = 'bg-amber-500/25 text-amber-200 border-amber-400/50'
      riskDot = 'bg-amber-400 animate-pulse'
    }

    // Exact unit coordinate coverage
    const unitPeta = r?.unit_peta || 0
    const unitExact = r?.unit_koordinat || 0
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
      riskColor,
      riskDot,
      exactPct,
    }
  }, [data?.wilayah, r])

  // Keep selected area in sync with current data
  useEffect(() => {
    if (!data) return
    if (data.kab?.length === 1) {
      const a = data.wilayah.find((x) => x.id === data.kab[0]) || null
      setSelected(a)
    } else if (selected) {
      setSelected(data.wilayah.find((x) => x.id === selected.id) || null)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDrill = useCallback((a: Area) => {
    if (!data) return
    if (data.level === 'provinsi') {
      setSelected(null)
      setF({ prov: String(a.id), kab: '', kec: '' })
    } else {
      setSelected(a)
      setF({ kab: String(a.id), kec: '' })
    }
  }, [data, setF])

  const onUp = useMemo(() => {
    if (f.kab) return () => { setSelected(null); setF({ kab: '', kec: '' }) }
    if (f.prov) return () => { setSelected(null); setF({ prov: '', kab: '', kec: '' }) }
    return null
  }, [f.prov, f.kab, setF])

  const pickArea = useCallback((a: Area) => {
    setSelected(a)
    setEpidTab('detail')
    if (a.lat != null && a.lon != null) {
      setFocus({ lat: a.lat, lon: a.lon, area: a, zoom: data?.level === 'provinsi' ? 6.5 : 9.5, nonce: Date.now() })
    }
  }, [data?.level])

  const pickTitik = useCallback((t: Titik) => {
    setFocus({ lat: t.lat, lon: t.lon, titik: t, zoom: 13, nonce: Date.now() })
  }, [])

  const applyTriage = useCallback((mode: TriageMode) => {
    setTriage(mode)
    if (layers.points === 'off') {
      setLayers((prev) => ({ ...prev, points: 'kluster' }))
    }
  }, [layers.points])

  const crumbs: any[] = data?.meta?.breadcrumb || []
  const topOffset = kpiOpen ? 166 : 62

  return (
    <div className="relative h-[calc(100vh-56px)] w-full overflow-hidden bg-slate-900 select-none" data-testid="tv-spasial-page">
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
        topOffset={topOffset}
        topHud={(ctrl: MapHudCtrl) => (
          <div className="space-y-2">
            {/* ── TOP COMMAND BAR ── */}
            <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/92 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
              {/* Left: Brand + Risk Level + Breadcrumb */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-teal-500/15 px-2.5 py-1 border border-teal-400/30">
                  <Tv className="h-4 w-4 text-teal-300" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-teal-300 leading-none">PHEOC Spatial TV</p>
                    <p className="text-xs font-extrabold tracking-tight text-white leading-tight">Pusat Komando Epidemiologi</p>
                  </div>
                </div>

                {/* Auto-computed Epidemiological Risk Badge */}
                <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${epiSynthesis.riskColor}`} title="Status kesiapsiagaan otomatis berdasarkan KLB aktif, kecepatan kenaikan mingguan, dan CFR">
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${epiSynthesis.riskDot}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${epiSynthesis.riskLevel === 'SIAGA KLB' ? 'bg-red-400' : epiSynthesis.riskLevel === 'WASPADA SINYAL' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  </span>
                  {epiSynthesis.riskLevel}
                </div>

                {/* Scope Breadcrumb & Drill-Up */}
                <div className="flex items-center gap-1 rounded-xl bg-slate-800/90 px-2.5 py-1 text-[11px] border border-slate-700">
                  {onUp ? (
                    <button
                      type="button"
                      onClick={onUp}
                      className="mr-1 flex items-center gap-1 rounded-md bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-teal-500"
                      title="Kembali ke tingkat wilayah di atasnya"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Naik
                    </button>
                  ) : null}
                  <Compass className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                  <span className="font-extrabold text-slate-100 truncate max-w-[200px]">
                    {crumbs.map((c) => c.label).join(' › ') || 'Indonesia (38 Provinsi)'}
                  </span>
                  <span className="ml-1 text-[10px] font-semibold text-slate-400">
                    · {data?.meta?.periode_label || `${f.sy} M${f.sw}–M${f.ew}`}
                  </span>
                </div>
              </div>

              {/* Center: Quick Source, Choropleth Indicator & Period Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Sumber switcher */}
                <div className="flex items-center rounded-xl bg-slate-800 p-0.5 border border-slate-700 text-[11px]">
                  {(['ibs', 'ebs', 'semua'] as SumberA[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setF({ sumber: s })}
                      className={`rounded-lg px-2 py-1 font-extrabold uppercase transition ${f.sumber === s ? 'bg-teal-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
                    >
                      {s === 'semua' ? 'IBS+EBS' : s.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Choropleth Metric selector */}
                <div className="flex items-center gap-1 rounded-xl bg-slate-800 px-2 py-1 border border-slate-700 text-[11px]">
                  <span className="text-[10px] font-bold uppercase text-slate-400 hidden sm:inline">Peta:</span>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                    className="bg-transparent font-extrabold text-teal-300 focus:outline-none cursor-pointer"
                    aria-label="Indikator Choropleth"
                  >
                    {METRICS.map((m) => (
                      <option key={m.key} value={m.key} className="bg-slate-900 text-white">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Period Presets */}
                <div className="hidden lg:flex items-center rounded-xl bg-slate-800 p-0.5 border border-slate-700 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setF(preset('4minggu'))}
                    className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
                    title="4 Minggu Epidemiologi Terakhir"
                  >
                    4M
                  </button>
                  <button
                    type="button"
                    onClick={() => setF(preset('12minggu'))}
                    className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
                    title="12 Minggu Epidemiologi Terakhir"
                  >
                    12M
                  </button>
                  <button
                    type="button"
                    onClick={() => setF(preset('tahun'))}
                    className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
                    title="Tahun Berjalan (M1 s.d. Minggu Ini)"
                  >
                    YTD
                  </button>
                </div>
              </div>

              {/* Right: HUD & View Controls + Live Clock */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterDrawer(!filterDrawer)}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-bold transition ${filterDrawer ? 'border-teal-400 bg-teal-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                  title="Filter Wilayah, Penyakit & Kriteria Lanjutan"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Filter</span>
                  {(f.prov || f.penyakit.length > 0) ? (
                    <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[9px] font-black text-slate-900">
                      {(f.prov ? 1 : 0) + f.penyakit.length}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setKpiOpen(!kpiOpen)}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-bold transition ${kpiOpen ? 'border-teal-500/50 bg-teal-500/20 text-teal-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  title={kpiOpen ? 'Sembunyikan Baris Kartu KPI' : 'Tampilkan Baris Kartu KPI'}
                >
                  {kpiOpen ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  <span className="hidden md:inline">KPI</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDockOpen(!dockOpen)}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-bold transition ${dockOpen ? 'border-teal-500/50 bg-teal-500/20 text-teal-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  title="Tampilkan/Sembunyikan Dock Lapisan & Triase Titik"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">Triase & Lapisan</span>
                </button>

                <button
                  type="button"
                  onClick={() => ctrl.setShowLegend(!ctrl.showLegend)}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2 text-[11px] font-bold transition ${ctrl.showLegend ? 'border-teal-500/50 bg-teal-500/20 text-teal-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  title="Tampilkan/Sembunyikan Legenda Peta"
                >
                  <ListTree className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setPanelOpen(!panelOpen)}
                  className={`flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-bold transition ${panelOpen ? 'border-teal-500/50 bg-teal-500/20 text-teal-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  title="Buka/Tutup Panel Meja Analisa Epidemiologi"
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Analisa Epid</span>
                </button>

                <button
                  type="button"
                  onClick={ctrl.fitAll}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  title="Pusatkan Peta ke Cakupan Wilayah"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => spasial.reload()}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  title="Segarkan Data Spasial"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${spasial.loading ? 'animate-spin text-teal-400' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={ctrl.toggleFs}
                  className="flex h-8 items-center gap-1 rounded-xl border border-teal-500/40 bg-teal-600 px-2.5 text-[11px] font-bold text-white hover:bg-teal-500"
                  title={ctrl.fs ? 'Keluar Layar Penuh TV' : 'Masuk Layar Penuh TV (Fullscreen)'}
                >
                  {ctrl.fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{ctrl.fs ? 'Keluar TV' : 'Layar Penuh'}</span>
                </button>

                {clock ? (
                  <span className="ml-1 hidden 2xl:inline-block rounded-lg bg-slate-800/90 px-2 py-1 font-mono text-[10px] font-bold text-teal-300 border border-slate-700">
                    {clock}
                  </span>
                ) : null}
              </div>
            </div>

            {/* ── 6 EPIDEMIOLOGICAL KPI HUD CARDS ── */}
            {kpiOpen ? (
              <div className="pointer-events-auto grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="tv-kpi-grid">
                {/* 1. Beban Kasus & Kecepatan Transmisi */}
                <button
                  type="button"
                  onClick={() => setMetric('kasus')}
                  className={`group relative overflow-hidden rounded-xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 ${metric === 'kasus' ? 'border-teal-600 ring-2 ring-teal-500/30' : 'border-slate-200/90'}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-teal-600" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">1. Beban Kasus & Tren</span>
                    <Activity className="h-3.5 w-3.5 text-teal-600" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">{nf(r?.kasus)}</span>
                    <DeltaBadge val={r?.chg_periode ?? null} label="periode" />
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-600">
                    <span>{data?.minggu_ini || 'M ini'}: <b className="text-slate-800 tabular-nums">{nf(r?.minggu_ini)}</b></span>
                    <span className={`font-bold tabular-nums ${(r?.chg_minggu ?? 0) > 0 ? 'text-red-600' : (r?.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {r?.chg_minggu != null ? `${r.chg_minggu > 0 ? '▲' : r.chg_minggu < 0 ? '▼' : '■'} ${Math.abs(r.chg_minggu).toFixed(1)}% vs M lalu` : '–'}
                    </span>
                  </div>
                </button>

                {/* 2. Mortalitas & Tingkat Keparahan (CFR + Wilson 95% CI) */}
                <button
                  type="button"
                  onClick={() => setMetric('cfr')}
                  className={`group relative overflow-hidden rounded-xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 ${metric === 'cfr' || metric === 'kematian' ? 'border-rose-600 ring-2 ring-rose-500/30' : 'border-slate-200/90'}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-rose-600" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">2. Mortalitas & CFR</span>
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">{fmtPct(r?.cfr)}</span>
                      <span className="text-[11px] font-bold text-rose-700 tabular-nums">({nf(r?.kematian)} mati)</span>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${(r?.cfr ?? 0) >= 2 ? 'bg-red-100 text-red-700' : (r?.cfr ?? 0) >= 0.5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {(r?.cfr ?? 0) >= 2 ? 'Letalitas Tinggi' : (r?.cfr ?? 0) >= 0.5 ? 'Waspada' : 'Terkendali'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-500">
                    <span>Wilson 95% CI:</span>
                    <b className="text-slate-700 tabular-nums">
                      {r?.cfr_ci_low != null && r?.cfr_ci_high != null ? `${fmtPct(r.cfr_ci_low)} – ${fmtPct(r.cfr_ci_high)}` : '0% – 0%'}
                    </b>
                  </div>
                </button>

                {/* 3. Sinyal Kewaspadaan Dini (SKDR) & Cakupan Verifikasi */}
                <button
                  type="button"
                  onClick={() => { setMetric('alert'); applyTriage(triage === 'unverified' ? 'all' : 'unverified') }}
                  className={`group relative overflow-hidden rounded-xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 ${metric === 'alert' || triage === 'unverified' ? 'border-amber-500 ring-2 ring-amber-400/30' : 'border-slate-200/90'}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-amber-500" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">3. Sinyal & Verifikasi</span>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">{nf(r?.alert)}</span>
                    {triageStats.verifRate != null ? (
                      <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold tabular-nums ${triageStats.verifRate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                        Verif {fmtPct(triageStats.verifRate)}
                      </span>
                    ) : <DeltaBadge val={r?.chg_alert ?? null} label="sinyal" />}
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-600">
                    <span>Unit blm verif:</span>
                    <b className={`tabular-nums ${triageStats.unverifiedUnits > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {nf(triageStats.unverifiedUnits)} fasyankes
                    </b>
                  </div>
                </button>

                {/* 4. Kejadian Luar Biasa (KLB) & Ketepatan Respons <= 24 Jam */}
                <button
                  type="button"
                  onClick={() => { setMetric('klb'); applyTriage(triage === 'klb' ? 'all' : 'klb') }}
                  className={`group relative overflow-hidden rounded-xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 ${metric === 'klb' || triage === 'klb' ? 'border-red-600 ring-2 ring-red-500/30' : 'border-slate-200/90'}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-red-600" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">4. KLB & Respons ≤24J</span>
                    <Flame className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xl font-black tracking-tight tabular-nums ${(r?.klb || 0) > 0 ? 'text-red-600' : 'text-slate-900'}`}>{nf(r?.klb)}</span>
                      <span className="text-[10px] font-bold text-slate-500">({nf(triageStats.klbUnits)} unit)</span>
                    </div>
                    {triageStats.resp24Rate != null ? (
                      <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold tabular-nums ${triageStats.resp24Rate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        ≤24J: {fmtPct(triageStats.resp24Rate)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-600">
                    <span>Respons &gt;24 jam:</span>
                    <b className={`tabular-nums ${triageStats.late24Units > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {nf(triageStats.late24Units)} unit terlambat
                    </b>
                  </div>
                </button>

                {/* 5. Sebaran Geografis & Indeks Konsentrasi Pareto */}
                <button
                  type="button"
                  onClick={() => setMetric('chg_minggu')}
                  className={`group relative overflow-hidden rounded-xl border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 ${metric === 'chg_minggu' ? 'border-indigo-600 ring-2 ring-indigo-500/30' : 'border-slate-200/90'}`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-indigo-600" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">5. Sebaran & Pareto</span>
                    <Target className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">
                      {epiSynthesis.affectedAreas}<span className="text-sm font-bold text-slate-400">/{epiSynthesis.totalAreas}</span>
                    </span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-indigo-700 tabular-nums">
                      {fmtPct(epiSynthesis.spreadPct)} {data?.level === 'kabkota' ? 'kab/kota' : 'prov'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-600">
                    <span>Beban Top-3 Wilayah:</span>
                    <b className="text-indigo-900 tabular-nums">{fmtPct(epiSynthesis.top3Share)} kasus</b>
                  </div>
                </button>

                {/* 6. Cakupan Fasyankes Pelapor & Presisi Geospasial */}
                <button
                  type="button"
                  onClick={() => setLayers((prev) => ({ ...prev, points: prev.points === 'kluster' ? 'titik' : 'kluster' }))}
                  className="group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-md transition hover:-translate-y-0.5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-cyan-600" />
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">6. Fasyankes di Peta</span>
                    <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">{nf(r?.unit_peta)}</span>
                    <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-cyan-800 tabular-nums">
                      {nf(r?.laporan)} lap
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-600">
                    <span>Presisi GPS Unit:</span>
                    <b className="text-cyan-800 tabular-nums">
                      {fmtPct(epiSynthesis.exactPct)} ({nf(r?.unit_kabkota)} perkiraan)
                    </b>
                  </div>
                </button>
              </div>
            ) : null}
          </div>
        )}
        leftDock={
          dockOpen ? (
            <div className="pointer-events-auto w-[265px] space-y-2.5 rounded-2xl border border-slate-200/90 bg-white/95 p-3 text-[11px] text-slate-700 shadow-2xl backdrop-blur-md" data-testid="tv-left-dock">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-teal-700" />
                  <b className="text-xs font-black text-slate-900">Triase & Lapisan Spasial</b>
                </div>
                <button
                  type="button"
                  onClick={() => setDockOpen(false)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Sembunyikan dock"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 1-Click Point Triage Filter */}
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Triase Cepat Titik Fasyankes</p>
                <div className="space-y-1">
                  {([
                    { key: 'all', label: 'Semua Fasyankes Pelapor', count: triageStats.all, dot: 'bg-teal-600', activeCls: 'border-teal-600 bg-teal-50 text-teal-900' },
                    { key: 'klb', label: 'Khusus Sinyal KLB Aktif', count: triageStats.klbUnits, dot: 'bg-red-600', activeCls: 'border-red-600 bg-red-50 text-red-900' },
                    { key: 'unverified', label: 'Alert Belum Diverifikasi', count: triageStats.unverifiedUnits, dot: 'bg-orange-500', activeCls: 'border-orange-500 bg-orange-50 text-orange-900' },
                    { key: 'late24', label: 'Respons Terlambat (>24 Jam)', count: triageStats.late24Units, dot: 'bg-slate-900', activeCls: 'border-slate-800 bg-amber-50 text-slate-900' },
                    { key: 'verified', label: 'Alert Sudah Terverifikasi', count: triageStats.verifiedUnits, dot: 'bg-amber-500', activeCls: 'border-amber-600 bg-amber-50/70 text-amber-900' },
                  ] as { key: TriageMode; label: string; count: number; dot: string; activeCls: string }[]).map((item) => {
                    const active = triage === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => applyTriage(item.key)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left font-bold transition ${active ? item.activeCls : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className={`ml-1 rounded px-1.5 py-0.2 text-[10px] font-black tabular-nums ${active ? 'bg-white/80' : 'bg-slate-100 text-slate-600'}`}>
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
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Mode Titik & Kepadatan</p>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ['kluster', 'Kluster'],
                      ['titik', 'Titik Unit'],
                      ['off', 'Sembunyi'],
                    ] as [PointMode, string][]).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLayers({ ...layers, points: k })}
                        className={`rounded-lg border px-1.5 py-1 text-[10.5px] font-bold transition ${layers.points === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
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
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span>Opasitas Choropleth</span>
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
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Peta Dasar</p>
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
                        className={`rounded-md border px-1 py-1 text-[10px] font-bold ${layers.base === k ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 pt-0.5 font-bold text-slate-700">
                  <span className="text-[10.5px]">Kasus min. per unit</span>
                  <input
                    type="number"
                    min={0}
                    value={layers.kasusMin || ''}
                    placeholder="0"
                    onChange={(e) => setLayers({ ...layers, kasusMin: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-6 w-16 rounded-md border border-slate-200 px-1.5 text-right text-[11px]"
                  />
                </label>
              </div>
            </div>
          ) : null
        }
        rightPanel={
          <EpidemiologyPanel
            data={data}
            f={sf}
            metric={metric}
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
            tab={epidTab}
            setTab={setEpidTab}
          />
        }
      />

      {/* ── FLOATING FILTER DRAWER OVERLAY ── */}
      {filterDrawer ? (
        <div className="absolute left-3 z-50 w-[330px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-140px)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-1 shadow-2xl" style={{ top: topOffset }}>
          <FilterBar f={f} setF={setF} opsi={opsi.data} onClose={() => setFilterDrawer(false)} />
        </div>
      ) : null}
    </div>
  )
}

function DeltaBadge({ val, label }: { val: number | null; label: string }) {
  if (val === null || val === undefined) {
    return <span className="text-[9.5px] font-semibold text-slate-400">stabil</span>
  }
  const up = val > 0
  const down = val < 0
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9.5px] font-extrabold tabular-nums ${up ? 'bg-red-50 text-red-700' : down ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
      title={`Perubahan vs ${label} sebelumnya`}
    >
      {up ? '▲' : down ? '▼' : '■'} {Math.abs(val).toFixed(1)}%
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT PANEL: MEJA ANALISA EPIDEMIOLOGI (FIELD EPIDEMIOLOGIST WORKBENCH)
// ─────────────────────────────────────────────────────────────────────────────
function EpidemiologyPanel({
  data,
  f,
  metric,
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
  tab,
  setTab,
}: {
  data: SpasialResp | null
  f: AFilter
  metric: Metric
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
  tab: EpidTab
  setTab: (t: EpidTab) => void
}) {
  const [det, setDet] = useState<any | null>(null)
  const [detLoading, setDetLoading] = useState(false)

  useEffect(() => {
    if (!selected || !data) {
      setDet(null)
      return
    }
    let alive = true
    setDetLoading(true)
    const qs = apiQuery(f, { target_level: data.level, target_id: selected.id })
    peFetch(`/api/v1/analisa/spasial/wilayah?${qs}`)
      .then((d) => alive && setDet(d))
      .catch(() => alive && setDet({ error: true }))
      .finally(() => alive && setDetLoading(false))
    return () => { alive = false }
  }, [selected?.id, data?.level, f]) // eslint-disable-line react-hooks/exhaustive-deps

  // Composite Epidemiological Risk Scoring for Wilayah Triage
  const triagedAreas = useMemo(() => {
    const areas = data?.wilayah || []
    return [...areas]
      .filter((a) => a.kasus > 0 || a.alert > 0 || a.klb > 0)
      .map((a) => {
        // Risk score: KLB weight + Alert weight + Weekly acceleration + CFR severity + Case burden
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
    const p = new URLSearchParams()
    p.set('sumber', f.sumber)
    p.set('startYear', String(f.sy))
    p.set('startWeek', String(f.sw))
    p.set('endYear', String(f.ey))
    p.set('endWeek', String(f.ew))
    if (data?.level === 'provinsi' && selected) p.set('prov', String(selected.id))
    else if (f.prov) p.set('prov', f.prov)
    if (data?.level === 'kabkota' && selected) p.set('kab', String(selected.id))
    return `/dashboard/analisa?${p.toString()}`
  }, [f, data?.level, selected])

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white/96 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-900 px-3.5 py-2.5 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Stethoscope className="h-4 w-4 text-teal-400 shrink-0" />
            <p className="truncate text-xs font-black tracking-tight">
              Meja Analisa Epidemiologi
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-teal-500/20 border border-teal-400/30 px-2 py-0.5 text-[9.5px] font-extrabold text-teal-300">
            {selected ? selected.nama : data?.meta?.breadcrumb?.slice(-1)[0]?.label || 'Nasional'}
          </span>
        </div>

        {/* 4 Tabs */}
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-slate-800 p-0.5 text-[10.5px] font-extrabold">
          {([
            ['sitrep', 'Kajian Epid'],
            ['wilayah', `Triase (${triagedAreas.length})`],
            ['fasyankes', `Unit (${nf(titik.length)})`],
            ['detail', 'Inspeksi'],
          ] as [EpidTab, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg py-1 text-center transition ${tab === k ? 'bg-teal-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3 text-[11px] text-slate-700">
        {!data ? (
          <div className="flex items-center gap-2 py-8 justify-center text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span>Menyusun telaah epidemiologi…</span>
          </div>
        ) : null}

        {/* ── TAB 1: KAJIAN EPIDEMIOLOGI (SITREP & INTERPRETASI AHLI) ── */}
        {data && tab === 'sitrep' ? (
          <>
            {/* 1. Fase & Kecepatan Transmisi */}
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Activity className="h-3.5 w-3.5 text-teal-600" />
                  1. Dinamika & Fase Transmisi
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-black ${
                  epiSynthesis.phaseTone === 'red' ? 'bg-red-100 text-red-700' :
                  epiSynthesis.phaseTone === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                  epiSynthesis.phaseTone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {epiSynthesis.phaseLabel}
                </span>
              </div>

              <p className="leading-relaxed text-slate-700">
                Pada periode <b>{data.meta.periode_label}</b> tercatat <b>{nf(r?.kasus)} kasus</b> dan <b>{nf(r?.kematian)} kematian</b> (CFR <b>{fmtPct(r?.cfr)}</b>; 95% CI {fmtPct(r?.cfr_ci_low)}–{fmtPct(r?.cfr_ci_high)}).
                {epiSynthesis.peakWeek ? (
                  <> Puncak insidensi terjadi pada <b>{epiSynthesis.peakWeek.label}</b> dengan <b>{nf(epiSynthesis.peakWeek.kasus)} kasus</b> ({nf(epiSynthesis.peakWeek.alert)} sinyal).</>
                ) : null}
              </p>

              {/* Kurva Epidemi Mingguan */}
              <div className="mt-2">
                <EpidCurve rows={r?.kurva || []} />
              </div>

              <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-50 p-2 text-center border border-slate-100">
                <div>
                  <p className="text-[9.5px] font-bold text-slate-400">{data.minggu_lalu}</p>
                  <b className="text-xs text-slate-800 tabular-nums">{nf(r?.minggu_lalu)}</b>
                </div>
                <div>
                  <p className="text-[9.5px] font-bold text-slate-400">{data.minggu_ini}</p>
                  <b className="text-xs text-slate-800 tabular-nums">{nf(r?.minggu_ini)}</b>
                </div>
                <div>
                  <p className="text-[9.5px] font-bold text-slate-400">Kecepatan Mingguan</p>
                  <b className={`text-xs tabular-nums ${(r?.chg_minggu ?? 0) > 0 ? 'text-red-600' : (r?.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {fmtPct(r?.chg_minggu, true)}
                  </b>
                </div>
              </div>
            </section>

            {/* 2. Pola Klaster Spasial & Konsentrasi Pareto */}
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Target className="h-3.5 w-3.5 text-indigo-600" />
                  2. Pola Spasial & Konsentrasi Pareto
                </span>
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-indigo-700">
                  {epiSynthesis.top3Share >= 50 ? 'Pola Terfokus (Klaster)' : 'Pola Menyebar (Difus)'}
                </span>
              </div>
              <p className="leading-relaxed text-slate-700">
                Transmisi mencakup <b>{epiSynthesis.affectedAreas} dari {epiSynthesis.totalAreas} {lvLabel.toLowerCase()}</b> ({fmtPct(epiSynthesis.spreadPct)}).
                Sebanyak <b>{fmtPct(epiSynthesis.top3Share)}</b> beban kasus terkonsentrasi pada 3 wilayah teratas:
              </p>
              {epiSynthesis.top3.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {epiSynthesis.top3.map((a, idx) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPickArea(a)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1 text-left hover:border-teal-300 hover:bg-teal-50/40"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-black text-white">
                          {idx + 1}
                        </span>
                        <b className="truncate text-slate-800">{a.nama}</b>
                      </span>
                      <span className="shrink-0 text-[10.5px] tabular-nums">
                        <b>{nf(a.kasus)}</b> kasus ({fmtPct(a.porsi)})
                        {a.klb > 0 ? <span className="ml-1 font-extrabold text-red-600">· {a.klb} KLB</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {/* 3. Evaluasi Kinerja Surveilans & Bottleneck Respons */}
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  3. Kinerja Verifikasi & Respons SKDR
                </span>
                <span className="text-[9.5px] font-bold text-slate-400">Target Kemenkes ≥80%</span>
              </div>

              <div className="grid grid-cols-2 gap-2 my-1.5">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">Verifikasi Alert</span>
                    <b className={`text-xs tabular-nums ${(triageStats.verifRate ?? 100) >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {triageStats.verifRate != null ? fmtPct(triageStats.verifRate) : '–'}
                    </b>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <b>{nf(triageStats.unverifiedUnits)}</b> fasyankes memiliki alert belum diverifikasi.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">Respons ≤24 Jam</span>
                    <b className={`text-xs tabular-nums ${(triageStats.resp24Rate ?? 100) >= 80 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {triageStats.resp24Rate != null ? fmtPct(triageStats.resp24Rate) : '–'}
                    </b>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <b>{nf(triageStats.late24Units)}</b> fasyankes merespons melewati 24 jam.
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {triageStats.unverifiedUnits > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectTriage(triage === 'unverified' ? 'all' : 'unverified')}
                    className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-extrabold transition ${triage === 'unverified' ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100'}`}
                  >
                    {triage === 'unverified' ? '✓ Menampilkan Belum Verif' : `Isolasi ${nf(triageStats.unverifiedUnits)} Unit Blm Verif`}
                  </button>
                ) : null}
                {triageStats.late24Units > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectTriage(triage === 'late24' ? 'all' : 'late24')}
                    className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-extrabold transition ${triage === 'late24' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                  >
                    {triage === 'late24' ? '✓ Menampilkan Respons >24J' : `Isolasi ${nf(triageStats.late24Units)} Unit >24 Jam`}
                  </button>
                ) : null}
              </div>
            </section>

            {/* 4. Rekomendasi Tindak Lanjut Epidemiologi Lapangan */}
            <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-teal-900">
                <Sparkles className="h-3.5 w-3.5 text-teal-700" />
                4. Rekomendasi Epidemiologi (PHEOC)
              </p>
              <ul className="space-y-1.5 text-[11px] leading-snug text-teal-950">
                {(r?.klb || 0) > 0 ? (
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
                    <span>
                      <b>Prioritas KLB:</b> Kerahkan Tim Gerak Cepat (TGC) untuk penyelidikan epidemiologi (PE) lapangan dan pengambilan spesimen pada <b>{nf(triageStats.klbUnits)} unit pelapor</b> berstatus KLB ({nf(r?.klb)} kejadian).
                    </span>
                  </li>
                ) : null}
                {triageStats.unverifiedUnits > 0 ? (
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                    <span>
                      <b>Akselerasi Verifikasi Sinyal:</b> Lakukan umpan balik segera ke Dinas Kesehatan Kab/Kota untuk memverifikasi <b>{nf(triageStats.unverifiedSignals)} sinyal belum terverifikasi</b> di {nf(triageStats.unverifiedUnits)} fasyankes dalam jendela &lt;24 jam.
                    </span>
                  </li>
                ) : null}
                {epiSynthesis.top3.length > 0 ? (
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600" />
                    <span>
                      <b>Intervensi Terfokus (Pareto):</b> Fokuskan pengendalian faktor risiko dan audit kesiapan logistik di <b>{epiSynthesis.top3.map((x) => x.nama).join(', ')}</b> yang menyumbang {fmtPct(epiSynthesis.top3Share)} total beban kasus.
                    </span>
                  </li>
                ) : null}
                {(r?.cfr ?? 0) >= 1.0 ? (
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />
                    <span>
                      <b>Audit Klinis & Rujukan:</b> CFR mencapai <b>{fmtPct(r?.cfr)}</b> ({nf(r?.kematian)} kematian); evaluasi tata laksana kasus dan kecepatan rujukan dari Puskesmas ke RS rujukan.
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700" />
                    <span>
                      <b>Surveilans Aktif & Kelengkapan Koordinat:</b> Pertahankan kelengkapan laporan mingguan dan lengkapi koordinat presisi pada {nf(r?.unit_kabkota)} unit yang masih menggunakan titik pusat kab/kota.
                    </span>
                  </li>
                )}
              </ul>
            </section>
          </>
        ) : null}

        {/* ── TAB 2: TRIASE RISIKO WILAYAH ── */}
        {data && tab === 'wilayah' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs" data-testid="tv-triase-wilayah">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Peringkat Risiko Komposit {lvLabel}
              </p>
              <span className="text-[10px] font-semibold text-slate-400">Klik untuk fokus / perbesar</span>
            </div>

            {triagedAreas.length > 0 ? (
              <ol className="space-y-1.5">
                {triagedAreas.map(({ a, zone }, idx) => {
                  const zoneBadge =
                    zone === 'merah'
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : zone === 'oranye'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  const zoneLabel = zone === 'merah' ? 'Zona Merah' : zone === 'oranye' ? 'Waspada' : 'Terkendali'

                  return (
                    <li key={a.id} className={`rounded-xl border p-2 transition ${selected?.id === a.id ? 'border-teal-600 bg-teal-50/40' : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100/70'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onPickArea(a)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <span className="w-4 text-right font-black text-slate-400 tabular-nums">{idx + 1}</span>
                          <span className="truncate font-extrabold text-slate-900">{a.nama}</span>
                        </button>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${zoneBadge}`}>
                          {zoneLabel}
                        </span>
                      </div>

                      <div className="mt-1.5 ml-5 grid grid-cols-4 gap-1 text-[10px] tabular-nums">
                        <div>
                          <span className="text-slate-400 block">Kasus</span>
                          <b className="text-slate-800">{nf(a.kasus)}</b>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Δ Minggu</span>
                          <b className={(a.chg_minggu ?? 0) > 0 ? 'text-red-600' : (a.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                            {fmtPct(a.chg_minggu, true)}
                          </b>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Alert</span>
                          <b className="text-amber-700">{nf(a.alert)}</b>
                        </div>
                        <div>
                          <span className="text-slate-400 block">KLB / CFR</span>
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
                            className="rounded-md bg-teal-700/10 px-2 py-0.5 text-[10px] font-extrabold text-teal-800 hover:bg-teal-700 hover:text-white transition"
                          >
                            Buka Kab/Kota Provinsi Ini →
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

        {/* ── TAB 3: HOTSPOT FASYANKES PELAPOR ── */}
        {data && tab === 'fasyankes' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs" data-testid="tv-hotspot-fasyankes">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Fasyankes Prioritas Investigasi
                </p>
                <p className="text-[10px] text-slate-400">
                  Menampilkan {topUnits.length} teratas dari {nf(titik.length)} titik ({nf(allTitikCount)} total)
                </p>
              </div>
              {triage !== 'all' ? (
                <button
                  type="button"
                  onClick={() => onSelectTriage('all')}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                >
                  Reset Triase
                </button>
              ) : null}
            </div>

            {topUnits.length > 0 ? (
              <ol className="space-y-1.5">
                {topUnits.map((t, i) => {
                  const late = t.rn > t.r
                  return (
                    <li key={t.idx}>
                      <button
                        type="button"
                        onClick={() => onPickTitik(t)}
                        className="w-full rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-left hover:border-teal-300 hover:bg-teal-50/40 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="w-4 text-right font-black text-slate-400 tabular-nums">{i + 1}</span>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS[t.st]?.color }} />
                            <span className="truncate font-extrabold text-slate-900">{t.unit || '(Unit Tanpa Nama)'}</span>
                          </span>
                          <b className="shrink-0 text-xs font-black text-slate-900 tabular-nums">{nf(t.k)} kasus</b>
                        </div>
                        <div className="mt-1 ml-5 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                          <span>{[t.kec ? `Kec. ${t.kec}` : null, t.kab].filter(Boolean).join(' · ')}</span>
                          {t.b > 0 ? <span className="rounded bg-red-100 px-1.5 font-extrabold text-red-700">{t.b} KLB</span> : null}
                          {t.a > 0 ? <span className="rounded bg-amber-100 px-1.5 font-bold text-amber-800">{nf(t.a)} sinyal</span> : null}
                          {late ? <span className="rounded bg-slate-900 px-1.5 font-bold text-amber-300">Respons &gt;24J</span> : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-slate-500">Tidak ada titik fasyankes untuk filter triase ini.</p>
            )}
          </section>
        ) : null}

        {/* ── TAB 4: INSPEKSI DETAIL WILAYAH ── */}
        {data && tab === 'detail' ? (
          !selected ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-slate-500">
              <Compass className="mx-auto mb-1.5 h-6 w-6 text-teal-600" />
              <p className="font-bold text-slate-700">Belum Ada Wilayah Dipilih</p>
              <p className="mt-1 text-[10.5px]">
                Klik salah satu provinsi/kab-kota langsung pada peta atau dari tab <b>Triase</b> untuk melihat profil penyakit teratas, sub-wilayah, fasyankes, dan kurva epidemi wilayah tersebut.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-xl border-2 border-teal-700/25 bg-white p-3 shadow-2xs" data-testid="tv-spasial-detail">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">{lvLabel} Terpilih</p>
                    <h3 className="text-sm font-black text-slate-900">{selected.nama}</h3>
                  </div>
                  {data.level === 'provinsi' ? (
                    <button
                      type="button"
                      onClick={() => onDrill(selected)}
                      className="rounded-lg bg-teal-700 px-2.5 py-1 text-[10.5px] font-bold text-white hover:bg-teal-800"
                    >
                      Perbesar ke Kab/Kota →
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">Kasus</p>
                    <b className="text-sm font-black text-slate-900 tabular-nums">{nf(selected.kasus)}</b>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">Kematian</p>
                    <b className="text-sm font-black text-rose-700 tabular-nums">{nf(selected.kematian)}</b>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">CFR</p>
                    <b className="text-sm font-black text-slate-900 tabular-nums">{selected.kasus ? fmtPct(selected.cfr) : '–'}</b>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">vs M Lalu</p>
                    <b className={`text-xs font-black tabular-nums ${(selected.chg_minggu ?? 0) > 0 ? 'text-red-600' : (selected.chg_minggu ?? 0) < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {fmtPct(selected.chg_minggu, true)}
                    </b>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">Alert / Sinyal</p>
                    <b className="text-xs font-black text-amber-700 tabular-nums">{nf(selected.alert)}</b>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-1.5">
                    <p className="text-[10px] text-slate-400">KLB Aktif</p>
                    <b className={`text-xs font-black tabular-nums ${selected.klb ? 'text-red-600' : 'text-slate-700'}`}>{nf(selected.klb)}</b>
                  </div>
                </div>

                {detLoading ? (
                  <p className="mt-2 flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    Memuat rincian epidemiologi wilayah…
                  </p>
                ) : null}
                {det?.kurva ? (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Kurva Epidemi Wilayah</p>
                    <EpidCurve rows={det.kurva} h={105} />
                  </div>
                ) : null}
                <Link
                  href={matriksHref}
                  className="mt-2.5 block rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-center text-[11px] font-extrabold text-teal-800 hover:bg-teal-100"
                >
                  Buka Analisis Lengkap Wilayah Ini di Matriks Analisa →
                </Link>
              </section>

              {det?.penyakit ? <MiniTable title="Sindrom / Penyakit Teratas" rows={det.penyakit} /> : null}
              {det?.sub ? <MiniTable title={`${det.sub_label} Teratas`} rows={det.sub} /> : null}
              {det?.unit ? <MiniTable title="Fasyankes Pelapor Teratas" rows={det.unit} /> : null}
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
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</p>
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
              <td className="max-w-[165px] truncate py-1 font-medium text-slate-800" title={r.nama}>
                {r.nama}
                {r.kecamatan ? <span className="text-slate-400"> · {r.kecamatan}</span> : null}
              </td>
              <td className="text-right font-bold tabular-nums">{nf(r.kasus)}</td>
              <td className="text-right tabular-nums text-rose-700">{nf(r.kematian)}</td>
              <td className="text-right tabular-nums">
                {nf(r.alert)}
                {r.klb ? <span className="ml-0.5 font-extrabold text-red-600">·{r.klb} KLB</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

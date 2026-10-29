'use client'
// PR 027: Dasbor Zoonosis Lite. One screen (no long scroll) for the 4 zoonoses that have a Form PE:
// period / disease / province filter bar, 4 disease cards (Alert SKDR cases, deaths, CFR with Wilson 95% CI, weekly
// sparkline), the spread map (SpatialOutbreakMap, markers follow the period) and a compact CFR comparison.
// The page title lives in the app header (AppShell → DashboardHeader title/subtitle), not in the body.
// Data comes only from existing read-only endpoints, always with an explicit epi-week period (+ optional province_id):
//   /api/v1/alert-skdr (same CFR source as AlertCfr), /api/v1/epicurve (weekly per disease),
//   /api/v1/public-dashboard (map markers), /api/v1/dashboard/executive (EBS signals + Kasus PE per group).
// Map context layers (toggle chips on the map, off by default): GBIF waterbirds (context for Flu Burung) and
// iNaturalist mosquitoes ("konteks vektor": not a vector of these 4 diseases), both keyless public APIs, same period.
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bird, Bug, CalendarDays, Loader2, MapPin, RefreshCw, RotateCcw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchFrom } from '@/lib/api'
import { fetchAlertSkdr, nf, pf, toQs, type AlertSkdr, type Ci } from '@/lib/alert-skdr'
import { getCurrentEpiWeek, getEpiWeekDateRange, getWeeksInYear } from '@/lib/epi-week'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fetchProvinces, type MasterProvince } from '@/lib/skdr-api'
import { fetchGbifWaterbirds, fetchInatMosquitoes } from '@/lib/zoonosis-intel'
import { ErrorState, SkeletonMap } from '@/components/ui/Skeleton'
import type { IntelLoaders } from '@/components/AseanMap'
import type { MapLayerStatus, PublicDashboard } from '@/types'

const SpatialOutbreakMap = dynamic(() => import('@/components/SpatialOutbreakMap'), { ssr: false })

/** The 4 zoonoses with a Form PE (dashboard_executive groups). `name` = master_diseases.name as returned by the APIs. */
export const LITE_DISEASES = [
  { code: 'ANTHRAX', name: 'Antraks', label: 'Antraks', color: '#6B6766' },
  { code: 'RABIES', name: 'Rabies', label: 'GHPR/Rabies', color: '#00594F' },
  { code: 'LEPTOSPIROSIS', name: 'Leptospirosis', label: 'Leptospirosis', color: '#8A9A00' },
  { code: 'AVIAN_INFLUENZA', name: 'Flu Burung', label: 'Flu Burung (AI)', color: '#00A3AD' },
] as const
const INDONESIA_BOUNDS: [number, number, number, number] = [95, -11, 141, 6]
type LiteCode = (typeof LITE_DISEASES)[number]['code']
const ALL_CODES = LITE_DISEASES.map((d) => d.code) as LiteCode[]
/** Map pin colours of the context layers (AseanMap pinIcon "bird" / "vector"). */
const BIRD_COLOR = '#0d9488', MOSQ_COLOR = '#f59e0b'

type Period = { year: number; startWeek: number; endWeek: number }
type Preset = 4 | 8 | 12 | 'ytd'
type Epi = { weeks: { year: number; week: number; label: string }[]; groups: { label: string; cases: number[]; deaths: number[] }[] }
type ExecCard = { code: string; label: string; color: string; disease_code?: string | null; ebs: { alerts: number }[]; individual: { total: number } }
type Exec = { cards: ExecCard[] }
type LayerKey = 'wildlife' | 'vectors'
type LayerInfo = { state?: MapLayerStatus['state']; shown?: number; total?: number }

const cfrTone = (pct: number | null | undefined) => (pct == null ? '#94a3b8' : pct >= 5 ? '#dc2626' : pct >= 1 ? '#d97706' : '#0f766e')
const ciText = (c?: Ci) => (c && c.den > 0 && c.ci_low != null && c.ci_high != null ? `${pf(c.ci_low)}–${pf(c.ci_high)}` : '—')
const hexA = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length || values.every((v) => !v)) return <div className="h-8 w-full rounded bg-slate-50" />
  const w = 120, h = 32, max = Math.max(...values, 1)
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden data-testid="lite-spark">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity={0.15} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function ZoonosisLite() {
  const { t, locale } = useTranslation()
  const now = getCurrentEpiWeek()
  const lastWeek = useCallback((year: number) => (year === now.year ? now.week : getWeeksInYear(year)), [now.year, now.week])
  const ytd = useCallback((year: number): Period => ({ year, startWeek: 1, endWeek: lastWeek(year) }), [lastWeek])
  const [period, setPeriod] = useState<Period>(() => ytd(now.year))
  const [sel, setSel] = useState<LiteCode[]>(ALL_CODES)
  const [prov, setProv] = useState<number | null>(null)
  const [provinces, setProvinces] = useState<MasterProvince[]>([])
  const [layers, setLayers] = useState({ birds: false, mosq: false })
  const [layerInfo, setLayerInfo] = useState<Record<LayerKey, LayerInfo>>({ wildlife: {}, vectors: {} })
  const [tick, setTick] = useState(0)
  const [alert, setAlert] = useState<AlertSkdr | null>(null)
  const [epi, setEpi] = useState<Epi | null>(null)
  const [map, setMap] = useState<PublicDashboard | null>(null)
  const [exec, setExec] = useState<Exec | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchProvinces().then((ps) => setProvinces([...ps].sort((a, b) => a.name.localeCompare(b.name, 'id')))).catch(() => setProvinces([])) }, [])

  // Always send the explicit period (public-dashboard 500s without it for kategori queries).
  const qs = useMemo(() => toQs({
    kategori: 'ZOONOSIS',
    disease: ALL_CODES.join(','),
    start_year: period.year, start_week: period.startWeek, end_year: period.year, end_week: period.endWeek, year: period.year,
    province_id: prov ?? undefined,
  }), [period, prov])

  const load = useCallback((fresh: boolean) => {
    let alive = true
    setLoading(true); setErr(null)
    Promise.allSettled([
      fetchAlertSkdr(qs, fresh).then((x) => alive && setAlert(x)),
      fetchFrom<Epi>(`/api/v1/epicurve?${qs}`).then((x) => alive && setEpi(x)),
      fetchFrom<PublicDashboard>(`/api/v1/public-dashboard?${qs}`).then((x) => alive && setMap(x)),
      fetchFrom<Exec>(`/api/v1/dashboard/executive?${qs}`).then((x) => alive && setExec(x)),
    ]).then((rs) => {
      if (!alive) return
      const bad = rs.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      if (bad) setErr(String(bad.reason?.message || bad.reason))
      setLoading(false)
    })
    return () => { alive = false }
  }, [qs])
  useEffect(() => load(tick > 0), [load, tick])

  const rows = useMemo(() => LITE_DISEASES.map((d) => {
    const a = alert?.by_disease.find((x) => x.disease === d.name)
    const cfr = alert?.cfr.by_disease.find((x) => x.disease === d.name)?.cfr
    const g = epi?.groups.find((x) => x.label === d.name)
    const card = exec?.cards.find((c) => c.disease_code === d.code)
    return {
      ...d,
      color: card?.color || d.color,
      label: card?.label || d.label,
      cases: a?.cases ?? 0, deaths: a?.deaths ?? 0, alerts: a?.alerts ?? 0, cfr,
      spark: g?.cases ?? [],
      ebs: card ? card.ebs.reduce((s, e) => s + (e.alerts || 0), 0) : null,
      pe: card ? card.individual.total : null,
    }
  }), [alert, epi, exec])

  const allSel = sel.length === ALL_CODES.length
  const isSel = (c: LiteCode) => sel.includes(c)
  const toggleDisease = (c: LiteCode) => setSel((s) => (s.includes(c) ? (s.length === 1 ? ALL_CODES : s.filter((x) => x !== c)) : ALL_CODES.filter((x) => x === c || s.includes(x))))
  const soloDisease = (c: LiteCode) => setSel((s) => (s.length === 1 && s[0] === c ? ALL_CODES : [c]))
  // Flu Burung alone → show the bird context layer (it is the relevant one).
  useEffect(() => { if (sel.length === 1 && sel[0] === 'AVIAN_INFLUENZA') setLayers((l) => ({ ...l, birds: true })) }, [sel])

  const selNames = useMemo(() => new Set(LITE_DISEASES.filter((d) => sel.includes(d.code)).map((d) => d.name as string)), [sel])
  const locations = useMemo(() => (map?.locations ?? []).filter((l) => selNames.has(l.disease)), [map?.locations, selNames])
  const countries = useMemo(() => [{ name: 'Indonesia', cases: map?.kpis.cases ?? 0, deaths: map?.kpis.deaths ?? 0 }], [map?.kpis.cases, map?.kpis.deaths])
  // Whole Indonesia by default; a disease subset or a province fits to its markers (padded, never tighter than ~4°),
  // a province without markers to its centroid. AseanMap re-frames to the country outline whenever its data settles
  // (and that framing clips Papua on narrow maps), so the all-Indonesia fit is applied once the map data has settled.
  const [settled, setSettled] = useState(false)
  // Short screens (1366x768): the legend starts folded so it does not cover Java / Bali markers.
  const [tallScreen, setTallScreen] = useState(true)
  useEffect(() => {
    const f = () => setTallScreen(window.innerHeight >= 900)
    f(); window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  useEffect(() => {
    setSettled(false)
    if (!map) return
    const id = window.setTimeout(() => setSettled(true), 2500)
    return () => window.clearTimeout(id)
  }, [map])
  const provRow = prov != null ? provinces.find((p) => p.id === prov) : undefined
  const fitTo = useMemo<[number, number, number, number] | null>(() => {
    // AseanMap re-frames to the country outline when new map data settles, so every fit waits for that.
    if (!settled) return null
    const narrow = !allSel || prov != null
    const pts = narrow ? locations.map((l) => [Number(l.longitude), Number(l.latitude)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) : []
    if (!pts.length && provRow?.longitude != null && provRow?.latitude != null) {
      const x = Number(provRow.longitude), y = Number(provRow.latitude)
      return [x - 2.5, y - 2.5, x + 2.5, y + 2.5]
    }
    if (!pts.length) return INDONESIA_BOUNDS
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const hw = Math.max(2, (Math.max(...xs) - Math.min(...xs)) / 2 + 1), hh = Math.max(2, (Math.max(...ys) - Math.min(...ys)) / 2 + 1)
    return [cx - hw, cy - hh, cx + hw, cy + hh]
  }, [locations, allSel, prov, provRow, settled])
  const markerPeriod = map?.filters?.start_date && map?.filters?.end_date ? { start: map.filters.start_date, end: map.filters.end_date } : null

  // Period dates for the public context layers (end clamped to today).
  const range = useMemo(() => {
    const s = getEpiWeekDateRange(period.year, period.startWeek, locale === 'en' ? 'en' : 'id')
    const e = getEpiWeekDateRange(period.year, period.endWeek, locale === 'en' ? 'en' : 'id')
    const today = new Date().toISOString().slice(0, 10)
    return { start: s.startIso, end: e.endIso > today ? today : e.endIso, label: `${s.startFormatted} – ${e.endFormatted}` }
  }, [period, locale])
  const setInfo = useCallback((k: LayerKey, v: LayerInfo) => setLayerInfo((p) => ({ ...p, [k]: { ...p[k], ...v } })), [])
  const intelLoaders = useMemo<IntelLoaders>(() => ({
    key: `${range.start}_${range.end}`,
    wildlife: (signal) => fetchGbifWaterbirds(range.start, range.end, signal).then((r) => { setInfo('wildlife', { shown: r.results.length, total: r.count }); return r }),
    vectors: (signal) => fetchInatMosquitoes(range.start, range.end, signal).then((r) => { setInfo('vectors', { shown: r.sightings.length, total: r.total }); return r }),
  }), [range.start, range.end, setInfo])
  const intelOverride = useMemo(() => ({ wildlife: layers.birds, vectors: layers.mosq }), [layers])
  const statusRef = useRef(setInfo); statusRef.current = setInfo
  const onLayerStatus = useCallback((key: string, s: MapLayerStatus) => {
    if (key === 'wildlife' || key === 'vectors') statusRef.current(key, { state: s.state })
  }, [])

  const cfrData = rows.map((r) => {
    const c = r.cfr
    const pct = c && c.den > 0 ? c.pct ?? 0 : 0
    const lo = c?.ci_low ?? pct, hi = c?.ci_high ?? pct
    return { name: r.name, code: r.code, pct, err: [Math.max(0, pct - lo), Math.max(0, hi - pct)], den: c?.den ?? 0, num: c?.num ?? 0, ci: ciText(c), color: cfrTone(c && c.den > 0 ? c.pct : null) }
  })
  const cfrMax = Math.max(1, ...cfrData.map((x) => (x.den ? x.pct + x.err[1] : 0)))
  const overall = alert?.cfr.overall

  const years = useMemo(() => {
    const ys = new Set<number>([now.year, now.year - 1, now.year - 2, ...(map?.available_years ?? [])])
    return [...ys].filter((y) => y <= now.year).sort((a, b) => b - a)
  }, [map?.available_years, now.year])
  const maxWeek = lastWeek(period.year)
  const weekOpts = Array.from({ length: maxWeek }, (_, i) => i + 1)
  const applyPreset = (p: Preset, year = period.year) => {
    const end = lastWeek(year)
    setPeriod(p === 'ytd' ? ytd(year) : { year, startWeek: Math.max(1, end - p + 1), endWeek: end })
  }
  const activePreset: Preset | null = period.endWeek !== maxWeek ? null
    : period.startWeek === 1 ? 'ytd' : ([4, 8, 12] as const).find((n) => period.startWeek === Math.max(1, maxWeek - n + 1)) ?? null
  const setYear = (year: number) => applyPreset(activePreset ?? 'ytd', year)
  const isDefault = activePreset === 'ytd' && period.year === now.year && allSel && prov == null && !layers.birds && !layers.mosq
  const reset = () => { setPeriod(ytd(now.year)); setSel(ALL_CODES); setProv(null); setLayers({ birds: false, mosq: false }) }

  const seg = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-bold transition ${on ? 'bg-white text-primary shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`
  const bare = 'cursor-pointer appearance-none bg-transparent pr-0.5 text-[11px] font-bold text-slate-800 focus:outline-none'
  const layerChip = (on: boolean, color: string, info: LayerInfo) => ({
    className: `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur transition ${on ? 'text-white' : 'border-slate-300 bg-white/95 text-slate-700 hover:border-slate-400'}`,
    style: on ? { background: color, borderColor: color } : undefined,
    count: on && info.state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" />
      : on && info.shown != null ? <span className="rounded-full bg-white/25 px-1.5 text-[10px]">{nf(info.shown)}{info.total != null && info.total > info.shown ? `/${nf(info.total)}` : ''}</span>
      : on && (info.state === 'error' || info.state === 'timeout') ? <span className="text-[10px]">!</span> : null,
  })
  const birdChip = layerChip(layers.birds, BIRD_COLOR, layerInfo.wildlife)
  const mosqChip = layerChip(layers.mosq, MOSQ_COLOR, layerInfo.vectors)
  const legendExtra = layers.birds || layers.mosq ? (
    <div className="mt-0.5 flex max-w-[300px] flex-col gap-0.5 border-t border-slate-200 pt-1" data-testid="lite-layer-legend">
      {layers.birds ? <span className="flex items-start gap-1.5"><Bird className="mt-0.5 h-3 w-3 shrink-0" style={{ color: BIRD_COLOR }} /><span>{t('skdr.lite.legendBirds')}</span></span> : null}
      {layers.mosq ? <span className="flex items-start gap-1.5"><Bug className="mt-0.5 h-3 w-3 shrink-0" style={{ color: MOSQ_COLOR }} /><span>{t('skdr.lite.legendMosq')}</span></span> : null}
      <span className="font-normal text-slate-500">{t('skdr.lite.layerPeriod', { period: range.label })}</span>
    </div>
  ) : null

  return (
    <div className="flex w-full flex-col gap-2 bg-page px-4 sm:px-6 lg:h-[calc(100vh-128px)] lg:min-h-[560px] lg:px-6" data-testid="zoonosis-lite">
      {/* filter bar: period (presets + year/week range) · disease chips · province · reset/refresh */}
      <section className="skdr-card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5" data-testid="lite-filters">
        <div className="flex items-center gap-1.5" data-testid="lite-period">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          <div className="flex items-center rounded-full bg-slate-100 p-0.5" role="group" aria-label={t('skdr.lite.period')}>
            {([4, 8, 12, 'ytd'] as Preset[]).map((p) => (
              <button key={String(p)} type="button" onClick={() => applyPreset(p)} aria-pressed={activePreset === p} className={seg(activePreset === p)} data-testid={`lite-preset-${p}`}>
                {p === 'ytd' ? 'YTD' : t('skdr.lite.lastWeeks', { n: p })}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1" title={range.label}>
            <select aria-label={t('skdr.lite.year')} className={bare} value={period.year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="h-3 w-px bg-slate-200" />
            <select aria-label={t('skdr.lite.weekFrom')} className={bare} value={period.startWeek} onChange={(e) => { const w = Number(e.target.value); setPeriod({ ...period, startWeek: w, endWeek: Math.max(w, period.endWeek) }) }}>
              {weekOpts.map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
            </select>
            <span className="text-[11px] text-slate-400">–</span>
            <select aria-label={t('skdr.lite.weekTo')} className={bare} value={period.endWeek} onChange={(e) => { const w = Number(e.target.value); setPeriod({ ...period, endWeek: w, startWeek: Math.min(w, period.startWeek) }) }}>
              {weekOpts.map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
            </select>
          </div>
          <span className="hidden text-[10px] text-slate-500 2xl:inline">{range.label}</span>
        </div>
        <span className="hidden h-5 w-px bg-slate-200 md:block" />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('skdr.lite.disease')} data-testid="lite-chips">
          <button type="button" onClick={() => setSel(ALL_CODES)} aria-pressed={allSel}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${allSel ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{t('skdr.lite.all')}</button>
          {rows.map((d) => {
            const on = isSel(d.code)
            return (
              <button key={d.code} type="button" onClick={() => toggleDisease(d.code)} aria-pressed={on} data-testid={`lite-chip-${d.code}`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${on ? 'text-slate-900' : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'}`}
                style={on ? { background: hexA(d.color, 0.12), borderColor: d.color } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: d.color, opacity: on ? 1 : 0.35 }} />
                {d.name}
              </button>
            )
          })}
        </div>
        <span className="hidden h-5 w-px bg-slate-200 md:block" />
        <label className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          <select aria-label={t('skdr.lite.province')} className={`${bare} max-w-[170px]`} value={prov ?? ''} onChange={(e) => setProv(e.target.value ? Number(e.target.value) : null)} data-testid="lite-province">
            <option value="">{t('skdr.lite.allProvinces')}</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={reset} disabled={isDefault} data-testid="lite-reset"
            className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-red-300 hover:text-red-600 disabled:cursor-default disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-700">
            <RotateCcw className="h-3 w-3" />{t('skdr.lite.reset')}
          </button>
          <button type="button" onClick={() => setTick((x) => x + 1)} title={t('skdr.lite.refresh')} aria-label={t('skdr.lite.refresh')}
            className="rounded-full border border-blue-200 bg-blue-50 p-1.5 text-primary hover:bg-blue-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>
      {err ? <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} className="py-2" /> : null}

      {/* 4 disease cards; a click shows only that disease (again = all) */}
      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="lite-cards">
        {rows.map((r) => {
          const active = !allSel && isSel(r.code)
          return (
            <button key={r.code} type="button" onClick={() => soloDisease(r.code)} aria-pressed={active} data-testid={`lite-card-${r.code}`}
              className={`skdr-card relative overflow-hidden px-3 pb-1.5 pt-2.5 text-left transition hover:shadow-md ${active ? 'ring-2 ring-offset-1' : !allSel ? 'opacity-60' : ''}`}
              style={active ? { ['--tw-ring-color' as string]: r.color } : undefined}>
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: r.color }} />
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-black text-slate-900">{r.label}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('skdr.lite.sourceAlert')}</span>
              </div>
              <div className="mt-1 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-3">
                <div><div className="text-[10px] font-bold uppercase text-slate-500">{t('skdr.lite.cases')}</div><div className="text-lg font-black leading-tight text-slate-900">{alert ? nf(r.cases) : '…'}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-slate-500">{t('skdr.lite.deaths')}</div><div className="text-lg font-black leading-tight text-red-600">{alert ? nf(r.deaths) : '…'}</div></div>
                <div><div className="text-[10px] font-bold uppercase text-slate-500">CFR</div>
                  <div className="text-lg font-black leading-tight" style={{ color: cfrTone(r.cfr && r.cfr.den > 0 ? r.cfr.pct : null) }}>{r.cfr && r.cfr.den > 0 ? pf(r.cfr.pct) : '—'}</div>
                  <div className="truncate text-[9px] leading-tight text-slate-500" title={`${t('skdr.lite.ci')} ${ciText(r.cfr)}`}>({ciText(r.cfr)})</div>
                </div>
              </div>
              <div className="truncate text-[10px] text-slate-500">{r.ebs !== null ? t('skdr.lite.ebsPe', { ebs: nf(r.ebs), pe: nf(r.pe) }) : '\u00a0'}</div>
              <Sparkline values={r.spark} color={r.color} />
            </button>
          )
        })}
      </section>

      {/* map + CFR comparison */}
      <section className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="skdr-card relative min-h-[380px] overflow-hidden p-0 lg:min-h-0" data-testid="lite-map">
          {/* context layers (public APIs, same period): birds ↔ Flu Burung; mosquitoes = vector context only */}
          <div className="absolute left-12 top-3 z-20 flex flex-wrap items-center gap-1" data-testid="lite-layers">
            <button type="button" onClick={() => setLayers((l) => ({ ...l, birds: !l.birds }))} aria-pressed={layers.birds} title={t('skdr.lite.layerBirdsHint')}
              className={birdChip.className} style={birdChip.style} data-testid="lite-layer-birds">
              <Bird className="h-3.5 w-3.5" style={layers.birds ? undefined : { color: BIRD_COLOR }} />{t('skdr.lite.layerBirds')}{birdChip.count}
            </button>
            <button type="button" onClick={() => setLayers((l) => ({ ...l, mosq: !l.mosq }))} aria-pressed={layers.mosq} title={t('skdr.lite.layerMosqHint')}
              className={mosqChip.className} style={mosqChip.style} data-testid="lite-layer-mosq">
              <Bug className="h-3.5 w-3.5" style={layers.mosq ? undefined : { color: MOSQ_COLOR }} />{t('skdr.lite.layerMosq')}
              <span className={`rounded px-1 text-[9px] font-black uppercase tracking-wide ${layers.mosq ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>{t('skdr.lite.vectorContext')}</span>{mosqChip.count}
            </button>
          </div>
          {map ? (
            <SpatialOutbreakMap
              countries={countries}
              locations={locations}
              highlightCountry="Indonesia"
              boundaryScope="indonesia"
              initialCenter={[118, -2.5]}
              initialZoom={3.9}
              fitTo={fitTo}
              sourceMode="all"
              markerPeriod={markerPeriod}
              intelOverride={intelOverride}
              intelLoaders={intelLoaders}
              legendExtra={legendExtra}
              legendCollapsible
              legendDefaultOpen={tallScreen}
              onLayerStatus={onLayerStatus}
            />
          ) : <SkeletonMap height={420} />}
        </div>
        <div className="skdr-card flex min-h-[320px] flex-col p-3 lg:min-h-0" data-testid="lite-cfr">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">{t('skdr.lite.cfrTitle')}</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('skdr.lite.sourceAlert')}</span>
          </div>
          <div className="relative min-h-[150px] flex-1">
            {alert && cfrData.some((x) => x.den > 0) ? (
              <div className="absolute inset-0"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={cfrData} layout="vertical" margin={{ top: 6, left: 0, right: 14, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, Math.ceil(cfrMax)]} tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }} interval={0} />
                  <Tooltip formatter={(_v: any, _k: any, p: any) => [`${pf(p.payload.pct)} (${nf(p.payload.num)}/${nf(p.payload.den)}), ${t('skdr.lite.ci')} ${p.payload.ci}`, 'CFR']} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pct" isAnimationActive={false} maxBarSize={26} minPointSize={3} radius={[0, 4, 4, 0]}>
                    {cfrData.map((x) => <Cell key={x.code} fill={x.color} opacity={isSel(x.code) ? 1 : 0.35} />)}
                    <ErrorBar dataKey="err" width={8} strokeWidth={2} stroke="#0f172a" direction="x" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer></div>
            ) : <div className="flex h-full items-center justify-center text-xs text-slate-500">{alert ? t('skdr.lite.cfrEmpty') : '…'}</div>}
          </div>
          <table className="mt-1 w-full text-[11px]" data-testid="lite-cfr-table">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="text-left">{t('skdr.lite.disease')}</th><th className="text-right">{t('skdr.lite.deathsCases')}</th><th className="text-right">CFR</th><th className="text-right">{t('skdr.lite.ci')}</th></tr></thead>
            <tbody>
              {cfrData.map((x) => (
                <tr key={x.code} className="border-t border-slate-100"><td className="py-0.5 font-bold">{x.name}</td><td className="text-right">{nf(x.num)}/{nf(x.den)}</td><td className="text-right font-bold" style={{ color: x.color }}>{x.den ? pf(x.pct) : '—'}</td><td className="text-right text-slate-600">{x.ci}</td></tr>
              ))}
              <tr className="border-t border-slate-300 font-black"><td className="py-0.5">{t('skdr.lite.total4')}</td><td className="text-right">{nf(overall?.num)}/{nf(overall?.den)}</td><td className="text-right">{overall && overall.den ? pf(overall.pct) : '—'}</td><td className="text-right font-normal text-slate-600">{ciText(overall)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">{t('skdr.lite.note')}</p>
        </div>
      </section>
    </div>
  )
}

'use client'
// PR 027: Dasbor Zoonosis Lite. One screen (no long scroll) for the 4 zoonoses that have a Form PE:
// one horizontal filter bar (Sumber data · Penyakit · Provinsi · Kab/Kota · Periode Minggu Epi + presets · Terapkan · Reset,
// same look as SkdrFilterBar), 4 disease cards (Alert SKDR cases, deaths, CFR with Wilson 95% CI, weekly sparkline),
// the spread map (SpatialOutbreakMap) with a floating layer panel and a compact CFR comparison.
// The page title lives in the app header (AppShell → DashboardHeader title/subtitle), not in the body.
// Data comes only from existing read-only endpoints, always with an explicit epi-week period (+ optional province_id /
// kabkota_id): /api/v1/alert-skdr (same CFR source as AlertCfr), /api/v1/epicurve (weekly per disease),
// /api/v1/public-dashboard (map markers, honours source=ebs|pe), /api/v1/dashboard/executive (EBS signals + Kasus PE).
// Map layer panel (top-left of the map): Kasus EBS/PE markers, region shading, GBIF waterbirds (context for Flu Burung)
// and iNaturalist mosquitoes ("konteks vektor": not a vector of these 4 diseases), each with a toggle, opacity and count.
// The two public layers follow the period and the province / kab-kota filter (bounding box from the master kab/kota points).
// Map: hover a province = cases / deaths / CFR, click = zoom + filter by that province, fullscreen and reset-view buttons.
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ReactNode } from 'react'
import { Bird, Bug, CalendarDays, ChevronDown, ChevronUp, Layers, Loader2, Map as MapIcon, MapPin, Maximize2, Minimize2, RotateCcw, Shapes, Crosshair } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchFrom } from '@/lib/api'
import { fetchAlertSkdr, nf, pf, toQs, type AlertSkdr, type Ci } from '@/lib/alert-skdr'
import { getCurrentEpiWeek, getEpiWeekDateRange, getWeeksInYear } from '@/lib/epi-week'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fetchProvinces, type MasterKabkota, type MasterProvince } from '@/lib/skdr-api'
import { fetchGbifWaterbirds, fetchInatMosquitoes, type BBox } from '@/lib/zoonosis-intel'
import { ErrorState, SkeletonMap } from '@/components/ui/Skeleton'
import MultiSelect from '@/components/filters/MultiSelect'
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

type Period = { startYear: number; startWeek: number; endYear: number; endWeek: number }
type Src = 'all' | 'ebs' | 'pe'
/** Everything the filter bar edits; `draft` is what the bar shows, `applied` is what the data is loaded for. */
type Filters = { src: Src; sel: LiteCode[]; provs: number[]; kabs: number[]; period: Period }
type Opacity = { markers: number; regions: number; wildlife: number; vectors: number }
type Preset = 4 | 8 | 12 | 'ytd'
type Epi = { weeks: { year: number; week: number; label: string }[]; groups: { label: string; cases: number[]; deaths: number[] }[] }
type ExecCard = { code: string; label: string; color: string; disease_code?: string | null; ebs: { alerts: number }[]; individual: { total: number } }
type Exec = { cards: ExecCard[] }
type LayerKey = 'wildlife' | 'vectors'
type LayerInfo = { state?: MapLayerStatus['state']; shown?: number; total?: number }

const cfrTone = (pct: number | null | undefined) => (pct == null ? '#94a3b8' : pct >= 5 ? '#dc2626' : pct >= 1 ? '#d97706' : '#0f766e')
const ciText = (c?: Ci) => (c && c.den > 0 && c.ci_low != null && c.ci_high != null ? `${pf(c.ci_low)}–${pf(c.ci_high)}` : '—')
const hexA = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`
/** Same field styles as SkdrFilterBar (main dashboard filter). */
const box = 'relative h-10 min-w-0 rounded-lg border border-line bg-card hover:border-brand-300 focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100 transition shadow-2xs'
const selCls = 'h-full w-full truncate appearance-none bg-transparent px-3 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8 disabled:cursor-not-allowed disabled:text-slate-400'
const mini = 'h-8 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-transparent px-0.5 text-center text-xs font-bold text-slate-800 outline-none hover:bg-white'
const chev = 'pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400'
const lbl = 'flex h-4 items-center gap-1 truncate text-[10.5px] font-extrabold uppercase leading-none tracking-wider text-slate-700'
const norm = (x?: string | null) => String(x ?? '').toLowerCase().replace(/^(provinsi|kabupaten|kab\.?|kota)\s+/, '').replace(/[^a-z0-9]/g, '')
/** Week arithmetic across years (MMWR weeks per year vary 52/53). */
const shiftWeek = (year: number, week: number, by: number) => {
  let y = year, w = week + by
  while (w < 1) { y -= 1; w += getWeeksInYear(y) }
  while (w > getWeeksInYear(y)) { w -= getWeeksInYear(y); y += 1 }
  return { year: y, week: w }
}
const cmpWeek = (ay: number, aw: number, by: number, bw: number) => (ay - by) * 100 + (aw - bw)
const sameF = (a: Filters, b: Filters) => a.src === b.src && a.provs.join() === b.provs.join() && a.kabs.join() === b.kabs.join() && a.sel.join() === b.sel.join()
  && a.period.startYear === b.period.startYear && a.period.startWeek === b.period.startWeek && a.period.endYear === b.period.endYear && a.period.endWeek === b.period.endWeek

/** Small on/off switch for the layer panel. */
function Switch({ on, onChange, color, label, testid }: { on: boolean; onChange: () => void; color: string; label: string; testid?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} data-testid={testid}
      className="relative h-4 w-7 shrink-0 rounded-full transition" style={{ background: on ? color : '#cbd5e1' }}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
    </button>
  )
}

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
  const ytd = useCallback((year: number): Period => ({ startYear: year, startWeek: 1, endYear: year, endWeek: year === now.year ? now.week : getWeeksInYear(year) }), [now.year, now.week])
  const defaults = useCallback((): Filters => ({ src: 'all', sel: ALL_CODES, provs: [], kabs: [], period: ytd(now.year) }), [ytd, now.year])
  const [draft, setDraft] = useState<Filters>(defaults)
  const [applied, setApplied] = useState<Filters>(defaults)
  const { period, sel, provs, kabs, src } = applied
  const setD = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }))
  /** Commit straight away (presets, Sumber pill, card / map clicks). */
  const commit = (patch: Partial<Filters>) => { setDraft((d) => ({ ...d, ...patch })); setApplied((a) => ({ ...a, ...patch })) }
  const setSel = (fn: (s: LiteCode[]) => LiteCode[]) => commit({ sel: fn(applied.sel) })
  const [provinces, setProvinces] = useState<MasterProvince[]>([])
  const [allKabs, setAllKabs] = useState<MasterKabkota[]>([])
  const [layers, setLayers] = useState({ markers: true, regions: true, birds: false, mosq: false })
  const [opacity, setOpacity] = useState<Opacity>({ markers: 1, regions: 1, wildlife: 0.9, vectors: 0.9 })
  const [resetSignal, setResetSignal] = useState(0)
  const [fs, setFs] = useState(false)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const [layerInfo, setLayerInfo] = useState<Record<LayerKey, LayerInfo>>({ wildlife: {}, vectors: {} })
  const [tick, setTick] = useState(0)
  const [alert, setAlert] = useState<AlertSkdr | null>(null)
  const [epi, setEpi] = useState<Epi | null>(null)
  const [map, setMap] = useState<PublicDashboard | null>(null)
  const [exec, setExec] = useState<Exec | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchProvinces().then((ps) => setProvinces([...ps].sort((a, b) => a.name.localeCompare(b.name, 'id')))).catch(() => setProvinces([])) }, [])
  // All kab/kota once (same source as the main filter bar); the Kab/Kota dropdown is limited to the checked provinces.
  useEffect(() => { fetchFrom<MasterKabkota[]>('/api/v1/master/kabkota').then((ks) => setAllKabs([...(ks || [])].sort((a, b) => a.name.localeCompare(b.name, 'id')))).catch(() => setAllKabs([])) }, [])

  // Always send the explicit period (public-dashboard 500s without it for kategori queries).
  const qs = useMemo(() => toQs({
    kategori: 'ZOONOSIS',
    disease: ALL_CODES.join(','),
    start_year: period.startYear, start_week: period.startWeek, end_year: period.endYear, end_week: period.endWeek, year: period.endYear,
    province_id: provs.length ? provs.join(',') : undefined,
    kabkota_id: kabs.length ? kabs.join(',') : undefined,
  }), [period, provs, kabs])

  const load = useCallback((fresh: boolean) => {
    let alive = true
    setLoading(true); setErr(null)
    Promise.allSettled([
      fetchAlertSkdr(qs, fresh).then((x) => alive && setAlert(x)),
      fetchFrom<Epi>(`/api/v1/epicurve?${qs}`).then((x) => alive && setEpi(x)),
      fetchFrom<PublicDashboard>(`/api/v1/public-dashboard?${qs}${src !== 'all' ? `&source=${src}` : ''}`).then((x) => alive && setMap(x)),
      fetchFrom<Exec>(`/api/v1/dashboard/executive?${qs}`).then((x) => alive && setExec(x)),
    ]).then((rs) => {
      if (!alive) return
      const bad = rs.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      if (bad) setErr(String(bad.reason?.message || bad.reason))
      setLoading(false)
    })
    return () => { alive = false }
  }, [qs, src])
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
  const soloDisease = (c: LiteCode) => setSel((s) => (s.length === 1 && s[0] === c ? ALL_CODES : [c]))
  // Flu Burung alone → show the bird context layer (it is the relevant one).
  useEffect(() => { if (sel.length === 1 && sel[0] === 'AVIAN_INFLUENZA') setLayers((l) => ({ ...l, birds: true })) }, [sel])

  const selNames = useMemo(() => new Set(LITE_DISEASES.filter((d) => sel.includes(d.code)).map((d) => d.name as string)), [sel])
  const locations = useMemo(() => (map?.locations ?? []).filter((l) => selNames.has(l.disease)
    && (src === 'all' || String((l as { source_type?: string | null }).source_type ?? '').toLowerCase() === src)), [map?.locations, selNames, src])
  const locSplit = useMemo(() => {
    let ebs = 0, pe = 0, cases = 0
    for (const l of locations) {
      if (String((l as { source_type?: string | null }).source_type ?? '').toUpperCase() === 'PE') pe += 1; else ebs += 1
      cases += Number(l.cases) || 0
    }
    return { ebs, pe, cases }
  }, [locations])
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
  const provRows = useMemo(() => provinces.filter((p) => provs.includes(p.id)), [provinces, provs])
  const kabRows = useMemo(() => allKabs.filter((k) => kabs.includes(k.id)), [allKabs, kabs])
  const areaKabs = useMemo(() => (provs.length ? allKabs.filter((k) => provs.includes(Number(k.province_id))) : []), [allKabs, provs])
  const ptsOf = (xs: { longitude?: unknown; latitude?: unknown }[]) => xs.map((k) => [Number(k.longitude), Number(k.latitude)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (x || y))
  const boxOf = (pts: number[][], pad: number): BBox => {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
  }
  // Area box of the province / kab-kota filter (master kab/kota points, padded) for the public context layers.
  const areaBox = useMemo<BBox | null>(() => {
    const kp = ptsOf(kabRows)
    if (kp.length) return boxOf(kp, 0.45)
    if (!provs.length) return null
    const ap = ptsOf(areaKabs)
    if (ap.length) return boxOf(ap, 0.35)
    const pp = ptsOf(provRows)
    return pp.length ? boxOf(pp, 2) : null
  }, [kabRows, areaKabs, provRows, provs.length])
  const fitTo = useMemo<[number, number, number, number] | null>(() => {
    // AseanMap re-frames to the country outline when new map data settles, so every fit waits for that.
    if (!settled) return null
    const kp = ptsOf(kabRows)
    if (kp.length) return boxOf(kp, 0.8)
    const narrow = !allSel || provs.length > 0 || src !== 'all'
    const pts = narrow ? locations.map((l) => [Number(l.longitude), Number(l.latitude)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) : []
    const pp = ptsOf(provRows)
    if (!pts.length && pp.length) return boxOf(pp, 2.5)
    if (!pts.length) return INDONESIA_BOUNDS
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const hw = Math.max(2, (Math.max(...xs) - Math.min(...xs)) / 2 + 1), hh = Math.max(2, (Math.max(...ys) - Math.min(...ys)) / 2 + 1)
    return [cx - hw, cy - hh, cx + hw, cy + hh]
  }, [locations, allSel, provs.length, provRows, kabRows, src, settled])
  const markerPeriod = map?.filters?.start_date && map?.filters?.end_date ? { start: map.filters.start_date, end: map.filters.end_date } : null

  // Period dates for the public context layers (end clamped to today).
  const range = useMemo(() => {
    const s = getEpiWeekDateRange(period.startYear, period.startWeek, locale === 'en' ? 'en' : 'id')
    const e = getEpiWeekDateRange(period.endYear, period.endWeek, locale === 'en' ? 'en' : 'id')
    const today = new Date().toISOString().slice(0, 10)
    return { start: s.startIso, end: e.endIso > today ? today : e.endIso, label: `${s.startFormatted} – ${e.endFormatted}` }
  }, [period, locale])
  const setInfo = useCallback((k: LayerKey, v: LayerInfo) => setLayerInfo((p) => ({ ...p, [k]: { ...p[k], ...v } })), [])
  const intelLoaders = useMemo<IntelLoaders>(() => ({
    key: `${range.start}_${range.end}_${areaBox ? areaBox.map((v) => v.toFixed(2)).join(',') : 'ID'}`,
    wildlife: (signal) => fetchGbifWaterbirds(range.start, range.end, signal, 900, areaBox).then((r) => { setInfo('wildlife', { shown: r.results.length, total: r.count }); return r }),
    vectors: (signal) => fetchInatMosquitoes(range.start, range.end, signal, 400, areaBox).then((r) => { setInfo('vectors', { shown: r.sightings.length, total: r.total }); return r }),
  }), [range.start, range.end, areaBox, setInfo])
  const areaName = kabRows.length === 1 ? kabRows[0].name : kabRows.length ? t('skdr.filter.nKabkota', { n: kabRows.length })
    : provRows.length === 1 ? provRows[0].name : provRows.length ? t('skdr.filter.nProvinces', { n: provRows.length }) : null
  const intelOverride = useMemo(() => ({ wildlife: layers.birds, vectors: layers.mosq }), [layers])
  const statusRef = useRef(setInfo); statusRef.current = setInfo
  const onLayerStatus = useCallback((key: string, s: MapLayerStatus) => {
    if (key === 'wildlife' || key === 'vectors') statusRef.current(key, { state: s.state })
  }, [])

  const cfrData = rows.map((r) => {
    const c = r.cfr
    const pct = c && c.den > 0 ? c.pct ?? 0 : 0
    const lo = c?.ci_low ?? pct, hi = c?.ci_high ?? pct
    return { name: r.name, code: r.code, pct, err: [Math.max(0, pct - lo), Math.max(1e-6, hi - pct)], den: c?.den ?? 0, num: c?.num ?? 0, ci: ciText(c), color: cfrTone(c && c.den > 0 ? c.pct : null) }
  })
  // (upper whisker ≥ 1e-6: Recharts ErrorBar keys its lines by coordinates, so a zero-width bar would repeat a key)
  const cfrMax = Math.max(1, ...cfrData.map((x) => (x.den ? x.pct + x.err[1] : 0)))
  const overall = alert?.cfr.overall

  const years = useMemo(() => {
    const ys = new Set<number>([now.year, now.year - 1, now.year - 2, ...(map?.available_years ?? [])])
    return [...ys].filter((y) => y <= now.year).sort((a, b) => b - a)
  }, [map?.available_years, now.year])
  const lastWeek = (year: number) => (year === now.year ? now.week : getWeeksInYear(year))
  const weekOpts = (year: number) => Array.from({ length: lastWeek(year) }, (_, i) => i + 1)
  // Presets end at the current epi week (cross-year when needed) and are applied straight away.
  const presetPeriod = (p: Preset): Period => {
    if (p === 'ytd') return ytd(now.year)
    const st = shiftWeek(now.year, now.week, -(p - 1))
    return { startYear: st.year, startWeek: st.week, endYear: now.year, endWeek: now.week }
  }
  const samePeriod = (a: Period, b: Period) => a.startYear === b.startYear && a.startWeek === b.startWeek && a.endYear === b.endYear && a.endWeek === b.endWeek
  const presetOf = (pd: Period): Preset | null => ([4, 8, 12, 'ytd'] as Preset[]).find((p) => samePeriod(presetPeriod(p), pd)) ?? null
  const activePreset = presetOf(draft.period)
  // Start / end pickers: keep start ≤ end by pulling the other side along.
  const setStart = (year: number, week: number) => {
    const w = Math.min(week, lastWeek(year))
    const e = cmpWeek(year, w, draft.period.endYear, draft.period.endWeek) > 0 ? { endYear: year, endWeek: w } : {}
    setD({ period: { ...draft.period, startYear: year, startWeek: w, ...e } })
  }
  const setEnd = (year: number, week: number) => {
    const w = Math.min(week, lastWeek(year))
    const st = cmpWeek(draft.period.startYear, draft.period.startWeek, year, w) > 0 ? { startYear: year, startWeek: w } : {}
    setD({ period: { ...draft.period, endYear: year, endWeek: w, ...st } })
  }
  const dirty = !sameF(draft, applied)
  const isDefault = sameF(draft, defaults()) && sameF(applied, defaults()) && !layers.birds && !layers.mosq && layers.markers
  const apply = () => { if (dirty) setApplied(draft); else setTick((x) => x + 1) }
  const reset = () => { const d = defaults(); setDraft(d); setApplied(d); setLayers({ markers: true, regions: true, birds: false, mosq: false }); setResetSignal((x) => x + 1) }

  // Map: click a province = zoom (AseanMap drills down) + filter by it; click a kab/kota inside the filtered province = filter by it.
  const onSelectRegion = useCallback((r: { name: string; level: number; code: string | null }) => {
    if (r.level <= 1) {
      const p = provinces.find((x) => norm(x.name) === norm(r.name)) || provinces.find((x) => r.code && String(x.code) === String(r.code))
      if (p) { setDraft((d) => ({ ...d, provs: [p.id], kabs: [] })); setApplied((a) => ({ ...a, provs: [p.id], kabs: [] })) }
      return
    }
    if (r.level === 2) {
      const pool = areaKabs.length ? areaKabs : allKabs
      const k = pool.find((x) => norm(x.name) === norm(r.name)) || pool.find((x) => r.code && (String(x.code) === String(r.code) || String(x.kemendagri_code) === String(r.code)))
      if (k) { setDraft((d) => ({ ...d, kabs: [k.id] })); setApplied((a) => ({ ...a, kabs: [k.id] })) }
    }
  }, [provinces, areaKabs, allKabs])
  const resetView = () => { setResetSignal((x) => x + 1); if (provs.length || kabs.length) commit({ provs: [], kabs: [] }) }
  // Multi-select options (same MultiSelect as the main dashboard filter bar: search, select all, count summary).
  const ms = { searchPlaceholder: t('skdr.filter.search'), selectAllLabel: t('skdr.filter.selectAll'), clearLabel: t('skdr.filter.clear'), emptyLabel: t('skdr.filter.noOptions') }
  const diseaseOpts = useMemo(() => LITE_DISEASES.map((d) => ({ value: d.code as string, label: d.name as string })), [])
  const provinceOpts = useMemo(() => provinces.map((p) => ({ value: String(p.id), label: p.name })), [provinces])
  const kabOpts = useMemo(() => {
    const ps = new Set(draft.provs)
    return allKabs.filter((k) => ps.size === 0 || ps.has(Number(k.province_id)))
      .sort((a, b) => String(a.province_name ?? '').localeCompare(String(b.province_name ?? ''), 'id') || a.name.localeCompare(b.name, 'id'))
      .map((k) => ({ value: String(k.id), label: k.name, group: k.province_name ?? undefined }))
  }, [allKabs, draft.provs])
  const setProvs = (ids: number[]) => {
    // unchecking a province drops its kab/kota from the selection
    const ps = new Set(ids)
    const keep = draft.kabs.filter((id) => { const k = allKabs.find((x) => x.id === id); return !k || ps.size === 0 || ps.has(Number(k.province_id)) })
    setD({ provs: ids, kabs: keep })
  }
  useEffect(() => {
    const f = () => setFs(document.fullscreenElement === mapBoxRef.current && !!mapBoxRef.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void mapBoxRef.current?.requestFullscreen?.()
  }
  const layerOpacity = useMemo(() => ({ markers: opacity.markers, regions: opacity.regions, wildlife: opacity.wildlife, vectors: opacity.vectors }), [opacity])
  const intelCount = (info: LayerInfo, on: boolean) => !on ? <span className="text-slate-400">—</span>
    : info.state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
    : info.state === 'error' || info.state === 'timeout' ? <span className="text-red-600">!</span>
    : info.shown != null ? <span>{nf(info.shown)}{info.total != null && info.total > info.shown ? <span className="font-normal text-slate-400">/{nf(info.total)}</span> : null}</span> : <span className="text-slate-400">…</span>
  const pctTxt = (v: number) => `${Math.round(v * 100)}%`

  // Layer controls live only in the map's "Pengaturan Peta & Lapisan" drawer; the map keeps a read-only legend.
  type LayerKey4 = 'markers' | 'regions' | 'birds' | 'mosq'
  const layerRows: { k: LayerKey4; op: keyof Opacity; color: string; label: string; icon: ReactNode; count: ReactNode; sub: string; hint: string; testid: string }[] = [
    { k: 'markers', op: 'markers', color: '#EA580C', label: t('skdr.lite.layerCases'),
      icon: <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full border border-white bg-ebs shadow" /><span className="h-2 w-2 rotate-45 bg-pe" /></span>,
      count: <span>{nf(locations.length)}</span>,
      sub: t('skdr.lite.layerCasesSub', { ebs: nf(locSplit.ebs), pe: nf(locSplit.pe) }), hint: t('skdr.lite.layerCasesHint'), testid: 'lite-layer-cases' },
    { k: 'regions', op: 'regions', color: '#0f766e', label: t('skdr.lite.layerRegions'),
      icon: <Shapes className="h-3.5 w-3.5 text-teal-700" />, count: null, sub: t('skdr.lite.layerRegionsSub'), hint: t('skdr.lite.layerRegionsSub'), testid: 'lite-layer-regions' },
    { k: 'birds', op: 'wildlife', color: BIRD_COLOR, label: t('skdr.lite.layerBirds'),
      icon: <Bird className="h-3.5 w-3.5" style={{ color: BIRD_COLOR }} />, count: intelCount(layerInfo.wildlife, layers.birds),
      sub: t('skdr.lite.layerBirdsSub'), hint: t('skdr.lite.layerBirdsHint'), testid: 'lite-layer-birds' },
    { k: 'mosq', op: 'vectors', color: MOSQ_COLOR, label: t('skdr.lite.layerMosq'),
      icon: <Bug className="h-3.5 w-3.5" style={{ color: MOSQ_COLOR }} />, count: intelCount(layerInfo.vectors, layers.mosq),
      sub: t('skdr.lite.layerMosqSub'), hint: t('skdr.lite.layerMosqHint'), testid: 'lite-layer-mosq' },
  ]
  const layerPanel = (
    <div className="flex flex-col gap-1.5 text-[11px]" data-testid="lite-layers">
      {layerRows.map((r) => {
        const on = layers[r.k]
        return (
          <div key={r.k} className={`rounded-lg px-2 py-1.5 ${on ? 'bg-white ring-1 ring-slate-200' : 'bg-slate-50'}`} title={r.hint} data-testid={r.testid}>
            <div className="flex items-center gap-2">
              <span className="flex w-5 justify-center">{r.icon}</span>
              <span className={`min-w-0 flex-1 truncate text-xs font-bold ${on ? 'text-slate-800' : 'text-slate-500'}`}>{r.label}</span>
              {r.count != null ? <span className="text-[11px] font-black tabular-nums text-slate-800">{r.count}</span> : null}
              <Switch on={on} color={r.color} label={r.label} testid={`${r.testid}-switch`} onChange={() => setLayers((l) => ({ ...l, [r.k]: !l[r.k] }))} />
            </div>
            <div className="ml-7 text-[10px] leading-tight text-slate-500">{r.sub}</div>
            {on ? (
              <div className="ml-7 mt-1 flex items-center gap-2">
                <span className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">{t('skdr.lite.opacity')}</span>
                <input type="range" min={0.15} max={1} step={0.05} value={opacity[r.op]} aria-label={`${t('skdr.lite.opacity')} ${r.label}`}
                  onChange={(e) => setOpacity((o) => ({ ...o, [r.op]: Number(e.target.value) }))}
                  className="h-1 flex-1 cursor-pointer" style={{ accentColor: r.color }} data-testid={`${r.testid}-opacity`} />
                <span className="w-8 text-right text-[10px] tabular-nums text-slate-500">{pctTxt(opacity[r.op])}</span>
              </div>
            ) : null}
          </div>
        )
      })}
      <div className="rounded-lg bg-brand-50/60 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
        {t('skdr.lite.layerPeriodArea', { period: range.label, area: areaName ?? t('skdr.lite.allProvinces') })}
        <span className="mt-0.5 block text-slate-500">{t('skdr.lite.mapHint')}</span>
      </div>
    </div>
  )
  // read-only legend rows for the public context layers (colour + count), only when switched on
  const legendExtra = (layers.birds || layers.mosq) ? (
    <span className="flex flex-col gap-0.5" data-testid="lite-legend-context">
      {layers.birds ? <span className="flex items-center gap-1.5"><Bird className="h-3 w-3" style={{ color: BIRD_COLOR }} />{t('skdr.lite.layerBirds')} <b className="tabular-nums">{intelCount(layerInfo.wildlife, true)}</b></span> : null}
      {layers.mosq ? <span className="flex items-center gap-1.5"><Bug className="h-3 w-3" style={{ color: MOSQ_COLOR }} />{t('skdr.lite.layerMosq')} <b className="tabular-nums">{intelCount(layerInfo.vectors, true)}</b></span> : null}
    </span>
  ) : null

  return (
    <div className="flex w-full flex-col gap-2 bg-page px-4 sm:px-6 lg:h-[calc(100vh-128px)] lg:min-h-[560px] lg:px-6" data-testid="zoonosis-lite">
      {/* filter bar (SkdrFilterBar look), one auto-layout row (wraps only on narrow screens): Penyakit · Provinsi · Kab/Kota · Periode (Minggu Epi) + presets · Terapkan · Reset */}
      <section className="skdr-card px-3 pb-2.5 pt-2" data-testid="lite-filters">
        <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2">
          <div className="flex min-w-[9rem] flex-[1_1_10rem] flex-col gap-1">
            <label htmlFor="lite-disease" className={lbl}><Bug className="h-3 w-3 text-primary" />{t('skdr.lite.disease')}</label>
            <MultiSelect id="lite-disease" options={diseaseOpts} value={draft.sel.length === ALL_CODES.length ? [] : draft.sel} {...ms}
              onChange={(v) => setD({ sel: v.length ? ALL_CODES.filter((c) => v.includes(c)) : ALL_CODES })}
              allLabel={t('skdr.lite.allDiseases')} countLabel={(n) => t('skdr.filter.nDiseases', { n })} />
          </div>
          <div className="flex min-w-[9rem] flex-[1_1_10rem] flex-col gap-1">
            <label htmlFor="lite-province" className={lbl}><MapIcon className="h-3 w-3 text-primary" />{t('skdr.lite.province')}</label>
            <MultiSelect id="lite-province" options={provinceOpts} value={draft.provs.map(String)} {...ms}
              onChange={(v) => setProvs(v.map(Number))}
              allLabel={t('skdr.filter.allProvincesMs')} countLabel={(n) => t('skdr.filter.nProvinces', { n })} />
          </div>
          <div className="flex min-w-[9rem] flex-[1_1_10rem] flex-col gap-1">
            <label htmlFor="lite-kabkota" className={lbl}><MapPin className="h-3 w-3 text-primary" />{t('skdr.lite.kabkota')}</label>
            <MultiSelect id="lite-kabkota" options={kabOpts} value={draft.kabs.map(String)} {...ms}
              onChange={(v) => setD({ kabs: v.map(Number) })}
              allLabel={t('skdr.lite.allKabkotaShort')} countLabel={(n) => t('skdr.filter.nKabkota', { n })} />
          </div>
          <div className="flex min-w-[17rem] flex-[1.6_1_19rem] flex-col gap-1" data-testid="lite-period">
            <div className="flex h-4 items-center justify-between gap-2">
              <span className={lbl}><CalendarDays className="h-3 w-3 text-primary" />{t('skdr.lite.periodEpi')}</span>
              <div className="flex items-center gap-0.5" role="group" aria-label={t('skdr.lite.period')}>
                {([4, 8, 12, 'ytd'] as Preset[]).map((p) => (
                  <button key={String(p)} type="button" onClick={() => commit({ period: presetPeriod(p) })} aria-pressed={activePreset === p} data-testid={`lite-preset-${p}`}
                    className={`h-4 whitespace-nowrap rounded px-1 text-[9.5px] font-extrabold uppercase leading-none tracking-wide transition ${activePreset === p ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-primary'}`}>
                    {p === 'ytd' ? 'YTD' : t('skdr.lite.lastWeeks', { n: p })}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${box} flex items-center gap-0.5 px-1`} title={range.label}>
              <select aria-label={t('skdr.lite.weekFrom')} className={mini} value={draft.period.startWeek} onChange={(e) => setStart(draft.period.startYear, Number(e.target.value))} data-testid="lite-week-start">
                {weekOpts(draft.period.startYear).map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
              </select>
              <select aria-label={t('skdr.lite.yearFrom')} className={mini} value={draft.period.startYear} onChange={(e) => setStart(Number(e.target.value), draft.period.startWeek)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="px-0.5 text-xs font-bold text-slate-400">–</span>
              <select aria-label={t('skdr.lite.weekTo')} className={mini} value={draft.period.endWeek} onChange={(e) => setEnd(draft.period.endYear, Number(e.target.value))} data-testid="lite-week-end">
                {weekOpts(draft.period.endYear).map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
              </select>
              <select aria-label={t('skdr.lite.yearTo')} className={mini} value={draft.period.endYear} onChange={(e) => setEnd(Number(e.target.value), draft.period.endWeek)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-[0_0_auto] items-end gap-1.5 max-sm:flex-[1_1_100%]">
            <button type="button" onClick={apply} disabled={loading} data-testid="lite-apply" aria-busy={loading}
              className={`relative flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-primary-dark bg-primary px-4 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-80 sm:flex-none ${dirty ? 'ring-2 ring-brand-200 ring-offset-1' : ''}`}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {loading ? t('skdr.lite.loading') : t('skdr.lite.apply')}
              {dirty && !loading ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" aria-hidden /> : null}
            </button>
            <button type="button" onClick={reset} disabled={isDefault} title={t('skdr.lite.resetTitle')} aria-label={t('skdr.lite.resetTitle')} data-testid="lite-reset"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-red-600 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-slate-100 disabled:hover:text-slate-600">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
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
        <div ref={mapBoxRef} className={`skdr-card relative min-h-[380px] overflow-hidden p-0 lg:min-h-0 ${fs ? 'rounded-none bg-white' : ''}`} data-testid="lite-map">
          {/* map toolbar: fullscreen + reset view (zoom +/- stays bottom-right in the map) */}
          <div className="absolute right-4 top-16 z-20 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-md backdrop-blur">
            <button type="button" onClick={toggleFs} title={fs ? t('skdr.lite.exitFullscreen') : t('skdr.lite.fullscreen')} aria-label={fs ? t('skdr.lite.exitFullscreen') : t('skdr.lite.fullscreen')} data-testid="lite-fullscreen"
              className="flex h-8 w-8 items-center justify-center text-slate-700 hover:bg-brand-50 hover:text-primary">
              {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button type="button" onClick={resetView} title={t('skdr.lite.resetView')} aria-label={t('skdr.lite.resetView')} data-testid="lite-reset-view"
              className="flex h-8 w-8 items-center justify-center border-t border-slate-200 text-slate-700 hover:bg-brand-50 hover:text-primary">
              <Crosshair className="h-4 w-4" />
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
              sourceMode={src}
              markerPeriod={markerPeriod}
              intelOverride={intelOverride}
              intelLoaders={intelLoaders}
              markersOverride={layers.markers}
              layerOpacity={layerOpacity}
              regionHoverStats
              onSelectRegion={onSelectRegion}
              resetSignal={resetSignal}
              legendCollapsible
              legendDefaultOpen={tallScreen}
              legendExtra={legendExtra}
              layerPanel={layerPanel}
              layerPanelTitle={t('skdr.lite.layersTitle')}
              hideBuiltinLayers
              choroplethOverride={layers.regions}
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

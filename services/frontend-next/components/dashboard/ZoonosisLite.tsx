'use client'
// PR 027: Dasbor Zoonosis Lite. One screen (no long scroll) for the 4 zoonoses that have a Form PE:
// header + period filter, 4 disease cards (Alert SKDR cases, deaths, CFR with Wilson 95% CI, weekly sparkline),
// the spread map (SpatialOutbreakMap, markers follow the period) and a compact CFR comparison.
// Data comes only from existing read-only endpoints, always with an explicit epi-week period:
//   /api/v1/alert-skdr (same CFR source as AlertCfr), /api/v1/epicurve (weekly per disease),
//   /api/v1/public-dashboard (map markers), /api/v1/dashboard/executive (EBS signals + Kasus PE per group).
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchFrom } from '@/lib/api'
import { fetchAlertSkdr, nf, pf, toQs, type AlertSkdr, type Ci } from '@/lib/alert-skdr'
import { getCurrentEpiWeek, getWeeksInYear } from '@/lib/epi-week'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ErrorState, SkeletonMap } from '@/components/ui/Skeleton'
import type { PublicDashboard } from '@/types'

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

type Period = { year: number; startWeek: number; endWeek: number }
type Epi = { weeks: { year: number; week: number; label: string }[]; groups: { label: string; cases: number[]; deaths: number[] }[] }
type ExecCard = { code: string; label: string; color: string; disease_code?: string | null; ebs: { alerts: number }[]; individual: { total: number } }
type Exec = { cards: ExecCard[] }

const cfrTone = (pct: number | null | undefined) => (pct == null ? '#94a3b8' : pct >= 5 ? '#dc2626' : pct >= 1 ? '#d97706' : '#0f766e')
const ciText = (c?: Ci) => (c && c.den > 0 && c.ci_low != null && c.ci_high != null ? `${pf(c.ci_low)}–${pf(c.ci_high)}` : '—')

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
  const { t } = useTranslation()
  const now = getCurrentEpiWeek()
  const [draft, setDraft] = useState<Period>({ year: now.year, startWeek: 1, endWeek: now.week })
  const [period, setPeriod] = useState<Period>(draft)
  const [focus, setFocus] = useState<LiteCode | null>(null)
  const [tick, setTick] = useState(0)
  const [alert, setAlert] = useState<AlertSkdr | null>(null)
  const [epi, setEpi] = useState<Epi | null>(null)
  const [map, setMap] = useState<PublicDashboard | null>(null)
  const [exec, setExec] = useState<Exec | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Always send the explicit period (public-dashboard 500s without it for kategori queries).
  const qs = useMemo(() => toQs({
    kategori: 'ZOONOSIS',
    disease: LITE_DISEASES.map((d) => d.code).join(','),
    start_year: period.year, start_week: period.startWeek, end_year: period.year, end_week: period.endWeek, year: period.year,
  }), [period])

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

  const focusName = focus ? LITE_DISEASES.find((d) => d.code === focus)?.name : null
  const locations = useMemo(() => {
    const all = map?.locations ?? []
    return focusName ? all.filter((l) => l.disease === focusName) : all.filter((l) => LITE_DISEASES.some((d) => d.name === l.disease))
  }, [map?.locations, focusName])
  const countries = useMemo(() => [{ name: 'Indonesia', cases: map?.kpis.cases ?? 0, deaths: map?.kpis.deaths ?? 0 }], [map?.kpis.cases, map?.kpis.deaths])
  // Whole Indonesia by default; a focused disease fits to its own markers (padded, never tighter than ~4°).
  // AseanMap re-frames to the country outline whenever its data settles (and that framing clips Papua on
  // narrow maps), so the all-Indonesia fit is applied once the map data has settled.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    if (!map) return
    const id = window.setTimeout(() => setSettled(true), 2500)
    return () => window.clearTimeout(id)
  }, [map])
  const fitTo = useMemo<[number, number, number, number] | null>(() => {
    const pts = focusName ? locations.map((l) => [Number(l.longitude), Number(l.latitude)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) : []
    if (!pts.length) return settled ? INDONESIA_BOUNDS : null
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const hw = Math.max(2, (Math.max(...xs) - Math.min(...xs)) / 2 + 1), hh = Math.max(2, (Math.max(...ys) - Math.min(...ys)) / 2 + 1)
    return [cx - hw, cy - hh, cx + hw, cy + hh]
  }, [locations, focusName, settled])
  const markerPeriod = map?.filters?.start_date && map?.filters?.end_date ? { start: map.filters.start_date, end: map.filters.end_date } : null

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
  const maxWeek = draft.year === now.year ? now.week : getWeeksInYear(draft.year)
  const weekOpts = Array.from({ length: maxWeek }, (_, i) => i + 1)
  const setYear = (year: number) => {
    const mw = year === now.year ? now.week : getWeeksInYear(year)
    setDraft({ year, startWeek: Math.min(draft.startWeek, mw), endWeek: year === now.year ? now.week : mw })
  }
  const sel = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700'

  return (
    <div className="flex w-full flex-col gap-2 bg-page px-4 sm:px-6 lg:h-[calc(100vh-150px)] lg:min-h-[560px] lg:px-6" data-testid="zoonosis-lite">
      {/* header + period filter */}
      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-black uppercase tracking-wide text-slate-900">{t('skdr.lite.title')}</h1>
          <p className="truncate text-xs text-slate-600">{t('skdr.lite.subtitle')}</p>
        </div>
        <form className="flex flex-wrap items-center gap-1.5" data-testid="lite-period" onSubmit={(e) => { e.preventDefault(); setPeriod(draft) }}>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.lite.period')}</label>
          <select aria-label={t('skdr.lite.year')} className={sel} value={draft.year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select aria-label={t('skdr.lite.weekFrom')} className={sel} value={draft.startWeek} onChange={(e) => { const w = Number(e.target.value); setDraft({ ...draft, startWeek: w, endWeek: Math.max(w, draft.endWeek) }) }}>
            {weekOpts.map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
          </select>
          <span className="text-xs text-slate-500">–</span>
          <select aria-label={t('skdr.lite.weekTo')} className={sel} value={draft.endWeek} onChange={(e) => { const w = Number(e.target.value); setDraft({ ...draft, endWeek: w, startWeek: Math.min(w, draft.startWeek) }) }}>
            {weekOpts.map((w) => <option key={w} value={w}>{t('skdr.lite.week', { n: w })}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white hover:opacity-90" data-testid="lite-apply">{t('skdr.lite.apply')}</button>
          <button type="button" onClick={() => setTick((x) => x + 1)} title={t('skdr.lite.refresh')} aria-label={t('skdr.lite.refresh')}
            className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-primary hover:bg-blue-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>
      </section>
      {err ? <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} className="py-2" /> : null}

      {/* 4 disease cards; a click focuses the map on that disease */}
      <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="lite-cards">
        {rows.map((r) => {
          const active = focus === r.code
          return (
            <button key={r.code} type="button" onClick={() => setFocus(active ? null : r.code)} aria-pressed={active} data-testid={`lite-card-${r.code}`}
              className={`skdr-card relative overflow-hidden px-3 pb-1.5 pt-2.5 text-left transition hover:shadow-md ${active ? 'ring-2 ring-offset-1' : focus ? 'opacity-60' : ''}`}
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
          <div className="absolute left-12 top-3 z-20 flex flex-wrap gap-1" data-testid="lite-toggle">
            <button type="button" onClick={() => setFocus(null)} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-sm ${!focus ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white/95 text-slate-700'}`}>{t('skdr.lite.all')}</button>
            {LITE_DISEASES.map((d) => (
              <button key={d.code} type="button" onClick={() => setFocus(focus === d.code ? null : d.code)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-sm ${focus === d.code ? 'text-white' : 'border-slate-300 bg-white/95 text-slate-700'}`}
                style={focus === d.code ? { background: d.color, borderColor: d.color } : undefined}>{d.name}</button>
            ))}
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
                    {cfrData.map((x) => <Cell key={x.code} fill={x.color} opacity={focus && focus !== x.code ? 0.35 : 1} />)}
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

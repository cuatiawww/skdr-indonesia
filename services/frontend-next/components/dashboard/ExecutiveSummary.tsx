'use client'
// PR 010/012: executive summary (sheet "Spesifikasi Dashboard Executive"). Order (PR 011/012): 4 summary cards → map
// (afterCards) → charts: trend + heatmap (No. 50–64), disease carousel (PR 018, No. 17 case status on /penyakit cards), CFR with 95% CI, Kinerja 7-1-7.
// Indicator definitions come from app_settings.dashboard_executive via /api/v1/dashboard/executive; UI text from locale keys.
// Spec rule: EBS alerts and Kasus PE are always labelled by source and never summed. The indicator status table moved to /dokumentasi.
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ciText, fmt as n, pct1, rateText, type Rate } from '@/lib/analytics-api'
import { Empty, Panel, SourceKey } from '@/components/analytics/SourceBadge'
import { type SummaryDisease } from '@/components/dashboard/DiseaseTable'
import DeathListModal from '@/components/dashboard/DeathListModal'
import NarSkdr from '@/components/dashboard/NarSkdr'
import DiseaseCarousel from '@/components/dashboard/DiseaseCarousel'
import { diseaseActive } from '@/components/dashboard/DiseaseCard'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'
import TrendHeatmap from '@/components/analytics/TrendHeatmap'
import T717, { type T717Data } from '@/components/dashboard/T717'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonTable } from '@/components/ui/Skeleton'

export { rateText }
type EbsSub = { code: string; label: string; alerts: number; verified: number; discarded: number; verified_rate: Rate; cases: number; deaths: number | null; notification: Rate; notification_missing: number }
type Card = {
  code: string; label: string; color: string; pe_form: string; link?: string; disease_code?: string | null; ebs: EbsSub[]
  individual: { total: number; by_status: Record<string, number>; unclassified: number; deaths: number; split?: { label: string; codes: string[] }[]; status_defs?: { code: string; label: string }[] }
}
type CfrRow = { label: string; star: boolean; known: number; deaths: number; unknown: number; cfr?: Rate; form?: string; codes?: string[] }
type Exec = {
  filters: { scope: string; disease: string | null; source: string | null; start_date: string | null; end_date: string | null }
  header: { individual_reports: number | null; ebs_alerts_zoonosis: number | null; ebs_alerts_all: number | null; form_reports: number | null }
  no_group_for_disease: boolean
  cards: Card[]
  cfr: { groups: { code: string; label: string; color: string; rows: CfrRow[] }[]; star_deaths: { label: string; deaths: number }[] }
  config: { status_labels: Record<string, string>; texts: Record<string, string>; pe_count_statuses: string[] }
}

const dmy = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')

function Shell({ children, color, className = '', testId }: { children: React.ReactNode; color?: string; className?: string; testId?: string }) {
  return (
    <article data-testid={testId} className={`skdr-card relative overflow-hidden p-4 ${className}`}>
      {color ? <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /> : null}
      {children}
    </article>
  )
}

function Gauge({ r, label }: { r: Rate | null; label: string }) {
  const { t } = useTranslation()
  const v = r && r.den ? r.pct ?? 0 : 0
  const tone = !r || !r.den ? '#cbd5e1' : v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#dc2626'
  return (
    <div className="flex flex-col items-center" data-testid="gauge">
      <div className="relative h-32 w-32">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="v" cornerRadius={8} fill={tone} background={{ fill: '#f1f5f9' }} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-slate-900">{r ? rateText(r) : '—'}</span>
          {r && r.den ? <span className="text-xs text-slate-500">{n(r.num)}/{n(r.den)}</span> : <span className="px-2 text-center text-[11px] leading-tight text-slate-400">{t('skdr.exec.noData')}</span>}
        </div>
      </div>
      <div className="mt-1 text-center text-xs font-semibold text-slate-700">{label}</div>
    </div>
  )
}

/** PR 013: y-axis tick for the CFR chart — disease name (bold 14px) + value label "0% (0/8), IK 0–32,4%" (13px). */
function CfrTick(props: any) {
  const { x, y, payload, rows } = props
  const r = (rows as any[])[payload?.index ?? -1] ?? (rows as any[]).find((q) => q.name === payload?.value)
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={-4} textAnchor="end" fontSize={14} fontWeight={800} fill="#0f172a">{payload?.value}</text>
      {r ? <text x={-8} y={14} textAnchor="end" fontSize={13} fill="#475569">{r.den ? `${(r.pct ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% (${fmt(r.num)}/${fmt(r.den)}), IK ${r.ci}` : '—'}</text> : null}
    </g>
  )
}
const fmt = (v: number) => (v ?? 0).toLocaleString('id-ID')

type Pair = { cur: number; prev: number }
type TrendEbs = { alerts: number[]; cases: number[]; deaths: number[]; provinces: number[]; d24: { alerts: Pair; cases: Pair; deaths: Pair; provinces: Pair } | null }
type TrendPe = { cases: number[]; deaths: number[]; provinces: number[]; d24: { cases: Pair; deaths: Pair; provinces: Pair } | null }
type Summary = {
  sources: { ebs: boolean; pe: boolean }; ebs_unmapped_alerts: number
  kpi: { ebs: { alerts: number; cases: number; deaths: number; provinces: number; kabkota: number; verified: number } | null; pe: { cases: number; deaths: number; provinces: number; kabkota: number; verified: number } | null }
  kpi_trend?: { days: string[]; bucket: 'day' | 'week'; until: string | null; period_start: string; period_end: string; ebs_latest: string | null; pe_latest: string | null; ebs: TrendEbs | null; pe: TrendPe | null }
  t717?: T717Data | null
  diseases: SummaryDisease[]
}

const SRC_VAR = { ebs: 'src-ebs', pe: 'src-pe' } as const
type KpiRow = { src?: 'ebs' | 'pe'; label: string; value: string; sub?: string; tone?: string; d24?: Pair | null; spark?: number[] }

/** PR 016: change over the last 24 h vs the 24 h before (real arrival timestamps). Up = red, down = green, 0 = grey "tetap". */
function Delta24({ p }: { p: Pair | null | undefined }) {
  const { t } = useTranslation()
  const hint = t('skdr.kpi.d24Hint')
  if (p === undefined) return null
  if (p === null) return <span title={t('skdr.kpi.d24None')} data-testid="kpi-d24" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-400">—</span>
  const d = p.cur - p.prev
  if (d === 0) return <span title={hint} data-testid="kpi-d24" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{t('skdr.kpi.d24Same')}</span>
  const up = d > 0
  const pct = p.prev > 0 ? ` (${up ? '+' : '−'}${pct1((Math.abs(d) / p.prev) * 100)}%)` : ''
  return (
    <span title={`${hint}: ${n(p.cur)} vs ${n(p.prev)}`} data-testid="kpi-d24"
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${up ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
      {up ? '▲' : '▼'} {up ? '+' : '−'}{n(Math.abs(d))}{pct}
    </span>
  )
}

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts: number[][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}
const dm = (iso?: string) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '')

/** PR 016: daily area sparkline that fills its container — gradient fill, end-point dot, per-day tooltip on hover.
 *  Each source has its own scale (EBS and Kasus PE are never added up). */
function KpiSpark({ src, values, days, className = 'h-16' }: { src: 'ebs' | 'pe'; values: number[]; days: string[]; className?: string }) {
  const { t } = useTranslation()
  const [hi, setHi] = useState<number | null>(null)
  if (!values.length) return null
  const W = 200, H = 60, P = 3
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [P + (i / Math.max(1, values.length - 1)) * (W - 2 * P), H - P - (v / max) * (H - 2 * P - 6)])
  const line = smooth(pts)
  const gid = `kpi-grad-${src}-${Math.round(max)}-${values.length}`
  const color = `rgb(var(--${SRC_VAR[src]}))`
  const k = hi ?? values.length - 1
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    setHi(Math.max(0, Math.min(values.length - 1, Math.round(fx * (values.length - 1)))))
  }
  return (
    <div className="relative min-w-0 flex-1" data-testid="kpi-spark">
      <div className={`relative w-full ${className}`} onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label={t('skdr.kpi.sparkHint', { n: days.length })}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hi !== null ? <line x1={pts[k][0]} x2={pts[k][0]} y1={0} y2={H} stroke="#cbd5e1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {/* dot as HTML so it stays round while the SVG stretches */}
        <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(pts[k][0] / W) * 100}%`, top: `${(pts[k][1] / H) * 100}%`, background: color }} />
        {hi !== null ? (
          <div className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow" data-testid="kpi-spark-tip"
            style={{ left: `${Math.min(85, Math.max(15, (pts[k][0] / W) * 100))}%` }}>
            {dm(days[hi])}: {n(values[hi])}
          </div>
        ) : null}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-400"><span>{dm(days[0])}</span><span>{dm(days[days.length - 1])}</span></div>
    </div>
  )
}

function KpiNumber({ r, size }: { r: KpiRow; size: string }) {
  return (
    <div className="min-w-0">
      {r.src ? <SourceKey source={r.src} label={r.label} /> : <span className="text-xs font-semibold text-slate-600">{r.label}</span>}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span data-testid="kpi-value" className={`font-black leading-none tracking-tight ${size} ${r.tone || 'text-slate-900'}`}>{r.value}</span>
        <Delta24 p={r.d24} />
      </div>
      {r.sub ? <div className="mt-1 truncate text-xs text-slate-500" title={r.sub}>{r.sub}</div> : null}
    </div>
  )
}

/** PR 016: KPI card. One metric: number column left + sparkline filling the right. Two metrics (EBS vs Kasus PE):
 *  two mini-columns side by side with a divider, each with its own delta and mini sparkline — no dead space. */
function Kpi({ title, rows, testId, days = [], until, bucket = 'day' }: { title: string; testId?: string; rows: KpiRow[]; days?: string[]; until?: string | null; bucket?: string }) {
  const { t } = useTranslation()
  const dual = rows.length > 1
  return (
    <Shell className="flex h-full flex-col" testId={testId}>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {dual ? (
        <div className="mt-2 grid flex-1 grid-cols-2 divide-x divide-slate-200">
          {rows.map((r, i) => (
            <div key={r.label} className={`flex min-w-0 flex-col gap-2 ${i ? 'pl-3' : 'pr-3'}`}>
              <KpiNumber r={r} size="text-3xl xl:text-4xl" />
              {r.src && r.spark?.length ? <KpiSpark src={r.src} values={r.spark} days={days} className="h-10" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex flex-1 items-center gap-4">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <div className="shrink-0"><KpiNumber r={r} size="text-5xl" /></div>
              {r.src && r.spark?.length ? <KpiSpark src={r.src} values={r.spark} days={days} className="h-20" /> : null}
            </div>
          ))}
        </div>
      )}
      {days.length ? <div className="mt-2 text-[10px] text-slate-400" data-testid="kpi-until">{t(bucket === 'week' ? 'skdr.kpi.sparkWeekly' : 'skdr.kpi.sparkDaily')}{until ? ` · ${t('skdr.kpi.dataUntil', { date: until.split('-').reverse().join('/') })}` : ''}</div> : null}
    </Shell>
  )
}

export default function ExecutiveSummary({ query, afterCards, sumber = 'all', ukuran = 'alert' }: { query: Record<string, string | number | undefined | null>; afterCards?: React.ReactNode; sumber?: Sumber; ukuran?: UkuranEbs }) {
  const { t } = useTranslation()
  const [d, setD] = useState<Exec | null>(null)
  const [err, setErr] = useState('')
  const [sm, setSm] = useState<Summary | null>(null)
  const [smErr, setSmErr] = useState('')
  const [tick, setTick] = useState(0)
  const [deathList, setDeathList] = useState<{ title: string; form: string; codes: string[] } | null>(null)
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
  useEffect(() => {
    let alive = true
    setErr(''); setSmErr(''); setD(null); setSm(null)
    peFetch<{ data: Exec }>(`/api/v1/dashboard/executive?${qs}`).then((j) => alive && setD(j.data)).catch((e) => alive && setErr(e.message || t('skdr.exec.loadFailed')))
    peFetch<{ data: Summary }>(`/api/v1/analytics/summary?${qs}`).then((j) => alive && setSm(j.data)).catch((e) => alive && setSmErr(e.message || 'error'))
    return () => { alive = false }
  }, [qs, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} />
  if (!d) return <div className="space-y-4"><SkeletonKpiRow /><SkeletonChart /><SkeletonTable /></div>

  const src = d.filters.source
  const te = sm?.kpi_trend?.ebs ?? null
  const tp = sm?.kpi_trend?.pe ?? null
  const days = sm?.kpi_trend?.days ?? []
  const until = sm?.kpi_trend?.until ?? null
  const bucket = sm?.kpi_trend?.bucket ?? 'day'
  const showEbs = src !== 'pe' && src !== 'form'
  const showPe = src !== 'ebs'
  const h = d.header
  const parts = [
    showPe && h.individual_reports !== null ? t('skdr.exec.scopePe', { n: n(h.individual_reports) }) : null,
    showEbs && h.ebs_alerts_zoonosis !== null ? t('skdr.exec.scopeEbs', { n: n(h.ebs_alerts_zoonosis) }) : null,
  ].filter(Boolean)
  const tx = d.config.texts || {}
  const star = d.cfr.star_deaths.reduce((s, x) => s + x.deaths, 0)
  const subs = d.cards.flatMap((c) => c.ebs.map((s) => ({ ...s, group: c.label, color: c.color })))
  // PR 013: pct = null when den = 0 (no bar stub); hi = CI upper bound for the axis zoom.
  const cfrData = d.cfr.groups.flatMap((g) => g.rows.filter((r) => !r.star && r.cfr).map((r) => ({
    name: g.label, color: g.color, pct: r.cfr!.den ? r.cfr!.pct ?? 0 : null, den: r.cfr!.den, num: r.cfr!.num, hi: r.cfr!.den ? r.cfr!.ci_high ?? 0 : 0, text: rateText(r.cfr), ci: ciText(r.cfr),
    err: r.cfr!.den && r.cfr!.ci_low !== null && r.cfr!.ci_high !== null ? [Math.max(0, (r.cfr!.pct ?? 0) - r.cfr!.ci_low), Math.max(0, r.cfr!.ci_high - (r.cfr!.pct ?? 0))] : null, // null = no whisker (recharts would emit duplicate keys for zero-length whiskers)
  })))
  // PR 013: x-axis zoom = max CI upper bound (or point estimate) + 15% padding, rounded to a "nice" step; never above 100%.
  const cfrPeak = Math.max(0, ...cfrData.map((x) => Math.max(x.hi, x.pct ?? 0)))
  const cfrStep = cfrPeak > 50 ? 20 : cfrPeak > 20 ? 10 : cfrPeak > 8 ? 5 : cfrPeak > 4 ? 2 : 1
  const cfrMax = Math.min(100, Math.max(cfrStep * 2, Math.ceil((cfrPeak * 1.15) / cfrStep) * cfrStep))
  const cfrTicks = Array.from({ length: Math.floor(cfrMax / cfrStep) + 1 }, (_, i) => i * cfrStep)

  // sheet No. 9: header sentence includes the epi-week range of the global period filter
  const qq = query as Record<string, unknown>
  const epiLabel = qq.start_week && qq.end_week ? t('skdr.exec.epiRange', { sw: String(qq.start_week), sy: String(qq.start_year), ew: String(qq.end_week), ey: String(qq.end_year) }) : ''
  return (
    <section className="w-full space-y-4" aria-label={t('skdr.exec.aria')}>
      <p className="border-l-2 border-brand-300 pl-3 text-sm text-slate-600">
        {t('skdr.exec.showing')} {parts.join(` ${t('skdr.exec.and')} `)} · {dmy(d.filters.start_date)} – {dmy(d.filters.end_date)} {epiLabel ? `(${epiLabel})` : ''} · {d.filters.scope} · {d.filters.disease || t('skdr.exec.allDiseases')}
        {showEbs && h.ebs_alerts_all !== null ? <span className="text-slate-500"> ({t('skdr.exec.allEbs', { n: n(h.ebs_alerts_all) })})</span> : null}
      </p>
      {d.no_group_for_disease ? <div className="text-xs italic text-slate-500">{t('skdr.exec.notZoonosis')}</div> : null}

      {/* PR 016: 4 KPI cards following the global Sumber filter (replaces the fixed per-disease group cards). */}
      <div className="grid grid-cols-1 items-stretch gap-3 md:auto-rows-fr md:grid-cols-2 2xl:grid-cols-4" data-testid="summary-cards">
        {showEbs ? <Kpi testId="kpi-ebs" days={days} until={until} bucket={bucket} title={t('skdr.kpi.ebsTitle')} rows={[{ src: 'ebs', label: ukuran === 'kasus' ? t('skdr.charts.metricEbsCases') : t('skdr.kpi.ebsSignals'), value: n(ukuran === 'kasus' ? sm?.kpi.ebs?.cases ?? 0 : sm?.kpi.ebs?.alerts ?? 0),
          d24: te ? (ukuran === 'kasus' ? te.d24?.cases : te.d24?.alerts) ?? null : undefined, spark: ukuran === 'kasus' ? te?.cases : te?.alerts,
          sub: t('skdr.kpi.ebsSub', { v: n(sm?.kpi.ebs?.verified ?? 0), other: ukuran === 'kasus' ? t('skdr.kpi.otherAlerts', { n: n(sm?.kpi.ebs?.alerts ?? 0) }) : t('skdr.kpi.otherCases', { n: n(sm?.kpi.ebs?.cases ?? 0) }) }) }]} /> : null}
        {showPe ? <Kpi testId="kpi-pe" days={days} until={until} bucket={bucket} title={t('skdr.kpi.peTitle')} rows={[{ src: 'pe', label: t('skdr.kpi.peCases'), value: n(sm?.kpi.pe?.cases ?? 0), d24: tp ? tp.d24?.cases ?? null : undefined, spark: tp?.cases, sub: t('skdr.kpi.peSub', { v: n(sm?.kpi.pe?.verified ?? 0) }) }]} /> : null}
        <Kpi testId="kpi-deaths" days={days} until={until} bucket={bucket} title={t('skdr.kpi.deathsTitle')} rows={[
          ...(showEbs ? [{ src: 'ebs' as const, label: t('skdr.kpi.deathsEbs'), value: n(sm?.kpi.ebs?.deaths ?? 0), tone: 'text-red-600', d24: te ? te.d24?.deaths ?? null : undefined, spark: te?.deaths }] : []),
          ...(showPe ? [{ src: 'pe' as const, label: t('skdr.kpi.deathsPe'), value: n(sm?.kpi.pe?.deaths ?? 0), tone: 'text-red-600', d24: tp ? tp.d24?.deaths ?? null : undefined, spark: tp?.deaths }] : []),
        ]} />
        <Kpi testId="kpi-regions" days={days} until={until} bucket={bucket} title={t('skdr.kpi.regionsTitle')} rows={[
          ...(showEbs ? [{ src: 'ebs' as const, label: t('skdr.kpi.regionsEbs'), value: n(sm?.kpi.ebs?.provinces ?? 0), d24: te ? te.d24?.provinces ?? null : undefined, spark: te?.provinces, sub: t('skdr.kpi.kabN', { n: n(sm?.kpi.ebs?.kabkota ?? 0) }) }] : []),
          ...(showPe ? [{ src: 'pe' as const, label: t('skdr.kpi.regionsPe'), value: n(sm?.kpi.pe?.provinces ?? 0), d24: tp ? tp.d24?.provinces ?? null : undefined, spark: tp?.provinces, sub: t('skdr.kpi.kabN', { n: n(sm?.kpi.pe?.kabkota ?? 0) }) }] : []),
        ]} />
        {sumber !== 'all' ? (showEbs
          ? <Kpi testId="kpi-extra" title={t('skdr.kpi.verifiedEbs')} rows={[{ src: 'ebs', label: t('skdr.kpi.verifiedRate'), value: sm?.kpi.ebs?.alerts ? `${pct1(((sm.kpi.ebs.verified) / sm.kpi.ebs.alerts) * 100)}%` : '—', sub: sm?.kpi.ebs ? `${n(sm.kpi.ebs.verified)} / ${n(sm.kpi.ebs.alerts)}` : undefined }]} />
          : <Kpi testId="kpi-extra" title={t('skdr.kpi.verifiedPe')} rows={[{ src: 'pe', label: t('skdr.kpi.verifiedRate'), value: sm?.kpi.pe?.cases ? `${pct1((sm.kpi.pe.verified / sm.kpi.pe.cases) * 100)}%` : '—', sub: sm?.kpi.pe ? `${n(sm.kpi.pe.verified)} / ${n(sm.kpi.pe.cases)}` : undefined }]} />) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{tx.footnote} {tx.individual_def} {tx.alert_def}</p>

      {/* PR 011: peta lebar penuh langsung di bawah 4 kartu ringkasan */}
      {afterCards}

      {/* PR 018: carousel of compact disease cards directly below the map (replaces the PR 016 disease table panel) */}
      {sm ? (sm.diseases.length ? <DiseaseCarousel rows={[...sm.diseases].sort((a, b) => Number(diseaseActive(b, sumber)) - Number(diseaseActive(a, sumber)) || a.name.localeCompare(b.name, 'id'))} sumber={sumber} ukuran={ukuran} /> : null)
        : smErr ? <ErrorState message={smErr} onRetry={() => setTick((x) => x + 1)} /> : <SkeletonTable />}
      {showEbs && sm?.ebs_unmapped_alerts ? <p className="-mt-2 text-[11px] text-slate-500">{t('skdr.charts.unmapped', { n: n(sm.ebs_unmapped_alerts) })}</p> : null}

      {/* PR 012: No. 50–64 — tren mingguan + heatmap minggu epid × provinsi */}
      <TrendHeatmap query={query as Record<string, unknown>} sumber={sumber} ukuran={ukuran} />

      {/* No. 21–35 — CFR + 95% CI (Kasus PE, kasus konfirmasi) */}
      {showPe && d.cfr.groups.length ? (
        <Panel title={t('skdr.exec.cfrTitle')} testId="cfr">
          {star > 0 ? (
            <div className="mb-3 border-l-4 border-amber-400 bg-amber-50/70 px-3 py-2 text-sm text-amber-900" data-testid="cfr-check">
              <b>{t('skdr.exec.checkData')}</b> {t('skdr.exec.checkDataText', { n: n(star), list: d.cfr.star_deaths.map((x) => `${x.label.replace('*', '')} ${n(x.deaths)}`).join(' · ') })}
            </div>
          ) : null}
          {/* PR 013: thick horizontal bars (point estimate) + Wilson CI whisker, value label per disease, x-axis auto-zoomed to max CI upper bound. */}
          <div className="grid flex-1 grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
            <div className="relative h-full" data-testid="cfr-chart" style={{ minHeight: Math.max(340, cfrData.length * 88 + 60) }}>
              {cfrData.some((x) => x.den > 0) ? (
                <div className="absolute inset-0"><ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cfrData} layout="vertical" margin={{ top: 8, left: 4, right: 24, bottom: 8 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" domain={[0, cfrMax]} ticks={cfrTicks} tick={{ fontSize: 13, fill: '#475569' }} tickFormatter={(v) => `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} />
                    <YAxis type="category" dataKey="name" width={210} tick={<CfrTick rows={cfrData} />} interval={0} />
                    <Tooltip formatter={(_v: any, _k: any, p: any) => [`${p.payload.text} (${n(p.payload.num)}/${n(p.payload.den)}), IK 95% ${p.payload.ci}`, 'CFR']} contentStyle={{ fontSize: 13 }} />
                    <Bar dataKey="pct" isAnimationActive={false} maxBarSize={44} minPointSize={8} radius={[0, 6, 6, 0]}>
                      {cfrData.map((x, i) => <Cell key={x.name + i} fill={x.color} />)}
                      <ErrorBar dataKey="err" width={14} strokeWidth={2.5} stroke="#0f172a" direction="x" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer></div>
              ) : <Empty>{t('skdr.exec.cfrEmpty')}</Empty>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="px-2 py-2">{t('skdr.exec.cfrStatus')}</th><th>{t('skdr.exec.cfrKnown')}</th><th>{t('skdr.exec.cfrDeaths')}</th><th>CFR</th><th>{t('skdr.exec.cfrCi')}</th><th>{t('skdr.exec.cfrUnknown')}</th><th><span className="sr-only">{t('skdr.signal.view')}</span></th></tr>
                </thead>
                <tbody>
                  {d.cfr.groups.map((g) => [
                    <tr key={g.code} className="bg-slate-100"><td colSpan={7} className="px-2 py-1.5 text-xs font-black uppercase" style={{ color: g.color }}>{g.label}</td></tr>,
                    ...g.rows.map((r) => (
                      <tr key={g.code + r.label} className={`border-b border-slate-100 ${r.star && r.deaths > 0 ? 'bg-amber-50' : ''}`}>
                        <td className={`px-2 py-1.5 ${r.star ? '' : 'font-bold'}`}>{r.label}</td>
                        <td>{n(r.known)}</td>
                        <td className={r.star ? (r.deaths > 0 ? 'font-bold text-amber-700' : '') : 'font-bold text-red-600'}>{n(r.deaths)}</td>
                        <td>{r.star ? t('skdr.exec.notCounted') : rateText(r.cfr)}</td>
                        <td>{r.star ? '-' : ciText(r.cfr)}</td>
                        <td>{n(r.unknown)}</td>
                        <td className="pr-2 text-right">{r.star && r.deaths > 0 && r.form && r.codes?.length ? (
                          <button type="button" data-testid="cfr-lihat" onClick={() => setDeathList({ title: `${g.label} · ${r.label.replace('*', '')}`, form: r.form!, codes: r.codes! })}
                            className="whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                            {t('skdr.cfrList.button', { n: n(r.deaths) })}</button>) : null}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </div>
          {deathList ? <DeathListModal {...deathList} qs={qs} onClose={() => setDeathList(null)} /> : null}
          <p className="mt-3 text-xs text-slate-500">{t('skdr.cfrList.footnote')} {tx.cfr_note} {t('skdr.exec.fractionNote')} {t('skdr.exec.cfrZoom', { max: pct1(cfrMax) })}</p>
        </Panel>
      ) : null}

      {/* PR 016: No. 41–45 — Kinerja 7-1-7 as a 3-step timeline + per-disease table (follows the global Sumber filter). */}
      <T717 data={sm?.t717} sumber={sumber} />

      {/* PR 018: NAR–SKDR (No. 76–81) — dashboard section per sheet No. 10 */}
      <NarSkdr qs={qs} sumber={sumber} />

      {d.cards.length === 0 && !d.no_group_for_disease ? <div className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{t('skdr.exec.noConfig')}</div> : null}
    </section>
  )
}

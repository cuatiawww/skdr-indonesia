'use client'
// Dasbor Zoonosis Lite: heatmap epi week x province for the 4 Lite zoonoses, directly under the map.
// Same data and colour scale as the main dashboard heatmap (TrendHeatmap, PR 012/016): GET /api/v1/analytics/overview,
// heatmap.ebs_alerts / ebs_cases / pe_cases, shade() sequential palette. The shared TrendHeatmap is not touched.
// Fully driven by the Lite filters: the week columns are the weeks of the applied period (start..end, end clamped to the
// current week by the API), rows / values / colour scale are recomputed for the selected diseases, provinces, kab/kota
// and Sumber. EBS and Kasus PE are never summed: with Sumber = Semua each cell is split (EBS top, PE bottom).
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Grid3x3 } from 'lucide-react'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt, qs, shade, type HeatRow, type Overview, type Week } from '@/lib/analytics-api'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'
import { Empty, SourceKey } from '@/components/analytics/SourceBadge'

export type LiteHeatMetric = 'kasus' | 'alert'
type Src = 'all' | 'ebs' | 'pe'
type Period = { startYear: number; startWeek: number; endYear: number; endWeek: number }
type Row = { id: number; name: string; e?: HeatRow; p?: HeatRow }
type Hover = { row: Row; i: number; x: number; y: number }

const TOP_N = 12
const MAX_WEEKS = 104

/** Legend steps of shade(): step k starts at max * (k / 4.999)^2 (sqrt scale, 5 steps). */
function steps(max: number) {
  const out: { lo: number; hi: number; v: number }[] = []
  for (let k = 0; k < 5; k++) {
    const lo = k === 0 ? 1 : Math.ceil(max * (k / 4.999) ** 2)
    const hi = k === 4 ? max : Math.ceil(max * ((k + 1) / 4.999) ** 2) - 1
    if (max > 0 && lo <= hi && !out.some((s) => s.lo === lo)) out.push({ lo, hi, v: lo })
  }
  return out
}

const dayFmt = (iso: string, locale: string, withYear = false) => {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function ZoonosisLiteHeatmap({ query, src, period, tick = 0, chips }: {
  /** Same query as the Lite modal: kategori ZOONOSIS, disease = selected Lite codes, epi-week period, province_id, kabkota_id. */
  query: Record<string, unknown>
  src: Src
  period: Period
  tick?: number
  chips: { diseases: string; area: string; period: string }
}) {
  const { t, locale } = useTranslation()
  const [metric, setMetric] = useState<LiteHeatMetric>('kasus')
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [retry, setRetry] = useState(0)
  const [all, setAll] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const m: LiteHeatMetric = src === 'pe' ? 'kasus' : metric
  const q = qs({ ...query, source: src === 'all' ? undefined : src })

  useEffect(() => {
    let alive = true
    setErr(''); setOv(null); setHover(null)
    peFetch<{ data: Overview }>(`/api/v1/analytics/overview?${q}`).then((j) => alive && setOv(j.data)).catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [q, tick, retry])

  const view = useMemo(() => {
    if (!ov) return null
    const weeks: Week[] = ov.weeks
    const showEbs = src !== 'pe' && ov.sources.ebs
    const showPe = m === 'kasus' && src !== 'ebs' && ov.sources.pe
    const ebsList = (m === 'alert' ? ov.heatmap.ebs_alerts : ov.heatmap.ebs_cases) || []
    const peList = ov.heatmap.pe_cases || []
    const byId = new Map<number, Row>()
    if (showEbs) for (const r of ebsList) byId.set(r.province_id, { id: r.province_id, name: r.name, e: r })
    if (showPe) for (const r of peList) byId.set(r.province_id, { ...(byId.get(r.province_id) || { id: r.province_id, name: r.name }), p: r })
    const rows = [...byId.values()]
      .filter((r) => (r.e?.total || 0) + (r.p?.total || 0) > 0)
      .sort((a, b) => (b.e?.total || 0) - (a.e?.total || 0) || (b.p?.total || 0) - (a.p?.total || 0) || a.name.localeCompare(b.name, 'id'))
    const maxE = Math.max(0, ...rows.flatMap((r) => r.e?.values || []))
    const maxP = Math.max(0, ...rows.flatMap((r) => r.p?.values || []))
    const totE = rows.reduce((s, r) => s + (r.e?.total || 0), 0)
    const totP = rows.reduce((s, r) => s + (r.p?.total || 0), 0)
    return { weeks, rows, maxE, maxP, totE, totP, showEbs, showPe, both: showEbs && showPe }
  }, [ov, src, m])

  const ebsLabel = m === 'alert' ? t('skdr.charts.metricAlerts') : t('skdr.charts.metricEbsCases')
  const peLabel = t('skdr.charts.metricPeCases')
  // The API clamps the end to the current week and keeps at most 104 weeks; say so when the columns are cut.
  const first = view?.weeks[0]
  const cut = !!first && (first.year !== period.startYear || first.week !== period.startWeek) && (view?.weeks.length || 0) >= MAX_WEEKS
  const shown = view ? (all ? view.rows : view.rows.slice(0, TOP_N)) : []

  const onMove = (row: Row, i: number) => (e: MouseEvent) => setHover({ row, i, x: e.clientX, y: e.clientY })
  const weekRange = (w: Week) => `${dayFmt(w.start, locale)} \u2013 ${dayFmt(addDays(w.start, 6), locale, true)}`

  const legend = (hue: 'ebs' | 'pe', max: number, label: string) => (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid={`lite-heat-legend-${hue}`}>
      <SourceKey source={hue} label={label} />
      <span className="inline-flex items-center gap-0.5">
        <span className="h-3 w-5 rounded-sm border border-slate-200" style={{ background: shade(0, max, hue) }} title="0" />
        {steps(max).map((s) => (
          <span key={s.lo} className="h-3 w-5 rounded-sm" style={{ background: shade(s.v, max, hue) }} title={s.lo === s.hi ? fmt(s.lo) : `${fmt(s.lo)}\u2013${fmt(s.hi)}`} />
        ))}
      </span>
      <span className="tabular-nums text-slate-500">0{' \u2013 '}{fmt(max)}</span>
    </span>
  )

  return (
    <section className="skdr-card relative p-3" data-testid="lite-heatmap">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900"><Grid3x3 className="h-4 w-4 text-primary" />{t('skdr.lite.heat.title')}</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500" data-testid="lite-heat-scope">
            {chips.diseases}{' \u00b7 '}{chips.area}{' \u00b7 '}{chips.period}
          </p>
        </div>
        <div role="radiogroup" aria-label={t('skdr.lite.heat.metric')} className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-bold" data-testid="lite-heat-metric">
          {(['kasus', 'alert'] as const).map((k) => {
            const disabled = k === 'alert' && src === 'pe'
            return (
              <button key={k} type="button" role="radio" aria-checked={m === k} disabled={disabled} onClick={() => setMetric(k)} data-value={k}
                title={disabled ? t('skdr.lite.heat.alertPeOnly') : k === 'alert' ? t('skdr.lite.heat.alertHint') : t('skdr.lite.heat.casesHint')}
                className={`rounded-lg px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${m === k ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50'}`}>
                {k === 'kasus' ? t('skdr.lite.heat.cases') : t('skdr.lite.heat.alerts')}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2">
        {err ? <ErrorState message={err} onRetry={() => setRetry((x) => x + 1)} className="py-2" />
          : !view ? <SkeletonChart height={180} />
          : ov?.disease_not_found || !view.rows.length || !view.weeks.length ? (
            <Empty>
              <span data-testid="lite-heat-empty">
                <b className="block text-slate-700">{t('skdr.lite.heat.emptyTitle')}</b>
                {t('skdr.lite.heat.emptyBody', { metric: view.showPe && view.showEbs ? `${ebsLabel} / ${peLabel}` : view.showPe ? peLabel : ebsLabel })}
              </span>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto" onMouseLeave={() => setHover(null)}>
                <table className="w-full border-separate text-[11px]" style={{ borderSpacing: 2 }} data-testid="lite-heat-table">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[130px] bg-card text-left font-semibold text-slate-500">{t('skdr.charts.province')}</th>
                      {view.weeks.map((w, i) => {
                        const newYear = i === 0 || w.year !== view.weeks[i - 1].year
                        return (
                          <th key={w.start} className={`min-w-[18px] whitespace-nowrap px-0 text-center font-normal text-slate-400 ${newYear && i > 0 ? 'border-l border-slate-300' : ''}`} title={`M${w.week}/${w.year}: ${weekRange(w)}`}>
                            {newYear ? <span className="block text-[9px] font-bold text-slate-500">{w.year}</span> : <span className="block text-[9px]">&nbsp;</span>}
                            {w.week}
                          </th>
                        )
                      })}
                      {view.showEbs ? <th className="pl-2 text-right font-semibold text-ebs">EBS</th> : null}
                      {view.showPe ? <th className="pl-2 text-right font-semibold text-pe">PE</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} data-testid="lite-heat-row">
                        <td className="sticky left-0 z-10 max-w-[180px] truncate bg-card pr-2 font-semibold text-slate-700" title={r.name}>{r.name}</td>
                        {view.weeks.map((w, i) => {
                          const e = r.e?.values[i] || 0, p = r.p?.values[i] || 0
                          const on = hover?.row.id === r.id && hover.i === i
                          const aria = `${r.name}, M${w.week}/${w.year}: ${view.showEbs ? `${ebsLabel} ${fmt(e)}` : ''}${view.both ? ', ' : ''}${view.showPe ? `${peLabel} ${fmt(p)}` : ''}`
                          const ring = on ? 'outline outline-2 outline-slate-700' : ''
                          return view.both ? (
                            <td key={w.start} aria-label={aria} onMouseMove={onMove(r, i)} className={`h-6 cursor-crosshair overflow-hidden rounded-sm p-0 ${ring}`}>
                              <div className="h-3" style={{ background: shade(e, view.maxE, 'ebs') }} />
                              <div className="h-3" style={{ background: shade(p, view.maxP, 'pe') }} />
                            </td>
                          ) : (
                            <td key={w.start} aria-label={aria} onMouseMove={onMove(r, i)} className={`h-5 cursor-crosshair rounded-sm ${ring}`}
                              style={{ background: view.showEbs ? shade(e, view.maxE, 'ebs') : shade(p, view.maxP, 'pe') }} />
                          )
                        })}
                        {view.showEbs ? <td className="pl-2 text-right font-mono text-slate-600">{fmt(r.e?.total || 0)}</td> : null}
                        {view.showPe ? <td className="pl-2 text-right font-mono text-slate-600">{fmt(r.p?.total || 0)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500">
                {view.showEbs ? legend('ebs', view.maxE, ebsLabel) : null}
                {view.showPe ? legend('pe', view.maxP, peLabel) : null}
                {view.both ? <span>{t('skdr.lite.heat.splitNote')}</span> : null}
                {view.rows.length > TOP_N ? (
                  <button type="button" onClick={() => setAll((x) => !x)} className="font-bold text-primary hover:underline" data-testid="lite-heat-more">
                    {all ? t('skdr.lite.heat.showTop', { n: TOP_N }) : t('skdr.lite.heat.showAll', { n: view.rows.length })}
                  </button>
                ) : null}
                <span className="ml-auto">
                  {t('skdr.lite.heat.axis', { n: view.weeks.length, from: `M${view.weeks[0].week}/${view.weeks[0].year}`, to: `M${view.weeks[view.weeks.length - 1].week}/${view.weeks[view.weeks.length - 1].year}` })}
                  {cut ? ` ${t('skdr.lite.heat.cut', { n: MAX_WEEKS })}` : ''}
                </span>
              </div>
            </>
          )}
      </div>

      {hover && view ? (() => {
        const w = view.weeks[hover.i]
        const e = hover.row.e?.values[hover.i] || 0, p = hover.row.p?.values[hover.i] || 0
        const left = typeof window !== 'undefined' && hover.x > window.innerWidth - 240 ? hover.x - 228 : hover.x + 14
        return (
          <div role="tooltip" data-testid="lite-heat-tooltip" className="pointer-events-none fixed z-50 w-[214px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] shadow-lg backdrop-blur"
            style={{ left, top: hover.y + 14 }}>
            <div className="truncate text-xs font-black text-slate-900">{hover.row.name}</div>
            <div className="text-slate-500">{t('skdr.lite.heat.weekLabel', { week: w.week, year: w.year })}{' \u00b7 '}{weekRange(w)}</div>
            <div className="mt-1 space-y-0.5">
              {view.showEbs ? <div className="flex items-center justify-between gap-2"><SourceKey source="ebs" label={ebsLabel} /><b className="tabular-nums text-slate-900">{fmt(e)}</b></div> : null}
              {view.showPe ? <div className="flex items-center justify-between gap-2"><SourceKey source="pe" label={peLabel} /><b className="tabular-nums text-slate-900">{fmt(p)}</b></div> : null}
            </div>
          </div>
        )
      })() : null}
    </section>
  )
}
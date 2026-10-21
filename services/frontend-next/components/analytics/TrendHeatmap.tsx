'use client'
// PR 012/016: weekly trend + heatmap epi week × province (sheet "Spesifikasi Dashboard Executive" No. 50–64).
// PR 016: follows the single global Sumber filter (+ EBS measure Alert/Kasus dilaporkan). No per-section source badges
// or selects. Semua = EBS and Kasus PE in the same widget, told apart by colour + legend, on separate axes / cell halves;
// the two sources are never summed.
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt, qs, shade, type Overview } from '@/lib/analytics-api'
import { SOURCE_COLOR, cssv } from '@/lib/theme'
import { Empty, Panel, SourceKey } from './SourceBadge'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'

// Disease series colours (single-source view): theme tokens first, then neutral hues.
const COLORS = [cssv('brand-700'), cssv('src-ebs'), cssv('src-pe'), '#8A9A00', '#6B6766', '#9333ea', '#db2777', cssv('brand-900')]

function PerDisease({ ov, src, ukuran }: { ov: Overview; src: 'ebs' | 'pe'; ukuran: UkuranEbs }) {
  const { t } = useTranslation()
  const list = src === 'ebs' ? ov.trend.ebs : ov.trend.pe
  const [sel, setSel] = useState<number[]>([])
  useEffect(() => { setSel(list.slice(0, 4).map((s) => s.disease_id)) }, [list])
  const data = useMemo(() => ov.weeks.map((w, i) => {
    const row: Record<string, string | number> = { label: w.label }
    for (const s of list) if (sel.includes(s.disease_id)) row[s.name] = src === 'ebs' ? (ukuran === 'kasus' ? (s as any).cases[i] : (s as any).alerts[i]) : (s as any).cases[i]
    return row
  }), [ov.weeks, list, sel, ukuran, src])
  const unit = src === 'ebs' ? (ukuran === 'kasus' ? t('skdr.charts.metricEbsCases') : t('skdr.charts.metricAlerts')) : t('skdr.charts.metricPeCases')
  return (
    <Panel title={t('skdr.charts.trendTitle')} testId={`trend-${src}`} legend={<SourceKey source={src} label={unit} />}>
      {!list.length ? <Empty>{src === 'ebs' ? t('skdr.charts.emptyEbs') : t('skdr.charts.emptyPe')}</Empty> : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t('skdr.charts.pickDisease')}>
            {list.slice(0, 12).map((s, k) => {
              const on = sel.includes(s.disease_id)
              return (
                <label key={s.disease_id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${on ? 'border-slate-300 bg-slate-50 font-semibold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== s.disease_id) : [...sel, s.disease_id])} />
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k % COLORS.length] }} />{s.name} <span className="text-slate-400">{fmt(s.total)}</span>
                </label>
              )
            })}
          </div>
          <div className="relative min-h-[20rem] flex-1"><div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={40} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {list.slice(0, 12).map((s, k) => sel.includes(s.disease_id) ? <Line key={s.disease_id} type="monotone" dataKey={s.name} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} /> : null)}
              </LineChart>
            </ResponsiveContainer></div>
          </div>
        </>
      )}
    </Panel>
  )
}

/** Semua: one chart, EBS (left axis) and Kasus PE (right axis) as separate coloured series. */
function Combined({ ov, ukuran }: { ov: Overview; ukuran: UkuranEbs }) {
  const { t } = useTranslation()
  const ebsLabel = ukuran === 'kasus' ? t('skdr.charts.metricEbsCases') : t('skdr.charts.metricAlerts')
  const peLabel = t('skdr.charts.metricPeCases')
  const data = ov.weeks.map((w, i) => ({
    label: w.label,
    ebs: ov.trend.ebs.reduce((a, s) => a + (ukuran === 'kasus' ? s.cases[i] : s.alerts[i]), 0),
    pe: ov.trend.pe.reduce((a, s) => a + s.cases[i], 0),
  }))
  return (
    <Panel title={t('skdr.charts.trendTitle')} testId="trend-combined" legend={<><SourceKey source="ebs" label={ebsLabel} /><SourceKey source="pe" label={peLabel} /></>}>
      <div className="relative min-h-[20rem] flex-1"><div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis yAxisId="ebs" tick={{ fontSize: 12, fill: SOURCE_COLOR.ebs }} allowDecimals={false} width={44} />
            <YAxis yAxisId="pe" orientation="right" tick={{ fontSize: 12, fill: SOURCE_COLOR.pe }} allowDecimals={false} width={36} />
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
            <Line yAxisId="ebs" type="monotone" dataKey="ebs" name={`EBS · ${ebsLabel}`} stroke={SOURCE_COLOR.ebs} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="pe" type="monotone" dataKey="pe" name={`${t('skdr.source.pe')}`} stroke={SOURCE_COLOR.pe} strokeWidth={2.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{t('skdr.charts.combinedNote')}</p>
    </Panel>
  )
}

function Heatmap({ ov, sumber, ukuran }: { ov: Overview; sumber: Sumber; ukuran: UkuranEbs }) {
  const { t } = useTranslation()
  const ebsKey = ukuran === 'kasus' ? 'ebs_cases' : 'ebs_alerts'
  const showEbs = sumber !== 'pe' && ov.sources.ebs, showPe = sumber !== 'ebs' && ov.sources.pe
  const pe = new Map((ov.heatmap.pe_cases || []).map((r) => [r.province_id, r]))
  const ebs = new Map((ov.heatmap[ebsKey] || []).map((r) => [r.province_id, r]))
  const base = (showEbs ? ov.heatmap[ebsKey] : ov.heatmap.pe_cases) || []
  const rows = base.map((r) => ({ id: r.province_id, name: r.name, e: showEbs ? ebs.get(r.province_id) : undefined, p: showPe ? pe.get(r.province_id) : undefined }))
    .filter((r) => (r.e?.total || 0) + (r.p?.total || 0) > 0)
    .sort((a, b) => (b.e?.total || 0) - (a.e?.total || 0) || (b.p?.total || 0) - (a.p?.total || 0))
  const maxE = Math.max(0, ...rows.flatMap((r) => r.e?.values || []))
  const maxP = Math.max(0, ...rows.flatMap((r) => r.p?.values || []))
  const both = showEbs && showPe
  const ebsLabel = ukuran === 'kasus' ? t('skdr.charts.metricEbsCases') : t('skdr.charts.metricAlerts')
  const scaleRow = (hue: 'ebs' | 'pe', max: number, label: string) => (
    <span className="inline-flex items-center gap-1.5"><SourceKey source={hue} label={label} />{[0.05, 0.2, 0.45, 0.7, 1].map((x) => <span key={x} className="h-3 w-5 rounded-sm" style={{ background: shade(x * max, max, hue) }} />)}<span>{fmt(max)}</span></span>
  )
  return (
    <Panel title={t('skdr.charts.heatmap')} testId="heatmap">
      {!rows.length ? <Empty>{t('skdr.charts.emptyHeat')}</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
            <thead><tr><th className="sticky left-0 z-10 min-w-[140px] bg-white text-left font-semibold text-slate-500">{t('skdr.charts.province')}</th>
              {ov.weeks.map((w) => <th key={w.start} className="min-w-[22px] whitespace-nowrap font-normal text-slate-400" title={w.start}>{w.week}</th>)}
              {showEbs ? <th className="pl-2 text-right font-semibold text-ebs">EBS</th> : null}
              {showPe ? <th className="pl-2 text-right font-semibold text-pe">PE</th> : null}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 truncate bg-white pr-2 font-semibold text-slate-700">{r.name}</td>
                  {ov.weeks.map((w, i) => {
                    const e = r.e?.values[i] || 0, p = r.p?.values[i] || 0
                    const title = `${r.name} · ${w.label}: ${showEbs ? `EBS ${fmt(e)}` : ''}${both ? ' · ' : ''}${showPe ? `PE ${fmt(p)}` : ''}`
                    return both ? (
                      <td key={i} title={title} className="h-6 overflow-hidden rounded-sm p-0">
                        <div className="h-3" style={{ background: shade(e, maxE, 'ebs') }} />
                        <div className="h-3" style={{ background: shade(p, maxP, 'pe') }} />
                      </td>
                    ) : <td key={i} title={title} className="h-5 rounded-sm" style={{ background: showEbs ? shade(e, maxE, 'ebs') : shade(p, maxP, 'pe') }} />
                  })}
                  {showEbs ? <td className="pl-2 text-right font-mono text-slate-600">{fmt(r.e?.total || 0)}</td> : null}
                  {showPe ? <td className="pl-2 text-right font-mono text-slate-600">{fmt(r.p?.total || 0)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
            {showEbs ? scaleRow('ebs', maxE, ebsLabel) : null}
            {showPe ? scaleRow('pe', maxP, t('skdr.charts.metricPeCases')) : null}
            {both ? <span>{t('skdr.charts.heatBothNote')}</span> : null}
            <span className="ml-auto">{t('skdr.charts.weekAxis')}</span>
          </div>
        </div>
      )}
    </Panel>
  )
}

export default function TrendHeatmap({ query, sumber = 'all', ukuran = 'alert' }: { query: Record<string, unknown>; sumber?: Sumber; ukuran?: UkuranEbs }) {
  const { t } = useTranslation()
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const q = qs(query)
  useEffect(() => {
    let alive = true; setErr(''); setOv(null)
    peFetch<{ data: Overview }>(`/api/v1/analytics/overview?${q}`).then((j) => alive && setOv(j.data)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [q, tick])
  if (err) return <ErrorState message={err} onRetry={() => setTick((x) => x + 1)} />
  if (!ov) return <div className="space-y-3"><SkeletonChart /><SkeletonChart height={180} /></div>
  return (
    <div className="space-y-3" data-testid="trend-heatmap">
      {ov.disease_not_found ? <Empty>{t('skdr.charts.diseaseNotFound')}</Empty> : null}
      {sumber === 'all' ? <Combined ov={ov} ukuran={ukuran} /> : <PerDisease ov={ov} src={sumber} ukuran={ukuran} />}
      <Heatmap ov={ov} sumber={sumber} ukuran={ukuran} />
    </div>
  )
}

'use client'
// PR 012: sheet "Spesifikasi Dashboard Executive" No. 50–64 — weekly trend per disease (selectable) and heatmap
// epi week × province. EBS and Kasus PE are always separate charts (never summed).
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt, qs, shade, type Overview } from '@/lib/analytics-api'
import { Empty, Panel } from './SourceBadge'

const COLORS = ['#0060A9', '#00A3AD', '#C2410C', '#8A9A00', '#6B6766', '#9333ea', '#db2777', '#0f766e']

function Trend({ ov, src }: { ov: Overview; src: 'ebs' | 'pe' }) {
  const { t } = useTranslation()
  const list = src === 'ebs' ? ov.trend.ebs : ov.trend.pe
  const [metric, setMetric] = useState<'alerts' | 'cases'>('alerts')
  const [sel, setSel] = useState<number[]>([])
  useEffect(() => { setSel(list.slice(0, 4).map((s) => s.disease_id)) }, [list])
  const data = useMemo(() => ov.weeks.map((w, i) => {
    const row: Record<string, string | number> = { label: w.label }
    for (const s of list) if (sel.includes(s.disease_id)) row[s.name] = src === 'ebs' ? (metric === 'alerts' ? (s as any).alerts[i] : (s as any).cases[i]) : (s as any).cases[i]
    return row
  }), [ov.weeks, list, sel, metric, src])
  const title = src === 'ebs' ? t('skdr.charts.trendEbs') : t('skdr.charts.trendPe')
  return (
    <Panel title={title} sources={[src]} testId={`trend-${src}`}
      right={src === 'ebs' ? (
        <select aria-label={t('skdr.charts.metric')} value={metric} onChange={(e) => setMetric(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
          <option value="alerts">{t('skdr.charts.metricAlerts')}</option><option value="cases">{t('skdr.charts.metricEbsCases')}</option>
        </select>
      ) : null}>
      {!list.length ? <Empty>{src === 'ebs' ? t('skdr.charts.emptyEbs') : t('skdr.charts.emptyPe')}</Empty> : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t('skdr.charts.pickDisease')}>
            {list.slice(0, 12).map((s, k) => {
              const on = sel.includes(s.disease_id)
              return (
                <label key={s.disease_id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${on ? 'border-slate-300 bg-slate-50 font-semibold text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#0060A9]" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== s.disease_id) : [...sel, s.disease_id])} />
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k % COLORS.length] }} />{s.name} <span className="text-slate-400">{fmt(s.total)}</span>
                </label>
              )
            })}
          </div>
          {/* PR 013: chart grows to fill the card; absolute inner box avoids a ResponsiveContainer resize loop */}
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
      {src === 'ebs' && ov.ebs_unmapped_alerts > 0 ? <p className="mt-2 text-[11px] text-slate-500">{t('skdr.charts.unmapped', { n: fmt(ov.ebs_unmapped_alerts) })}</p> : null}
    </Panel>
  )
}

function Heatmap({ ov }: { ov: Overview }) {
  const { t } = useTranslation()
  const opts = [
    ...(ov.sources.ebs ? [['ebs_alerts', t('skdr.charts.metricAlerts')], ['ebs_cases', t('skdr.charts.metricEbsCases')]] : []),
    ...(ov.sources.pe ? [['pe_cases', t('skdr.charts.metricPeCases')]] : []),
  ] as [keyof Overview['heatmap'], string][]
  const [m, setM] = useState<keyof Overview['heatmap']>(opts[0]?.[0] || 'ebs_alerts')
  useEffect(() => { if (!opts.find((o) => o[0] === m) && opts[0]) setM(opts[0][0]) }, [ov.sources.ebs, ov.sources.pe]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (ov.heatmap[m] || []).filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...rows.flatMap((r) => r.values))
  const hue = m.startsWith('ebs') ? 'ebs' : 'pe'
  return (
    <Panel title={t('skdr.charts.heatmap')} sources={[hue]} testId="heatmap"
      right={<select aria-label={t('skdr.charts.metric')} value={m} onChange={(e) => setM(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>}>
      {!rows.length ? <Empty>{t('skdr.charts.emptyHeat')}</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
            <thead><tr><th className="sticky left-0 z-10 min-w-[140px] bg-white text-left font-semibold text-slate-500">{t('skdr.charts.province')}</th>
              {ov.weeks.map((w) => <th key={w.start} className="min-w-[22px] whitespace-nowrap font-normal text-slate-400" title={w.start}>{w.week}</th>)}
              <th className="pl-2 text-right font-semibold text-slate-500">{t('skdr.charts.total')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.province_id}>
                  <td className="sticky left-0 z-10 truncate bg-white pr-2 font-semibold text-slate-700">{r.name}</td>
                  {r.values.map((v, i) => <td key={i} title={`${r.name} · ${ov.weeks[i].label}: ${fmt(v)}`} className="h-5 rounded-sm" style={{ background: shade(v, max, hue) }} />)}
                  <td className="pl-2 text-right font-mono text-slate-600">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span>{t('skdr.charts.low')}</span>{[0.05, 0.2, 0.45, 0.7, 1].map((x) => <span key={x} className="h-3 w-6 rounded-sm" style={{ background: shade(x * max, max, hue) }} />)}<span>{t('skdr.charts.high')} ({fmt(max)})</span>
            <span className="ml-auto">{t('skdr.charts.weekAxis')}</span>
          </div>
        </div>
      )}
    </Panel>
  )
}

export default function TrendHeatmap({ query }: { query: Record<string, unknown> }) {
  const { t } = useTranslation()
  const [ov, setOv] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const q = qs(query)
  useEffect(() => {
    let alive = true; setErr('')
    peFetch<{ data: Overview }>(`/api/v1/analytics/overview?${q}`).then((j) => alive && setOv(j.data)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [q])
  if (err) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{t('skdr.charts.loadFailed')}: {err}</div>
  if (!ov) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-[#0060A9]">{t('skdr.charts.loading')}</div>
  return (
    <div className="space-y-3" data-testid="trend-heatmap">
      {ov.disease_not_found ? <Empty>{t('skdr.charts.diseaseNotFound')}</Empty> : null}
      <div className={`grid grid-cols-1 gap-3 ${ov.sources.ebs && ov.sources.pe ? 'xl:grid-cols-2' : ''}`}>
        {ov.sources.ebs ? <Trend ov={ov} src="ebs" /> : null}
        {ov.sources.pe ? <Trend ov={ov} src="pe" /> : null}
      </div>
      <Heatmap ov={ov} />
    </div>
  )
}

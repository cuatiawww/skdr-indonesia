'use client'
// PR 010/012: executive summary (sheet "Spesifikasi Dashboard Executive"). Order (PR 011/012): 4 summary cards → map
// (afterCards) → charts: trend + heatmap (No. 50–64), CFR with 95% CI, 7-1-7 gauges, PE status donut, coverage.
// Indicator definitions come from app_settings.dashboard_executive via /api/v1/dashboard/executive; UI text from locale keys.
// Spec rule: EBS alerts and Kasus PE are always labelled by source and never summed. The indicator status table moved to /dokumentasi.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { ciText, fmt as n, pct1, rateText, type Rate } from '@/lib/analytics-api'
import SourceBadge, { Empty, Panel } from '@/components/analytics/SourceBadge'
import TrendHeatmap from '@/components/analytics/TrendHeatmap'

export { rateText }
type EbsSub = { code: string; label: string; alerts: number; verified: number; discarded: number; verified_rate: Rate; cases: number; deaths: number | null; notification: Rate; notification_missing: number }
type Card = {
  code: string; label: string; color: string; pe_form: string; link?: string; disease_code?: string | null; ebs: EbsSub[]
  individual: { total: number; by_status: Record<string, number>; unclassified: number; deaths: number; split?: { label: string; codes: string[] }[]; status_defs?: { code: string; label: string }[] }
}
type CfrRow = { label: string; star: boolean; known: number; deaths: number; unknown: number; cfr?: Rate }
type Exec = {
  filters: { scope: string; disease: string | null; source: string | null; start_date: string | null; end_date: string | null }
  header: { individual_reports: number | null; ebs_alerts_zoonosis: number | null; ebs_alerts_all: number | null; form_reports: number | null }
  no_group_for_disease: boolean
  cards: Card[]
  cfr: { groups: { code: string; label: string; color: string; rows: CfrRow[] }[]; star_deaths: { label: string; deaths: number }[] }
  pe_status: { code: string; label: string; pe_form: string; by_status: Record<string, number> }[]
  nik: Rate
  coverage: { provinces: Rate; kabkota: Rate; provinces_missing?: string[]; kab_by_province?: { name: string; num: number; den: number }[] }
  config: { status_labels: Record<string, string>; texts: Record<string, string>; pe_count_statuses: string[] }
}

const dmy = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—')
const PE_STATUSES = ['draf', 'dikirim', 'dikembalikan', 'terverifikasi', 'final']
const STATUS_COLOR: Record<string, string> = { draf: '#94a3b8', dikirim: '#0060A9', dikembalikan: '#f59e0b', terverifikasi: '#10b981', final: '#0f766e' }

function Shell({ children, color, className = '' }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <article className={`relative overflow-hidden border border-slate-200 bg-white p-4 shadow-sm ${className}`} style={{ borderRadius: '17px 17px 22px 17px' }}>
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

export default function ExecutiveSummary({ query, afterCards }: { query: Record<string, string | number | undefined | null>; afterCards?: React.ReactNode }) {
  const { t } = useTranslation()
  const [d, setD] = useState<Exec | null>(null)
  const [err, setErr] = useState('')
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
  useEffect(() => {
    let alive = true
    setErr('')
    peFetch<{ data: Exec }>(`/api/v1/dashboard/executive?${qs}`).then((j) => alive && setD(j.data)).catch((e) => alive && setErr(e.message || t('skdr.exec.loadFailed')))
    return () => { alive = false }
  }, [qs]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{t('skdr.exec.loadFailed')}: {err}</div>
  if (!d) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-[#0060A9]">{t('skdr.exec.loading')}</div>

  const src = d.filters.source
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
  const statusTotals = PE_STATUSES.map((s) => ({ code: s, name: d.config.status_labels?.[s] ?? s, value: d.pe_status.reduce((a, p) => a + (p.by_status[s] ?? 0), 0) }))
  const peTotal = statusTotals.reduce((a, s) => a + s.value, 0)
  const cov = [{ name: t('skdr.exec.province'), r: d.coverage.provinces }, { name: t('skdr.exec.kabkota'), r: d.coverage.kabkota }].map((x) => ({ ...x, pct: x.r.pct ?? 0 }))

  return (
    <section className="w-full space-y-4" aria-label={t('skdr.exec.aria')}>
      <p className="rounded-xl border border-[#cfe0f1] bg-white px-4 py-2.5 text-sm text-slate-700">
        {t('skdr.exec.showing')} {parts.join(` ${t('skdr.exec.and')} `)} · {dmy(d.filters.start_date)} – {dmy(d.filters.end_date)} · {d.filters.scope} · {d.filters.disease || t('skdr.exec.allDiseases')}
        {showEbs && h.ebs_alerts_all !== null ? <span className="text-slate-500"> ({t('skdr.exec.allEbs', { n: n(h.ebs_alerts_all) })})</span> : null}
      </p>
      {d.no_group_for_disease ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">{t('skdr.exec.notZoonosis')}</div> : null}

      {/* No. 12–20 — ringkasan per penyakit (EBS dan Kasus PE dipisah) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4" data-testid="summary-cards">
        {d.cards.map((c) => {
          const ind = c.individual
          return (
            <Shell key={c.code} color={c.color}>
              <span className="rounded px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white" style={{ background: c.color }}>{c.label}</span>
              {showEbs ? (
                <div className="mt-3 border-l-2 pl-3" style={{ borderColor: c.color }}>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{t('skdr.exec.ebsAlerts')}* <SourceBadge source="ebs" /></div>
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                    {c.ebs.map((s) => (
                      <div key={s.code}>
                        <div className="text-2xl font-black text-slate-900">{n(s.alerts)}</div>
                        {c.ebs.length > 1 ? <div className="text-[11px] font-semibold text-slate-600">{t('skdr.exec.alertOf', { label: s.label })}</div> : null}
                        <div className="text-[11px] text-slate-600">{t('skdr.exec.verifiedLine', { v: n(s.verified), rate: rateText(s.verified_rate), cases: n(s.cases) })}</div>
                        {s.deaths !== null ? <div className="text-[11px] font-semibold text-red-600">{t('skdr.exec.deathsN', { n: n(s.deaths) })}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {showPe ? (
                <div className={`mt-3 ${showEbs ? 'border-t border-slate-100 pt-3' : ''}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{t('skdr.exec.individual')}* <SourceBadge source="pe" /></div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div className="flex gap-4">
                      {ind.split ? ind.split.map((sp) => (
                        <div key={sp.label}>
                          <div className="text-2xl font-black text-slate-900">{n(sp.codes.reduce((s, k) => s + (ind.by_status[k] ?? 0), 0))}</div>
                          <div className="text-[11px] font-semibold text-slate-600">{sp.label}</div>
                        </div>
                      )) : <div className="text-2xl font-black text-slate-900">{n(ind.total)}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-red-600">{n(ind.deaths)}</div>
                      <div className="text-[11px] text-red-600">{t('skdr.exec.deaths')}</div>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    {(ind.status_defs || []).map((s) => `${n(ind.by_status[s.code] ?? 0)} ${s.label}`).join(' · ')}
                    {ind.unclassified ? ` · ${t('skdr.exec.others', { n: n(ind.unclassified) })}` : ''}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                {c.disease_code ? <Link href={`/penyakit/${c.disease_code.toLowerCase()}`} className="font-bold text-[#0060A9] hover:underline">{t('skdr.exec.diseasePage')}</Link> : <span />}
                <Link href={c.link || `/pe/${c.pe_form}`} className="font-bold text-[#0060A9] hover:underline">{t('skdr.exec.peList')}</Link>
              </div>
            </Shell>
          )
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{tx.footnote} {tx.individual_def} {tx.alert_def}</p>

      {/* PR 011: peta lebar penuh langsung di bawah 4 kartu ringkasan */}
      {afterCards}

      {/* PR 012: No. 50–64 — tren mingguan + heatmap minggu epid × provinsi */}
      <TrendHeatmap query={query as Record<string, unknown>} />

      {/* No. 21–35 — CFR + 95% CI (Kasus PE, kasus konfirmasi) */}
      {showPe && d.cfr.groups.length ? (
        <Panel title={t('skdr.exec.cfrTitle')} sources={['pe']} testId="cfr">
          {star > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
                  <tr><th className="px-2 py-2">{t('skdr.exec.cfrStatus')}</th><th>{t('skdr.exec.cfrKnown')}</th><th>{t('skdr.exec.cfrDeaths')}</th><th>CFR</th><th>{t('skdr.exec.cfrCi')}</th><th>{t('skdr.exec.cfrUnknown')}</th></tr>
                </thead>
                <tbody>
                  {d.cfr.groups.map((g) => [
                    <tr key={g.code} className="bg-slate-100"><td colSpan={6} className="px-2 py-1.5 text-xs font-black uppercase" style={{ color: g.color }}>{g.label}</td></tr>,
                    ...g.rows.map((r) => (
                      <tr key={g.code + r.label} className={`border-b border-slate-100 ${r.star && r.deaths > 0 ? 'bg-amber-50' : ''}`}>
                        <td className={`px-2 py-1.5 ${r.star ? '' : 'font-bold'}`}>{r.label}</td>
                        <td>{n(r.known)}</td>
                        <td className={r.star ? (r.deaths > 0 ? 'font-bold text-amber-700' : '') : 'font-bold text-red-600'}>{n(r.deaths)}</td>
                        <td>{r.star ? t('skdr.exec.notCounted') : rateText(r.cfr)}</td>
                        <td>{r.star ? '-' : ciText(r.cfr)}</td>
                        <td>{n(r.unknown)}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{tx.cfr_note} {t('skdr.exec.fractionNote')} {t('skdr.exec.cfrZoom', { max: pct1(cfrMax) })}</p>
        </Panel>
      ) : null}

      {/* PR 013: equal-height cards (grid stretch + Panel h-full), no blank bottoms. */}
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {/* No. 41–45 — 7-1-7 */}
        {showEbs ? (
          <Panel title={t('skdr.exec.t717')} sources={['ebs']} testId="gauges-717">
            <div className="grid flex-1 grid-cols-2 content-center gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              <Gauge r={null} label={t('skdr.exec.detect7')} />
              {subs.map((s) => <Gauge key={s.group + s.code} r={s.notification} label={`${t('skdr.exec.notify1')} · ${s.label}`} />)}
              <Gauge r={null} label={t('skdr.exec.respond7')} />
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('skdr.exec.t717Note')}</p>
          </Panel>
        ) : null}

        {/* Status alur PE (donut) + Kelengkapan NIK */}
        {showPe ? (
          <Panel title={t('skdr.exec.peStatus')} sources={['pe']} testId="pe-donut">
            {peTotal ? (
              <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
                <div className="relative aspect-square w-full max-w-[260px] shrink-0 sm:w-[48%]" data-testid="donut-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusTotals.filter((s) => s.value)} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="98%" paddingAngle={2} isAnimationActive={false}>
                        {statusTotals.filter((s) => s.value).map((s) => <Cell key={s.code} fill={STATUS_COLOR[s.code]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => n(Number(v))} contentStyle={{ fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-900">{n(peTotal)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('skdr.exec.peTotal')}</span>
                  </div>
                </div>
                <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
                  {statusTotals.map((s) => (
                    <li key={s.code} className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded" style={{ background: STATUS_COLOR[s.code] }} />{s.name}</span>
                      <span><b className="text-lg">{n(s.value)}</b> <span className="text-xs text-slate-500">{peTotal ? `${pct1((s.value / peTotal) * 100)}%` : ''}</span></span>
                    </li>
                  ))}
                  <li className="border-t border-slate-100 pt-2 text-xs text-slate-500">{d.pe_status.map((p) => <Link key={p.code} href={`/pe/${p.pe_form}`} className="mr-2 font-semibold text-[#0060A9] hover:underline">{p.label}</Link>)}</li>
                </ul>
              </div>
            ) : <Empty>{t('skdr.exec.peEmpty')}</Empty>}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" data-testid="nik-kpi">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('skdr.exec.nikTitle')}</div>
                <div className="text-xs text-slate-500">{d.nik.den ? `${n(d.nik.num)} / ${n(d.nik.den)} ${t('skdr.exec.nikUnit')}` : t('skdr.exec.noData')}</div>
              </div>
              <div className="text-3xl font-black text-slate-900">{rateText(d.nik)}</div>
            </div>
          </Panel>
        ) : null}

        {/* Cakupan wilayah: big KPI, thick bars, unreported provinces */}
        <Panel title={t('skdr.exec.coverage')} sources={showEbs && showPe ? ['ebs', 'pe'] : [showEbs ? 'ebs' : 'pe']} testId="coverage">
          <div className="grid grid-cols-2 gap-4">
            {cov.map((c) => (
              <div key={c.name}>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.name}</div>
                <div className="text-4xl font-black leading-tight text-slate-900" data-testid="coverage-kpi">{rateText(c.r)}</div>
                <div className="text-sm text-slate-600">{n(c.r.num)} / {n(c.r.den)} {t('skdr.exec.reporting')}</div>
                <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(c.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={c.name}>
                  <div className="h-full rounded-full bg-[#00A3AD]" style={{ width: `${Math.min(100, c.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" data-testid="coverage-missing">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('skdr.exec.missingProv', { n: n(d.coverage.provinces_missing?.length ?? 0) })}</div>
            {d.coverage.provinces_missing?.length ? (
              <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {d.coverage.provinces_missing.map((p) => <span key={p} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">{p}</span>)}
              </div>
            ) : <div className="mt-1 text-sm font-semibold text-emerald-700">{t('skdr.exec.allReported')}</div>}
            {d.coverage.kab_by_province?.length ? (
              <div className="mt-3 border-t border-slate-200 pt-3" data-testid="coverage-lowest">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('skdr.exec.lowestKab')}</div>
                <ul className="mt-2 space-y-2">
                  {d.coverage.kab_by_province.map((p) => {
                    const v = p.den ? (p.num / p.den) * 100 : 0
                    return (
                      <li key={p.name} className="text-sm">
                        <div className="flex justify-between gap-2"><span className="truncate text-slate-700">{p.name}</span><span className="shrink-0 font-bold text-slate-900">{pct1(v)}% <span className="font-normal text-slate-500">({n(p.num)}/{n(p.den)})</span></span></div>
                        <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#00A3AD]" style={{ width: `${v}%` }} /></div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('skdr.exec.coverageNote')}</p>
        </Panel>
      </div>
      {d.cards.length === 0 && !d.no_group_for_disease ? <div className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{t('skdr.exec.noConfig')}</div> : null}
    </section>
  )
}

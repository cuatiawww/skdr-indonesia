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
  coverage: { provinces: Rate; kabkota: Rate }
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
      <div className="relative h-28 w-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ v }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="v" cornerRadius={8} fill={tone} background={{ fill: '#f1f5f9' }} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black text-slate-900">{r ? rateText(r) : '—'}</span>
          {r && r.den ? <span className="text-[10px] text-slate-500">{n(r.num)}/{n(r.den)}</span> : <span className="px-2 text-center text-[9px] leading-tight text-slate-400">{t('skdr.exec.noData')}</span>}
        </div>
      </div>
      <div className="mt-1 text-center text-[11px] font-semibold text-slate-700">{label}</div>
    </div>
  )
}

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
  const cfrData = d.cfr.groups.flatMap((g) => g.rows.filter((r) => !r.star && r.cfr).map((r) => ({
    name: g.label, color: g.color, pct: r.cfr!.den ? r.cfr!.pct ?? 0 : 0, den: r.cfr!.den, text: rateText(r.cfr), ci: ciText(r.cfr),
    err: r.cfr!.den && r.cfr!.ci_low !== null && r.cfr!.ci_high !== null ? [Math.max(0, (r.cfr!.pct ?? 0) - r.cfr!.ci_low), Math.max(0, r.cfr!.ci_high - (r.cfr!.pct ?? 0))] : null, // null = no whisker (recharts would emit duplicate keys for zero-length whiskers)
  })))
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
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.exec.ebsAlerts')}* <SourceBadge source="ebs" /></div>
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
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.exec.individual')}* <SourceBadge source="pe" /></div>
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
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <b>{t('skdr.exec.checkData')}</b> {t('skdr.exec.checkDataText', { n: n(star), list: d.cfr.star_deaths.map((x) => `${x.label.replace('*', '')} ${n(x.deaths)}`).join(' · ') })}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="h-56 xl:col-span-2">
              {cfrData.some((x) => x.den > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cfrData} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip formatter={(_v: any, _k: any, p: any) => [`${p.payload.text} (95% CI ${p.payload.ci})`, 'CFR']} />
                    <Bar dataKey="pct" isAnimationActive={false}>
                      {cfrData.map((x) => <Cell key={x.name} fill={x.color} />)}
                      <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="#334155" direction="x" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty>{t('skdr.exec.cfrEmpty')}</Empty>}
            </div>
            <div className="overflow-x-auto xl:col-span-3">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="py-2">{t('skdr.exec.cfrStatus')}</th><th>{t('skdr.exec.cfrKnown')}</th><th>{t('skdr.exec.cfrDeaths')}</th><th>CFR</th><th>{t('skdr.exec.cfrCi')}</th><th>{t('skdr.exec.cfrUnknown')}</th></tr>
                </thead>
                <tbody>
                  {d.cfr.groups.map((g) => [
                    <tr key={g.code} className="bg-slate-100"><td colSpan={6} className="px-2 py-1.5 text-[11px] font-black uppercase" style={{ color: g.color }}>{g.label}</td></tr>,
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
          <p className="mt-2 text-[11px] text-slate-500">{tx.cfr_note} {t('skdr.exec.fractionNote')}</p>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* No. 41–45 — 7-1-7 */}
        {showEbs ? (
          <Panel title={t('skdr.exec.t717')} sources={['ebs']} testId="gauges-717">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Gauge r={null} label={t('skdr.exec.detect7')} />
              {subs.map((s) => <Gauge key={s.group + s.code} r={s.notification} label={`${t('skdr.exec.notify1')} · ${s.label}`} />)}
              <Gauge r={null} label={t('skdr.exec.respond7')} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{t('skdr.exec.t717Note')}</p>
          </Panel>
        ) : null}

        {/* Status alur PE (donut) */}
        {showPe ? (
          <Panel title={t('skdr.exec.peStatus')} sources={['pe']} testId="pe-donut">
            {peTotal ? (
              <div className="flex items-center gap-3">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusTotals.filter((s) => s.value)} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" paddingAngle={2} isAnimationActive={false}>
                        {statusTotals.filter((s) => s.value).map((s) => <Cell key={s.code} fill={STATUS_COLOR[s.code]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => n(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-1 text-xs">
                  {statusTotals.map((s) => <li key={s.code} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s.code] }} />{s.name}</span><b>{n(s.value)}</b></li>)}
                  <li className="border-t border-slate-100 pt-1 text-[11px] text-slate-500">{d.pe_status.map((p) => <Link key={p.code} href={`/pe/${p.pe_form}`} className="mr-2 font-semibold text-[#0060A9] hover:underline">{p.label}</Link>)}</li>
                </ul>
              </div>
            ) : <Empty>{t('skdr.exec.peEmpty')}</Empty>}
            <p className="mt-2 text-[11px] text-slate-500">{t('skdr.exec.nik', { rate: rateText(d.nik) })}{d.nik.den ? ` (${n(d.nik.num)}/${n(d.nik.den)})` : ''}.</p>
          </Panel>
        ) : null}

        {/* Cakupan wilayah */}
        <Panel title={t('skdr.exec.coverage')} sources={showEbs && showPe ? ['ebs', 'pe'] : [showEbs ? 'ebs' : 'pe']} testId="coverage">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cov} layout="vertical" margin={{ left: 10, right: 40 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(_v: any, _k: any, p: any) => [`${rateText(p.payload.r)} (${n(p.payload.r.num)}/${n(p.payload.r.den)})`, t('skdr.exec.coverage')]} />
                <Bar dataKey="pct" fill="#00A3AD" background={{ fill: '#f1f5f9' }} radius={[0, 6, 6, 0]} isAnimationActive={false}
                  label={{ position: 'right', fontSize: 11, formatter: (v: any) => `${pct1(Number(v))}%` }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {cov.map((c) => <div key={c.name} className="text-[11px] text-slate-600">{c.name}: <b>{rateText(c.r)}</b> ({n(c.r.num)} / {n(c.r.den)})</div>)}
          <p className="mt-2 text-[11px] text-slate-500">{t('skdr.exec.coverageNote')}</p>
        </Panel>
      </div>
      {d.cards.length === 0 && !d.no_group_for_disease ? <div className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />{t('skdr.exec.noConfig')}</div> : null}
    </section>
  )
}

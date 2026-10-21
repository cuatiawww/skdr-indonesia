'use client'
// PR 012: disease page /penyakit/[kode]: info (description, symptoms, transmission, ICD-10 from master_diseases), filters
// (Sumber, provinsi, kab/kota, periode), epi curve per week, choropleth, age & sex, CFR, top wilayah, latest EBS/PE reports.
// EBS and Kasus PE are separate everywhere (never summed).
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '@/components/PageHeader'
import ChoroplethMap from '@/components/analytics/ChoroplethMap'
import SourceBadge, { Empty, Panel, SourceFilter, SOURCE_COLOR } from '@/components/analytics/SourceBadge'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { ciText, fmt, qs, rateText, type DiseaseDetail, type Rate } from '@/lib/analytics-api'

type Opt = { id: number; name: string; code?: string }
const PERIODS = [12, 26, 52, 104]
const iso = (d: Date) => d.toISOString().slice(0, 10)
const sel = 'rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50'

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return <div><div className={`text-2xl font-black ${tone}`}>{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>
}
function CfrCard({ title, src, r, note }: { title: string; src: 'ebs' | 'pe'; r: Rate; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title} <SourceBadge source={src} /></div>
      <div className="mt-1 text-2xl font-black text-red-600">{rateText(r)}</div>
      <div className="text-[11px] text-slate-600">95% CI (Wilson): {ciText(r)} · {fmt(r.num)} / {fmt(r.den)}</div>
      <div className="mt-1 text-[10px] text-slate-400">{note}</div>
    </div>
  )
}

export default function DiseaseDetailPage() {
  const { t } = useTranslation()
  const { kode } = useParams<{ kode: string }>()
  const [source, setSource] = useState('all')
  const [prov, setProv] = useState('')
  const [kab, setKab] = useState('')
  const [weeks, setWeeks] = useState(52)
  const [provinces, setProvinces] = useState<Opt[]>([])
  const [kabs, setKabs] = useState<Opt[]>([])
  const [d, setD] = useState<DiseaseDetail | null>(null)
  const [err, setErr] = useState<{ msg: string; status?: number } | null>(null)
  const [mapMetric, setMapMetric] = useState<'ebs_alerts' | 'ebs_cases' | 'pe_cases'>('ebs_alerts')
  const [topMetric, setTopMetric] = useState<'ebs_alerts' | 'ebs_cases' | 'pe_cases'>('ebs_alerts')
  useEffect(() => { peFetch<{ data: Opt[] }>('/api/v1/master/provinces').then((j) => setProvinces(j.data)).catch(() => {}) }, [])
  useEffect(() => { setKabs([]); if (prov) peFetch<{ data: Opt[] }>(`/api/v1/master/kabkota?province_id=${prov}`).then((j) => setKabs(j.data)).catch(() => {}) }, [prov])
  const query = useMemo(() => {
    const end = new Date(); const start = new Date(end.getTime() - (weeks * 7 - 1) * 86400000)
    return qs({ source, province_id: prov, kabkota_id: kab, start_date: iso(start), end_date: iso(end) })
  }, [source, prov, kab, weeks])
  useEffect(() => {
    let a = true; setErr(null)
    peFetch<{ data: DiseaseDetail }>(`/api/v1/analytics/diseases/${encodeURIComponent(kode)}?${query}`).then((j) => a && setD(j.data))
      .catch((e) => a && setErr({ msg: e.message, status: e.status }))
    return () => { a = false }
  }, [kode, query])
  useEffect(() => {
    if (!d) return
    const ok = (m: string) => (m.startsWith('ebs') ? d.sources.ebs : d.sources.pe)
    if (!ok(mapMetric)) setMapMetric(d.sources.ebs ? 'ebs_alerts' : 'pe_cases')
    if (!ok(topMetric)) setTopMetric(d.sources.ebs ? 'ebs_alerts' : 'pe_cases')
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/penyakit" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0060A9]"><ArrowLeft className="h-3.5 w-3.5" /> {t('skdr.penyakit.back')}</Link>
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{err.status === 404 ? t('skdr.penyakit.notFound') : `${t('skdr.penyakit.loadFailed')}: ${err.msg}`}</div>
    </div>
  )
  if (!d) return <div className="w-full p-8 text-sm font-semibold text-[#0060A9]">{t('skdr.penyakit.loading')}</div>

  const info = d.disease
  const epi = d.weeks.map((w, i) => ({ label: w.label, start: w.start, ebs_alerts: d.epi.ebs_alerts[i], ebs_cases: d.epi.ebs_cases[i], pe_cases: d.epi.pe_cases[i], pe_deaths: d.epi.pe_deaths[i] }))
  const provCode = provinces.find((p) => String(p.id) === prov)?.code ?? d.regions[0]?.code?.slice(0, 2) ?? null
  const mapValues = Object.fromEntries(d.regions.map((r) => [r.code, r[mapMetric]]))
  const metricLabel = (m: string) => t(m === 'ebs_alerts' ? 'skdr.charts.metricAlerts' : m === 'ebs_cases' ? 'skdr.charts.metricEbsCases' : 'skdr.charts.metricPeCases')
  const metricOpts = [...(d.sources.ebs ? ['ebs_alerts', 'ebs_cases'] : []), ...(d.sources.pe ? ['pe_cases'] : [])] as ('ebs_alerts' | 'ebs_cases' | 'pe_cases')[]
  const hasEbs = d.totals.ebs_alerts > 0, hasPe = d.totals.pe_cases > 0
  const sexColors = ['#0060A9', '#db2777', '#94a3b8']

  return (
    <div className="w-full space-y-5 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8" data-testid="disease-detail">
      <Link href="/penyakit" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0060A9] hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> {t('skdr.penyakit.back')}</Link>
      <PageHeader title={info.name} subtitle={[info.english_name, info.icd10 ? `ICD-10 ${info.icd10}` : null, info.category].filter(Boolean).join(' · ')}
        actions={d.pe_form ? <Link href={`/pe/${d.pe_form}`} className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85]">{t('skdr.penyakit.openPe')}</Link> : undefined} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[['description', info.description], ['symptoms', info.symptoms], ['transmission', info.transmission]].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(`skdr.penyakit.${k}`)}</div>
            <p className="mt-1 leading-relaxed text-slate-700">{(v as string) || t('skdr.penyakit.noInfo')}</p>
          </div>
        ))}
      </div>

      {/* filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs" data-testid="disease-filters">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.source.filter')}</span>
        <SourceFilter value={source} onChange={setSource} />
        <select aria-label={t('skdr.penyakit.province')} className={sel} value={prov} onChange={(e) => { setProv(e.target.value); setKab('') }}>
          <option value="">{t('skdr.penyakit.allProvinces')}</option>
          {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label={t('skdr.penyakit.kabkota')} className={sel} value={kab} disabled={!prov} onChange={(e) => setKab(e.target.value)}>
          <option value="">{prov ? t('skdr.penyakit.allKab') : t('skdr.penyakit.pickProvinceFirst')}</option>
          {kabs.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <select aria-label={t('skdr.penyakit.period')} className={sel} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {PERIODS.map((w) => <option key={w} value={w}>{t('skdr.penyakit.lastWeeks', { n: w })}</option>)}
        </select>
        <span className="ml-auto text-[11px] text-slate-500">{d.scope} · {d.weeks[0]?.start} – {d.weeks[d.weeks.length - 1]?.start}</span>
      </div>

      {/* totals */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {d.sources.ebs ? (
          <Panel title={t('skdr.penyakit.totalsEbs')} sources={['ebs']} testId="totals-ebs">
            <div className="flex flex-wrap gap-8"><Stat label={t('skdr.charts.metricAlerts')} value={fmt(d.totals.ebs_alerts)} /><Stat label={t('skdr.charts.metricEbsCases')} value={fmt(d.totals.ebs_cases)} /><Stat label={t('skdr.penyakit.deaths')} value={fmt(d.totals.ebs_deaths)} tone="text-red-600" /></div>
          </Panel>
        ) : null}
        {d.sources.pe ? (
          <Panel title={t('skdr.penyakit.totalsPe')} sources={['pe']} testId="totals-pe">
            <div className="flex flex-wrap gap-8"><Stat label={t('skdr.charts.metricPeCases')} value={fmt(d.totals.pe_cases)} /><Stat label={t('skdr.penyakit.deaths')} value={fmt(d.totals.pe_deaths)} tone="text-red-600" /></div>
            {!d.pe_form ? <p className="mt-2 text-[11px] text-slate-500">{t('skdr.penyakit.noPeForm')}</p> : null}
          </Panel>
        ) : null}
      </div>

      {/* epi curve: separate charts per source */}
      <div className={`grid grid-cols-1 gap-3 ${d.sources.ebs && d.sources.pe ? 'xl:grid-cols-2' : ''}`}>
        {d.sources.ebs ? (
          <Panel title={t('skdr.penyakit.epiEbs')} sources={['ebs']} testId="epi-ebs">
            {hasEbs ? (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={epi}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="a" tick={{ fontSize: 10 }} allowDecimals={false} width={36} /><YAxis yAxisId="c" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} width={40} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="a" dataKey="ebs_alerts" name={t('skdr.charts.metricAlerts')} fill={SOURCE_COLOR.ebs} isAnimationActive={false} />
                  <Line yAxisId="c" dataKey="ebs_cases" name={t('skdr.charts.metricEbsCases')} stroke="#7c2d12" dot={false} strokeWidth={2} isAnimationActive={false} />
                </ComposedChart></ResponsiveContainer></div>
            ) : <Empty>{t('skdr.penyakit.emptyEbs')}</Empty>}
          </Panel>
        ) : null}
        {d.sources.pe ? (
          <Panel title={t('skdr.penyakit.epiPe')} sources={['pe']} testId="epi-pe">
            {hasPe ? (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={epi}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pe_cases" name={t('skdr.charts.metricPeCases')} fill={SOURCE_COLOR.pe} isAnimationActive={false} />
                  <Bar dataKey="pe_deaths" name={t('skdr.penyakit.deaths')} fill="#dc2626" isAnimationActive={false} />
                </BarChart></ResponsiveContainer></div>
            ) : <Empty>{d.pe_form ? t('skdr.penyakit.emptyPe') : t('skdr.penyakit.noPeForm')}</Empty>}
          </Panel>
        ) : null}
      </div>

      {/* map + top regions */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title={d.level === 'province' ? t('skdr.penyakit.mapProvince') : t('skdr.penyakit.mapKab')} sources={[mapMetric.startsWith('ebs') ? 'ebs' : 'pe']} className="xl:col-span-2" testId="map-panel"
          right={<select aria-label={t('skdr.charts.metric')} className={sel} value={mapMetric} onChange={(e) => setMapMetric(e.target.value as any)}>{metricOpts.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}</select>}>
          <ChoroplethMap level={d.level} provinceCode={provCode} values={mapValues} hue={mapMetric.startsWith('ebs') ? 'ebs' : 'pe'}
            onPick={d.level === 'province' ? (code) => { const p = provinces.find((x) => x.code === code); if (p) { setProv(String(p.id)); setKab('') } } : undefined} />
        </Panel>
        <Panel title={t('skdr.penyakit.topRegions')} sources={[topMetric.startsWith('ebs') ? 'ebs' : 'pe']} testId="top-regions"
          right={<select aria-label={t('skdr.charts.metric')} className={sel} value={topMetric} onChange={(e) => setTopMetric(e.target.value as any)}>{metricOpts.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}</select>}>
          {d.top[topMetric]?.length ? (
            <table className="w-full text-xs"><tbody>
              {d.top[topMetric].map((r, i) => (
                <tr key={r.id} className="border-b border-slate-100"><td className="w-6 py-1.5 text-slate-400">{i + 1}</td><td className="font-semibold text-slate-700">{r.name}</td><td className="text-right font-mono">{fmt(r.value)}</td></tr>
              ))}
            </tbody></table>
          ) : <Empty>{t('skdr.penyakit.emptyRegions')}</Empty>}
        </Panel>
      </div>

      {/* age/sex + CFR */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {d.sources.pe ? (
          <Panel title={t('skdr.penyakit.ageSex')} sources={['pe']} className="xl:col-span-2" testId="age-sex">
            {d.age.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="h-56 md:col-span-2"><ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.age}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="group" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="male" stackId="s" name={t('skdr.penyakit.male')} fill="#0060A9" isAnimationActive={false} />
                    <Bar dataKey="female" stackId="s" name={t('skdr.penyakit.female')} fill="#db2777" isAnimationActive={false} />
                    <Bar dataKey="unknown" stackId="s" name={t('skdr.penyakit.unknown')} fill="#94a3b8" isAnimationActive={false} />
                  </BarChart></ResponsiveContainer></div>
                <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={d.sex} dataKey="n" nameKey="sex" innerRadius="50%" outerRadius="85%" isAnimationActive={false}>{d.sex.map((s, i) => <Cell key={s.sex} fill={sexColors[i % 3]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
                </ResponsiveContainer></div>
              </div>
            ) : <Empty>{t('skdr.penyakit.emptyAge')}</Empty>}
            <p className="mt-2 text-[11px] text-slate-500">{t('skdr.penyakit.ageNote')}</p>
          </Panel>
        ) : null}
        <Panel title="CFR" testId="cfr-disease">
          <div className="space-y-3">
            {d.sources.pe ? <CfrCard title={t('skdr.penyakit.cfrPe')} src="pe" r={d.cfr.pe.rate} note={d.cfr.pe.label ? t('skdr.penyakit.cfrPeNote', { label: d.cfr.pe.label }) : t('skdr.penyakit.cfrPeNoteAll')} /> : null}
            {d.sources.ebs ? <CfrCard title={t('skdr.penyakit.cfrEbs')} src="ebs" r={d.cfr.ebs.rate} note={t('skdr.penyakit.cfrEbsNote')} /> : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{t('skdr.penyakit.cfrRule')}</p>
        </Panel>
      </div>

      {/* latest reports */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {d.sources.ebs ? (
          <Panel title={t('skdr.penyakit.latestEbs')} sources={['ebs']} testId="latest-ebs">
            {d.latest.ebs.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1">{t('skdr.penyakit.colNoEbs')}</th><th>{t('skdr.penyakit.colDate')}</th><th>{t('skdr.penyakit.colRegion')}</th><th>{t('skdr.penyakit.colStatus')}</th><th className="text-right">{t('skdr.penyakit.colCases')}</th><th className="text-right">{t('skdr.penyakit.colDeaths')}</th></tr></thead>
                <tbody>{d.latest.ebs.map((r, i) => (
                  <tr key={(r.no_ebs || '') + i} className="border-b border-slate-100"><td className="py-1.5 font-mono">{r.no_ebs || '—'}</td><td className="font-mono">{r.date || '—'}</td><td>{r.kabkota || '—'}<span className="text-slate-400"> · {r.province || ''}</span></td><td>{r.status || '—'}</td><td className="text-right">{fmt(r.cases)}</td><td className="text-right text-red-600">{fmt(r.deaths)}</td></tr>
                ))}</tbody></table></div>
            ) : <Empty>{t('skdr.penyakit.emptyEbs')}</Empty>}
          </Panel>
        ) : null}
        {d.sources.pe ? (
          <Panel title={t('skdr.penyakit.latestPe')} sources={['pe']} testId="latest-pe">
            {d.latest.pe.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1">{t('skdr.penyakit.colNoPe')}</th><th>{t('skdr.penyakit.colPatient')}</th><th>{t('skdr.penyakit.colDate')}</th><th>{t('skdr.penyakit.colRegion')}</th><th>{t('skdr.penyakit.colStatus')}</th></tr></thead>
                <tbody>{d.latest.pe.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100"><td className="py-1.5"><Link href={`/pe/${r.form_key}/${r.id}?mode=lihat`} className="font-mono font-semibold text-[#0060A9] hover:underline">{r.no_pe}</Link></td>
                    <td>{r.patient_initials || '—'}</td><td className="font-mono">{r.date || '—'}</td><td>{r.kabkota || '—'}</td>
                    <td><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span></td></tr>
                ))}</tbody></table></div>
            ) : <Empty>{d.pe_form ? t('skdr.penyakit.emptyPe') : t('skdr.penyakit.noPeForm')}</Empty>}
            <p className="mt-2 text-[11px] text-slate-400">{t('skdr.penyakit.privacy')}</p>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

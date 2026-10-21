'use client'
// PR 012/016: disease page /penyakit/[kode]. PR 016: editorial layout (after globalinfectiousdisease.com/diseases/*):
// eyebrow section labels with thin rules, big title, overview prose, two register/statistics boxes, then full-width
// trend and map without card frames. ONE filter bar at the top (Sumber Semua/EBS/Kasus PE, EBS measure, provinsi,
// kab/kota, periode; kept in the URL for Sumber/measure) drives every section. No per-section selects or badges.
// EBS and Kasus PE are told apart by colour + symbol and are never summed. Empty source = one muted line.
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChoroplethMap from '@/components/analytics/ChoroplethMap'
import { MutedNote, Section, SourceKey, SOURCE_COLOR } from '@/components/analytics/SourceBadge'
import { useEpiRange } from '@/components/analytics/EpiRangePicker'
import SkdrFilterBar from '@/components/SkdrFilterBar'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { ciText, fmt, qs, rateText, type DiseaseDetail, type Rate } from '@/lib/analytics-api'
import { useSumber } from '@/lib/use-sumber'
import { cssv } from '@/lib/theme'
import { ErrorState, SkeletonDetail } from '@/components/ui/Skeleton'

type Opt = { id: number; name: string; code?: string }
const sel = 'rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50'

function StatRow({ label, value, sub, src, tone = 'text-slate-900' }: { label: string; value: string; sub?: string; src?: 'ebs' | 'pe'; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">{src ? <SourceKey source={src} label={label} /> : <span className="text-xs font-semibold text-slate-600">{label}</span>}{sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}</div>
      <div className={`shrink-0 text-xl font-black ${tone}`}>{value}</div>
    </div>
  )
}
function Cfr({ src, title, r, note }: { src: 'ebs' | 'pe'; title: string; r: Rate; note: string }) {
  return (
    <div className="min-w-0">
      <SourceKey source={src} label={title} />
      <div className="mt-1 text-3xl font-black text-red-600">{rateText(r)}</div>
      <div className="text-xs text-slate-600">IK 95% (Wilson): {ciText(r)} · {fmt(r.num)} / {fmt(r.den)}</div>
      <div className="mt-1 text-[11px] text-slate-400">{note}</div>
    </div>
  )
}

export default function DiseaseDetailPage() {
  const { t } = useTranslation()
  const { kode } = useParams<{ kode: string }>()
  // PR 016: one filter pattern with the dashboard — Sumber + epi-week range (URL) + wilayah; EBS measure = alert
  // (reported cases are shown alongside in the statistics box), so no per-page measure toggle.
  const { sumber, setSumber, ready: sReady } = useSumber()
  const ukuran = 'alert' as 'alert' | 'kasus'
  const { range, setRange, ready: rReady } = useEpiRange()
  const ready = sReady && rReady
  const [prov, setProv] = useState('')
  const [kab, setKab] = useState('')
  const barValue = useMemo(() => ({ disease: 'all', source: sumber, provinceId: prov ? Number(prov) : null, kabkotaId: kab ? Number(kab) : null, ...range }), [sumber, prov, kab, range])
  const [provinces, setProvinces] = useState<Opt[]>([])
  const [kabs, setKabs] = useState<Opt[]>([])
  const [d, setD] = useState<DiseaseDetail | null>(null)
  const [err, setErr] = useState<{ msg: string; status?: number } | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { peFetch<{ data: Opt[] }>('/api/v1/master/provinces').then((j) => setProvinces(j.data)).catch(() => {}) }, [])
  useEffect(() => { setKabs([]); if (prov) peFetch<{ data: Opt[] }>(`/api/v1/master/kabkota?province_id=${prov}`).then((j) => setKabs(j.data)).catch(() => {}) }, [prov])
  const query = useMemo(() => {
    return qs({ source: sumber, province_id: prov, kabkota_id: kab, start_year: range.startYear, start_week: range.startWeek, end_year: range.endYear, end_week: range.endWeek })
  }, [sumber, prov, kab, range])
  useEffect(() => {
    if (!ready) return
    let a = true; setErr(null)
    peFetch<{ data: DiseaseDetail }>(`/api/v1/analytics/diseases/${encodeURIComponent(kode)}?${query}`).then((j) => a && setD(j.data))
      .catch((e) => a && setErr({ msg: e.message, status: e.status }))
    return () => { a = false }
  }, [kode, query, ready, tick])

  if (err) return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/penyakit" className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><ArrowLeft className="h-3.5 w-3.5" /> {t('skdr.penyakit.back')}</Link>
      {err.status === 404 ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">{t('skdr.penyakit.notFound')}</div> : <ErrorState message={err.msg} onRetry={() => setTick((x) => x + 1)} />}
    </div>
  )
  if (!d) return <SkeletonDetail />

  const info = d.disease
  const showEbs = d.sources.ebs, showPe = d.sources.pe
  const ebsKey = ukuran === 'kasus' ? 'ebs_cases' : 'ebs_alerts'
  const ebsLabel = ukuran === 'kasus' ? t('skdr.charts.metricEbsCases') : t('skdr.charts.metricAlerts')
  const epi = d.weeks.map((w, i) => ({ label: w.label, start: w.start, ebs: d.epi[ebsKey][i], pe_cases: d.epi.pe_cases[i], pe_deaths: d.epi.pe_deaths[i] }))
  const provCode = provinces.find((p) => String(p.id) === prov)?.code ?? d.regions[0]?.code?.slice(0, 2) ?? null
  const hasEbs = d.totals.ebs_alerts > 0, hasPe = d.totals.pe_cases > 0
  const peak = (arr: number[]) => { let k = -1; arr.forEach((v, i) => { if (v > 0 && (k < 0 || v > arr[k])) k = i }); return k < 0 ? null : { label: d.weeks[k].label, start: d.weeks[k].start, v: arr[k] } }
  const pkE = peak(d.epi[ebsKey]), pkP = peak(d.epi.pe_cases)
  const regE = d.regions.filter((r) => r[ebsKey] > 0).length, regP = d.regions.filter((r) => r.pe_cases > 0).length
  const regionWord = d.level === 'province' ? t('skdr.penyakit.provinceWord') : t('skdr.penyakit.kabWord')
  const period = `${d.weeks[0]?.start} → ${d.weeks[d.weeks.length - 1]?.start}`
  const sexColors = [cssv('brand-700'), '#db2777', '#94a3b8']
  const noPeText = d.pe_form ? t('skdr.penyakit.emptyPe') : t('skdr.penyakit.noPeForm')
  const pick = (code: string) => { const p = provinces.find((x) => x.code === code); if (p) { setProv(String(p.id)); setKab('') } }
  const topRows = [...d.regions].filter((r) => (showEbs ? r[ebsKey] : 0) + (showPe ? r.pe_cases : 0) > 0)
    .sort((a, b) => (showEbs ? b[ebsKey] - a[ebsKey] : 0) || b.pe_cases - a.pe_cases).slice(0, 10)
  const topMax = { e: Math.max(1, ...topRows.map((r) => r[ebsKey])), p: Math.max(1, ...topRows.map((r) => r.pe_cases)) }
  const twoMaps = showEbs && showPe && hasPe

  return (
    <div className="w-full space-y-8 bg-white px-4 py-6 sm:px-6 lg:px-8" data-testid="disease-detail">
      <Link href="/penyakit" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> {t('skdr.penyakit.back')}</Link>

      {/* IKHTISAR PENYAKIT */}
      <Section eyebrow={t('skdr.penyakit.eyebrowOverview')} testId="overview">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">{info.name}</h1>
            <p className="mt-1 text-base text-slate-500">{[info.english_name, info.icd10 ? `ICD-10 ${info.icd10}` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {info.category ? <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">{info.category}</span> : null}
            {info.is_zoonotic ? <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{t('skdr.penyakit.zoonotic')}</span> : null}
            {d.pe_form ? <Link href={`/pe/${d.pe_form}`} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">{t('skdr.penyakit.openPe')}</Link> : null}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div><h3 className="text-sm font-black text-slate-900">{t('skdr.penyakit.description')}</h3><p className="mt-1 text-sm leading-relaxed text-slate-700">{info.description || t('skdr.penyakit.noInfo')}</p></div>
          <div><h3 className="text-sm font-black text-slate-900">{t('skdr.penyakit.symptoms')}</h3><p className="mt-1 text-sm leading-relaxed text-slate-700">{info.symptoms || t('skdr.penyakit.noInfo')}</p></div>
          <div><h3 className="text-sm font-black text-slate-900">{t('skdr.penyakit.transmission')}</h3><p className="mt-1 text-sm leading-relaxed text-slate-700">{info.transmission || t('skdr.penyakit.noInfo')}</p></div>
        </div>
      </Section>

      {/* single page filter */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="disease-filters">
        {/* PR 017: filter bar static in document flow (no sticky/overlay over the stats) */}
        {/* PR 016: same SkdrFilterBar as the dashboard (Sumber + Provinsi + Kab/Kota + Periode), disease fixed by the page */}
        <SkdrFilterBar compact showDisease={false} sumber={sumber} onSumberChange={setSumber}
          value={barValue}
          onChange={() => {}}
          onApply={(f) => { setProv(f.provinceId ? String(f.provinceId) : ''); setKab(f.kabkotaId ? String(f.kabkotaId) : ''); setRange({ startYear: f.startYear, startWeek: f.startWeek, endYear: f.endYear, endWeek: f.endWeek }) }} />
        <p className="mt-2 text-right text-[11px] text-slate-500">{d.scope} · {period}</p>
      </div>

      {/* the only bordered boxes: register + key statistics */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-2xl border border-slate-200 p-5" data-testid="register-box">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">{t('skdr.penyakit.eyebrowRegister')}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">ICD-10</dt><dd className="text-2xl font-black text-slate-900">{info.icd10 || '—'}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('skdr.penyakit.codeSkdr')}</dt><dd className="font-mono text-base font-bold text-slate-900">{info.code}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('skdr.penyakit.categoryLabel')}</dt><dd className="font-semibold text-slate-800">{info.category || '—'}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('skdr.penyakit.peFormLabel')}</dt><dd className="font-semibold text-slate-800">{d.pe_form ? <Link className="text-primary hover:underline" href={`/pe/${d.pe_form}`}>{d.pe_form}</Link> : t('skdr.penyakit.none')}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 p-5" data-testid="stats-box">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">{t('skdr.penyakit.eyebrowStats')}</div>
          <div className="mt-2 grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {showEbs ? (
              <div>
                <StatRow src="ebs" label={ebsLabel} value={fmt(d.totals[ebsKey])} sub={ukuran === 'kasus' ? t('skdr.kpi.otherAlerts', { n: fmt(d.totals.ebs_alerts) }) : t('skdr.kpi.otherCases', { n: fmt(d.totals.ebs_cases) })} />
                <StatRow src="ebs" label={t('skdr.penyakit.deathsEbs')} value={fmt(d.totals.ebs_deaths)} tone="text-red-600" />
                <StatRow src="ebs" label={t('skdr.penyakit.peakWeek')} value={pkE ? pkE.label : '—'} sub={pkE ? t('skdr.penyakit.peakSub', { n: fmt(pkE.v), start: pkE.start }) : undefined} />
                <StatRow src="ebs" label={t('skdr.penyakit.coverage')} value={fmt(regE)} sub={regionWord} />
              </div>
            ) : null}
            {showPe ? (hasPe ? (
              <div>
                <StatRow src="pe" label={t('skdr.charts.metricPeCases')} value={fmt(d.totals.pe_cases)} />
                <StatRow src="pe" label={t('skdr.penyakit.deathsPe')} value={fmt(d.totals.pe_deaths)} tone="text-red-600" />
                <StatRow src="pe" label={t('skdr.penyakit.peakWeek')} value={pkP ? pkP.label : '—'} sub={pkP ? t('skdr.penyakit.peakSub', { n: fmt(pkP.v), start: pkP.start }) : undefined} />
                <StatRow src="pe" label={t('skdr.penyakit.coverage')} value={fmt(regP)} sub={regionWord} />
              </div>
            ) : <div className="py-2"><SourceKey source="pe" /><MutedNote testId="pe-empty-note">{noPeText}</MutedNote></div>) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{t('skdr.penyakit.periodLine', { period, scope: d.scope })}</p>
        </div>
      </div>

      {/* TREN */}
      <Section eyebrow={t('skdr.penyakit.eyebrowTrend')} testId="trend"
        right={<>{showEbs ? <SourceKey source="ebs" label={ebsLabel} /> : null}{showPe && hasPe ? <SourceKey source="pe" label={t('skdr.charts.metricPeCases')} /> : null}</>}>
        {(showEbs && hasEbs) || (showPe && hasPe) ? (
          <div className="h-[22rem]"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={epi} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
              {showEbs ? <YAxis yAxisId="ebs" tick={{ fontSize: 12, fill: SOURCE_COLOR.ebs }} allowDecimals={false} width={40} /> : null}
              {showPe && hasPe ? <YAxis yAxisId="pe" orientation={showEbs ? 'right' : 'left'} tick={{ fontSize: 12, fill: SOURCE_COLOR.pe }} allowDecimals={false} width={36} /> : null}
              <Tooltip formatter={(v: any) => fmt(Number(v))} /><Legend wrapperStyle={{ fontSize: 12 }} />
              {showEbs ? <Bar yAxisId="ebs" dataKey="ebs" name={`EBS · ${ebsLabel}`} fill={SOURCE_COLOR.ebs} radius={[3, 3, 0, 0]} isAnimationActive={false} /> : null}
              {showPe && hasPe ? (showEbs
                ? <Line yAxisId="pe" dataKey="pe_cases" name={t('skdr.charts.metricPeCases')} stroke={SOURCE_COLOR.pe} strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
                : <Bar yAxisId="pe" dataKey="pe_cases" name={t('skdr.charts.metricPeCases')} fill={SOURCE_COLOR.pe} radius={[3, 3, 0, 0]} isAnimationActive={false} />) : null}
              {showPe && hasPe && !showEbs ? <Bar yAxisId="pe" dataKey="pe_deaths" name={t('skdr.penyakit.deaths')} fill="#dc2626" isAnimationActive={false} /> : null}
            </ComposedChart></ResponsiveContainer></div>
        ) : <MutedNote>{showEbs ? t('skdr.penyakit.emptyEbs') : noPeText}</MutedNote>}
        {showEbs && showPe && !hasPe ? <MutedNote testId="trend-pe-note">{t('skdr.source.pe')}: {noPeText}</MutedNote> : null}
        {showEbs && showPe && hasPe ? <p className="mt-1 text-[11px] text-slate-500">{t('skdr.charts.combinedNote')}</p> : null}
      </Section>

      {/* SEBARAN WILAYAH */}
      <Section eyebrow={t('skdr.penyakit.eyebrowRegions')} testId="regions"
        right={<span className="text-[11px] text-slate-500">{d.level === 'province' ? t('skdr.penyakit.mapDrill') : t('skdr.penyakit.mapKab')}</span>}>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className={`grid gap-6 ${twoMaps ? 'md:grid-cols-2' : ''}`} data-testid="map-panel">
            {showEbs ? (
              <div><SourceKey source="ebs" label={ebsLabel} />
                <ChoroplethMap level={d.level} provinceCode={provCode} values={Object.fromEntries(d.regions.map((r) => [r.code, r[ebsKey]]))} hue="ebs" onPick={d.level === 'province' ? pick : undefined} /></div>
            ) : null}
            {showPe && hasPe ? (
              <div><SourceKey source="pe" label={t('skdr.charts.metricPeCases')} />
                <ChoroplethMap level={d.level} provinceCode={provCode} values={Object.fromEntries(d.regions.map((r) => [r.code, r.pe_cases]))} hue="pe" onPick={d.level === 'province' ? pick : undefined} /></div>
            ) : null}
            {showPe && !hasPe ? <MutedNote>{t('skdr.source.pe')}: {noPeText}</MutedNote> : null}
          </div>
          <div data-testid="top-regions">
            <h3 className="text-sm font-black text-slate-900">{t('skdr.penyakit.topRegions')}</h3>
            {topRows.length ? (
              <table className="mt-2 w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500"><tr><th /><th className="py-1 text-left font-semibold">{regionWord}</th>
                  {showEbs ? <th className="text-right font-semibold text-ebs">EBS</th> : null}{showPe && hasPe ? <th className="text-right font-semibold text-pe">PE</th> : null}</tr></thead>
                <tbody>
                  {topRows.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="w-6 py-2 text-slate-400">{i + 1}</td>
                      <td className="font-semibold text-slate-700">{r.name}
                        <div className="mt-1 flex flex-col gap-0.5">
                          {showEbs ? <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(r[ebsKey] / topMax.e) * 100}%`, background: SOURCE_COLOR.ebs }} /></div> : null}
                          {showPe && hasPe ? <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(r.pe_cases / topMax.p) * 100}%`, background: SOURCE_COLOR.pe }} /></div> : null}
                        </div>
                      </td>
                      {showEbs ? <td className="pl-2 text-right font-mono font-bold">{fmt(r[ebsKey])}</td> : null}
                      {showPe && hasPe ? <td className="pl-2 text-right font-mono font-bold">{fmt(r.pe_cases)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <MutedNote>{t('skdr.penyakit.emptyRegions')}</MutedNote>}
          </div>
        </div>
      </Section>

      {/* PROFIL KASUS PE + CFR */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {showPe ? (
          <Section eyebrow={t('skdr.penyakit.eyebrowProfile')} testId="age-sex">
            {d.age.length && hasPe ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="h-64 md:col-span-2"><ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.age}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="group" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="male" stackId="s" name={t('skdr.penyakit.male')} fill={sexColors[0]} isAnimationActive={false} />
                    <Bar dataKey="female" stackId="s" name={t('skdr.penyakit.female')} fill={sexColors[1]} isAnimationActive={false} />
                    <Bar dataKey="unknown" stackId="s" name={t('skdr.penyakit.unknown')} fill={sexColors[2]} isAnimationActive={false} />
                  </BarChart></ResponsiveContainer></div>
                <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={d.sex} dataKey="n" nameKey="sex" innerRadius="50%" outerRadius="85%" isAnimationActive={false}>{d.sex.map((s, i) => <Cell key={s.sex} fill={sexColors[i % 3]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
                </ResponsiveContainer></div>
                <p className="text-[11px] text-slate-500 md:col-span-3">{t('skdr.penyakit.ageNote')}</p>
              </div>
            ) : <MutedNote>{noPeText}</MutedNote>}
          </Section>
        ) : <div className="hidden xl:block" />}
        <Section eyebrow="CFR" testId="cfr-disease">
          <div className="flex flex-col gap-5">
            {showPe ? (hasPe ? <Cfr src="pe" title={t('skdr.penyakit.cfrPe')} r={d.cfr.pe.rate} note={d.cfr.pe.label ? t('skdr.penyakit.cfrPeNote', { label: d.cfr.pe.label }) : t('skdr.penyakit.cfrPeNoteAll')} /> : <MutedNote>{t('skdr.penyakit.cfrPe')}: {noPeText}</MutedNote>) : null}
            {showEbs ? <Cfr src="ebs" title={t('skdr.penyakit.cfrEbs')} r={d.cfr.ebs.rate} note={t('skdr.penyakit.cfrEbsNote')} /> : null}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">{t('skdr.penyakit.cfrRule')}</p>
        </Section>
      </div>

      {/* LAPORAN TERBARU */}
      <Section eyebrow={t('skdr.penyakit.eyebrowLatest')} testId="latest">
        <div className={`grid grid-cols-1 gap-8 ${showEbs && showPe && d.latest.pe.length ? 'xl:grid-cols-2' : ''}`}>
          {showEbs ? (
            <div data-testid="latest-ebs"><SourceKey source="ebs" label={t('skdr.penyakit.latestEbs')} />
              {d.latest.ebs.length ? (
                <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500"><tr><th className="py-1.5">{t('skdr.penyakit.colNoEbs')}</th><th>{t('skdr.penyakit.colDate')}</th><th>{t('skdr.penyakit.colRegion')}</th><th>{t('skdr.penyakit.colStatus')}</th><th className="text-right">{t('skdr.penyakit.colCases')}</th><th className="text-right">{t('skdr.penyakit.colDeaths')}</th></tr></thead>
                  <tbody>{d.latest.ebs.map((r, i) => (
                    <tr key={(r.no_ebs || '') + i} className="border-b border-slate-100"><td className="py-1.5 font-mono">{r.no_ebs || '—'}</td><td className="font-mono">{r.date || '—'}</td><td>{r.kabkota || '—'}<span className="text-slate-400"> · {r.province || ''}</span></td><td>{r.status || '—'}</td><td className="text-right">{fmt(r.cases)}</td><td className="text-right text-red-600">{fmt(r.deaths)}</td></tr>
                  ))}</tbody></table></div>
              ) : <MutedNote>{t('skdr.penyakit.emptyEbs')}</MutedNote>}
            </div>
          ) : null}
          {showPe ? (
            <div data-testid="latest-pe"><SourceKey source="pe" label={t('skdr.penyakit.latestPe')} />
              {d.latest.pe.length ? (
                <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-slate-200 text-[11px] uppercase text-slate-500"><tr><th className="py-1.5">{t('skdr.penyakit.colNoPe')}</th><th>{t('skdr.penyakit.colPatient')}</th><th>{t('skdr.penyakit.colDate')}</th><th>{t('skdr.penyakit.colRegion')}</th><th>{t('skdr.penyakit.colStatus')}</th></tr></thead>
                  <tbody>{d.latest.pe.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100"><td className="py-1.5"><Link href={`/pe/${r.form_key}/${r.id}?mode=lihat`} className="font-mono font-semibold text-primary hover:underline">{r.no_pe}</Link></td>
                      <td>{r.patient_initials || '—'}</td><td className="font-mono">{r.date || '—'}</td><td>{r.kabkota || '—'}</td>
                      <td><span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span></td></tr>
                  ))}</tbody></table>
                  <p className="mt-2 text-[11px] text-slate-400">{t('skdr.penyakit.privacy')}</p></div>
              ) : <MutedNote>{noPeText}</MutedNote>}
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  )
}

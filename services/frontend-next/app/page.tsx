'use client'
// PR 016: Beranda — editorial hero (model: globalinfectiousdisease.com) with a "Rilis data terkini" panel.
// Every number comes from the API (analytics/summary for the current epi year, analytics/latest, analytics/diseases,
// master/provinces); nothing is hardcoded. Loading = skeleton, failure = error state with retry.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, LayoutDashboard, List, Search } from 'lucide-react'
import { peFetch } from '@/lib/pe-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { fmt } from '@/lib/analytics-api'
import { SourceKey } from '@/components/analytics/SourceBadge'
import { ErrorState, Skeleton } from '@/components/ui/Skeleton'

type Kpi = { ebs: { alerts: number; provinces: number } | null; pe: { cases: number; provinces: number } | null }
type Trend = { days: string[]; bucket: string; until: string | null; ebs: { alerts: number[]; provinces: number[] } | null; pe: { cases: number[]; provinces: number[] } | null }
type Summary = { kpi: Kpi; kpi_trend: Trend; diseases: { ebs: { alerts: number } | null; pe: { cases: number } | null }[] }
type Latest = { ebs_latest: string | null; pe_latest: string | null; diseases_monitored: number
  provinces: { name: string; source: 'ebs' | 'pe'; last_date: string }[]; diseases: { name: string; code: string; source: 'ebs' | 'pe'; last_date: string }[] }
type Home = {
  week: { ebs?: { until: string; records: number; cases: number; provinces: number }; pe?: { until: string; records: number; cases: number; provinces: number } }
  provinces_reviewed: number
  counts: { provinces_total: number; diseases_total: number; provinces_with_data: number; diseases_with_data: number; ebs_records: number; pe_records: number; indicators: number }
  top_provinces: { id: number; code: string | null; name: string; diseases: number; ebs: { cases: number; deaths: number; alerts: number }; pe: { cases: number; deaths: number }; first: string; last: string }[]
  top_diseases: { code: string; name: string; category: string | null; ebs: number; pe: number }[]
}
type Opt = { id: number; name: string }
type Dis = { code: string; name: string; english_name?: string | null }

const dmy = (s?: string | null) => (s ? s.split('-').reverse().join('/') : '—')

function Spark({ values, src }: { values: number[]; src: 'ebs' | 'pe' | 'brand' }) {
  if (!values.length) return null
  const W = 120, H = 28, max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - 2 - (v / max) * (H - 4)}`)
  const color = src === 'brand' ? 'rgb(var(--brand-700))' : `rgb(var(--src-${src}))`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-7 w-full" aria-hidden>
      <polyline points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={color} fillOpacity={0.12} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ label, value, sub, children, testId }: { label: React.ReactNode; value: string; sub?: React.ReactNode; children?: React.ReactNode; testId: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid={testId}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black leading-none text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
      {children}
    </div>
  )
}

export default function Beranda() {
  const { t } = useTranslation()
  const router = useRouter()
  const [sm, setSm] = useState<Summary | null>(null)
  const [lt, setLt] = useState<Latest | null>(null)
  const [hm, setHm] = useState<Home | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState('')
  const [dis, setDis] = useState<Dis[]>([])
  const [provs, setProvs] = useState<Opt[]>([])
  const cur = getCurrentEpiWeek()
  const range = `start_year=${cur.year}&start_week=1&end_year=${cur.year}&end_week=${cur.week}`

  useEffect(() => {
    let a = true; setErr(''); setSm(null); setLt(null); setHm(null)
    Promise.all([
      peFetch<{ data: Summary }>(`/api/v1/analytics/summary?${range}`),
      peFetch<{ data: Latest }>('/api/v1/analytics/latest'),
      peFetch<{ data: Home }>('/api/v1/analytics/home'),
    ]).then(([s, l, h]) => { if (a) { setSm(s.data); setLt(l.data); setHm(h.data) } }).catch((e) => a && setErr(e.message))
    return () => { a = false }
  }, [range, tick])
  useEffect(() => {
    peFetch<{ data: Dis[] }>('/api/v1/analytics/diseases').then((j) => setDis(j.data)).catch(() => setDis([]))
    peFetch<{ data: Opt[] }>('/api/v1/master/provinces').then((j) => setProvs(j.data)).catch(() => setProvs([]))
  }, [])

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return []
    const d = dis.filter((x) => [x.name, x.code, x.english_name].some((v) => (v || '').toLowerCase().includes(s))).slice(0, 5)
      .map((x) => ({ key: `d-${x.code}`, label: x.name, kind: t('skdr.home.kindDisease'), href: `/penyakit/${x.code.toLowerCase()}` }))
    const p = provs.filter((x) => x.name.toLowerCase().includes(s)).slice(0, 4)
      .map((x) => ({ key: `p-${x.id}`, label: x.name, kind: t('skdr.home.kindRegion'), href: `/main-dashboard?province_id=${x.id}` }))
    return [...d, ...p]
  }, [q, dis, provs, t])
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    if (suggestions[0]) router.push(suggestions[0].href)
    else if (q.trim()) router.push(`/penyakit?q=${encodeURIComponent(q.trim())}`)
  }

  const te = sm?.kpi_trend?.ebs, tp = sm?.kpi_trend?.pe
  const withReports = sm ? sm.diseases.filter((d) => (d.ebs?.alerts || 0) > 0 || (d.pe?.cases || 0) > 0).length : 0
  const bg = te?.alerts || tp?.cases || []
  const bgMax = Math.max(1, ...bg)
  const bgPath = bg.map((v, i) => `${(i / Math.max(1, bg.length - 1)) * 1000},${300 - (v / bgMax) * 220}`).join(' ')

  return (
    <div className="relative w-full overflow-hidden bg-white" data-testid="beranda">
      {/* faint trend line from real data (EBS alerts over the current epi year; Kasus PE when EBS is empty) */}
      {bg.length ? (
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 w-full opacity-[0.07]" aria-hidden data-testid="hero-bg-trend">
          <polyline points={bgPath} fill="none" stroke="rgb(var(--brand-700))" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
      <div className="relative grid w-full grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:px-8 lg:py-14">
        {/* left: hero */}
        <section className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">{t('skdr.home.eyebrow')}</div>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">
            {t('skdr.home.headline1')}<br />{t('skdr.home.headline2')}
          </h1>
          <p className="mt-3 text-xl font-bold text-brand-600 sm:text-2xl">{t('skdr.home.subheadline')}</p>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-600">{t('skdr.home.description')}</p>

          <form onSubmit={go} className="relative mt-7 max-w-2xl" data-testid="home-search">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('skdr.home.searchPh')} aria-label={t('skdr.home.searchPh')}
              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-28 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">{t('skdr.home.searchBtn')}</button>
            {suggestions.length ? (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.key}><Link href={s.href} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-brand-50"><span className="font-semibold text-slate-800">{s.label}</span><span className="text-[11px] text-slate-500">{s.kind}</span></Link></li>
                ))}
              </ul>
            ) : null}
          </form>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/main-dashboard" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-primary-dark"><LayoutDashboard className="h-4 w-4" /> {t('skdr.home.ctaDashboard')}</Link>
            <Link href="/penyakit" className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-5 py-3 text-sm font-bold text-brand-800 hover:bg-brand-50"><List className="h-4 w-4" /> {t('skdr.home.ctaDiseases')}</Link>
            <Link href="/dokumentasi" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><BookOpen className="h-4 w-4" /> {t('skdr.home.ctaDocs')}</Link>
          </div>
        </section>

        {/* right: latest data release */}
        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 backdrop-blur" data-testid="home-release">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">{t('skdr.home.releaseTitle')}</h2>
            {sm ? <span className="text-[11px] text-slate-500" data-testid="home-until">{t('skdr.home.dataUntil', { date: dmy(sm.kpi_trend?.until) })}</span> : null}
          </div>
          {err ? <ErrorState className="mt-4" message={err} onRetry={() => setTick((x) => x + 1)} /> : !sm || !lt ? (
            <div className="mt-4 space-y-3" role="status" aria-label={t('skdr.state.loading')}>
              <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-full" /></div>)}</div>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-slate-500">{t('skdr.home.periodLine', { year: cur.year, week: cur.week })}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Tile testId="tile-ebs" label={<SourceKey source="ebs" label={t('skdr.home.tileEbs')} />} value={sm.kpi.ebs ? fmt(sm.kpi.ebs.alerts) : '—'}><Spark values={te?.alerts || []} src="ebs" /></Tile>
                <Tile testId="tile-pe" label={<SourceKey source="pe" label={t('skdr.home.tilePe')} />} value={sm.kpi.pe ? fmt(sm.kpi.pe.cases) : '—'}><Spark values={tp?.cases || []} src="pe" /></Tile>
                <Tile testId="tile-prov" label={t('skdr.home.tileProv')} value={`${fmt(sm.kpi.ebs?.provinces ?? 0)} · ${fmt(sm.kpi.pe?.provinces ?? 0)}`} sub={t('skdr.home.tileProvSub')}>
                  <Spark values={te?.provinces || []} src="ebs" />
                </Tile>
                <Tile testId="tile-dis" label={t('skdr.home.tileDis')} value={fmt(lt.diseases_monitored)} sub={t('skdr.home.tileDisSub', { n: fmt(withReports) })} />
              </div>

              <h3 className="mt-5 text-xs font-black uppercase tracking-wider text-slate-700">{t('skdr.home.latestTitle')}</h3>
              <ul className="mt-2 divide-y divide-slate-200 text-sm" data-testid="home-latest">
                {lt.provinces.slice(0, 5).map((p) => (
                  <li key={`${p.name}-${p.source}`} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate font-semibold text-slate-800">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500"><SourceKey source={p.source} />{t('skdr.home.lastUpdate', { date: dmy(p.last_date) })}</span>
                  </li>
                ))}
                {lt.diseases.slice(0, 3).map((d) => (
                  <li key={`${d.code}-${d.source}`} className="flex items-center justify-between gap-3 py-1.5">
                    <Link href={`/penyakit/${d.code.toLowerCase()}`} className="min-w-0 truncate font-semibold text-brand-800 hover:underline">{d.name}</Link>
                    <span className="flex shrink-0 items-center gap-3 text-[11px] text-slate-500"><SourceKey source={d.source} />{t('skdr.home.lastUpdate', { date: dmy(d.last_date) })}</span>
                  </li>
                ))}
                {!lt.provinces.length && !lt.diseases.length ? <li className="py-2 text-slate-500">{t('skdr.state.empty')}</li> : null}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{t('skdr.home.footnote')}</p>
              <Link href="/dokumentasi" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline">{t('skdr.home.methods')} <ArrowRight className="h-3.5 w-3.5" /></Link>
            </>
          )}
        </aside>
      </div>
      <HomeSections hm={hm} err={err} onRetry={() => setTick((x) => x + 1)} />
    </div>
  )
}

function HomeSections({ hm, err, onRetry }: { hm: Home | null; err: string; onRetry: () => void }) {
  const { t } = useTranslation()
  if (err) return <div className="relative px-4 pb-10 sm:px-6 lg:px-8"><ErrorState message={err} onRetry={onRetry} /></div>
  if (!hm) return (
    <div className="relative space-y-6 px-4 pb-10 sm:px-6 lg:px-8" role="status" aria-label={t('skdr.state.loading')}>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}</div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  )
  const until = [hm.week.ebs?.until, hm.week.pe?.until].filter(Boolean).sort().pop() || null
  const c = hm.counts
  const tiles = [
    { n: '01', title: t('skdr.home.ex1'), desc: t('skdr.home.ex1Desc'), foot: t('skdr.home.ex1Foot', { a: fmt(c.provinces_with_data), b: fmt(c.provinces_total) }), href: '/main-dashboard' },
    { n: '02', title: t('skdr.home.ex2'), desc: t('skdr.home.ex2Desc'), foot: t('skdr.home.ex2Foot', { a: fmt(c.diseases_total), b: fmt(c.diseases_with_data) }), href: '/penyakit' },
    // no data export exists yet → "Dokumentasi Data" instead of "Unduh Data"
    { n: '03', title: t('skdr.home.ex3'), desc: t('skdr.home.ex3Desc'), foot: t('skdr.home.ex3Foot', { a: fmt(c.ebs_records), b: fmt(c.pe_records) }), href: '/dokumentasi' },
    { n: '04', title: t('skdr.home.ex4'), desc: t('skdr.home.ex4Desc'), foot: t('skdr.home.ex4Foot', { a: fmt(c.indicators) }), href: '/dokumentasi' },
  ]
  const stat = (label: React.ReactNode, v: number | undefined, sub?: string) => (
    <div className="min-w-0"><div className="text-4xl font-black leading-none text-white">{v === undefined ? '—' : fmt(v)}</div><div className="mt-2 text-xs font-semibold text-brand-100">{label}</div>{sub ? <div className="text-[11px] text-brand-200/80">{sub}</div> : null}</div>
  )
  return (
    <div className="relative space-y-12 pb-14">
      {/* a. situation band */}
      <section className="w-full bg-brand-900 px-4 py-10 text-white sm:px-6 lg:px-8" data-testid="home-situation">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-end">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-200">{t('skdr.home.sitEyebrow', { date: dmy(until) })}</div>
            <h2 className="mt-2 text-3xl font-black">{t('skdr.home.sitTitle')}</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-100">{t('skdr.home.sitNote')}</p>
            <Link href="/main-dashboard" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-white hover:underline">{t('skdr.home.openDash')} <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {stat(t('skdr.home.sitEbs'), hm.week.ebs?.records, hm.week.ebs ? t('skdr.home.sevenDays', { date: dmy(hm.week.ebs.until) }) : t('skdr.home.noData'))}
            {stat(t('skdr.home.sitPe'), hm.week.pe?.records, hm.week.pe ? t('skdr.home.sevenDays', { date: dmy(hm.week.pe.until) }) : t('skdr.home.noData'))}
            {stat(t('skdr.home.sitProv'), hm.provinces_reviewed, t('skdr.home.sitProvSub'))}
          </div>
        </div>
      </section>

      {/* b. start exploring */}
      <section className="px-4 sm:px-6 lg:px-8" data-testid="home-explore">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">{t('skdr.home.exploreTitle')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((x) => (
            <Link key={x.n} href={x.href} className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-md">
              <span className="text-sm font-black text-brand-600">{x.n}</span>
              <span className="mt-2 text-lg font-black text-slate-900 group-hover:text-brand-800">{x.title}</span>
              <span className="mt-1 flex-1 text-sm leading-relaxed text-slate-600">{x.desc}</span>
              <span className="mt-4 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">{x.foot}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* c. provinces + diseases */}
      <section className="grid grid-cols-1 gap-8 px-4 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div data-testid="home-provinces">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">{t('skdr.home.provTitle')}</h2>
            <Link href="/main-dashboard" className="text-xs font-bold text-brand-700 hover:underline">{t('skdr.home.seeAllProv', { n: fmt(c.provinces_total) })} →</Link>
          </div>
          {hm.top_provinces.length ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {hm.top_provinces.map((p) => (
                <Link key={p.id} href={`/main-dashboard?province_id=${p.id}`} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-md">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate font-black text-slate-900">{p.name}</span><span className="text-[11px] font-bold text-slate-400">{p.code || '—'}</span></div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[10.5px] uppercase tracking-wide text-slate-500">{t('skdr.home.cases')}</dt><dd className="text-xs font-bold"><span className="text-ebs">{fmt(p.ebs.cases)}</span> · <span className="text-pe">{fmt(p.pe.cases)}</span></dd></div>
                    <div><dt className="text-[10.5px] uppercase tracking-wide text-slate-500">{t('skdr.home.deaths')}</dt><dd className="text-xs font-bold"><span className="text-ebs">{fmt(p.ebs.deaths)}</span> · <span className="text-pe">{fmt(p.pe.deaths)}</span></dd></div>
                    <div><dt className="text-[10.5px] uppercase tracking-wide text-slate-500">{t('skdr.home.diseases')}</dt><dd className="text-xs font-bold text-slate-800">{fmt(p.diseases)}</dd></div>
                  </dl>
                  <div className="mt-3 text-[11px] text-slate-500">{t('skdr.home.range', { a: dmy(p.first), b: dmy(p.last) })}</div>
                </Link>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">{t('skdr.home.noData')}</p>}
          <p className="mt-2 text-[11px] text-slate-500">{t('skdr.home.provLegend')}</p>
        </div>
        <div data-testid="home-diseases">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">{t('skdr.home.disTitle')}</h2>
            <Link href="/penyakit" className="text-xs font-bold text-brand-700 hover:underline">{t('skdr.home.seeAll')} →</Link>
          </div>
          {hm.top_diseases.length ? (
            <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {hm.top_diseases.map((d) => (
                <li key={d.code}><Link href={`/penyakit/${d.code.toLowerCase()}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50">
                  <span className="min-w-0"><span className="block truncate font-bold text-slate-900">{d.name}</span><span className="block text-[11px] text-slate-500">{d.category || t('skdr.home.noCategory')}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" />
                </Link></li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-500">{t('skdr.home.noData')}</p>}
        </div>
      </section>
    </div>
  )
}

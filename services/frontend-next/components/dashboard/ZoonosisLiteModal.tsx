'use client'
// PR 028: Zoonosis Lite modal. The Lite page stays one screen; deeper analysis opens here in tabs instead of extra sections:
// Laboratorium · 7-1-7 · Alert & verifikasi · Klaster & epi curve · Kematian Form PE. Every tab reuses the Main Dashboard
// components with the Lite filters (read-only chips; "Ubah filter" closes the modal). Tabs load lazily on first open and
// stay mounted (cached) while the filters do not change. Sections hidden by the admin (dashboard_sections.hidden) are hidden here too.
// Stacking: this overlay is z-[980], below DeathListModal (990) and SignalModal (1000) that the reused components open.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, FlaskConical, Layers, MapPin, Siren, Skull, SlidersHorizontal, Timer, X } from 'lucide-react'
import { fetchFrom } from '@/lib/api'
import { peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { nf, pf, toQs } from '@/lib/alert-skdr'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useDashboardSections } from '@/lib/dashboard-sections'
import { ErrorState, SkeletonChart, SkeletonTable } from '@/components/ui/Skeleton'
import LabSection, { type LabData } from '@/components/dashboard/LabSection'
import T717, { type T717Data } from '@/components/dashboard/T717'
import EpiCurve from '@/components/dashboard/EpiCurve'
import KlasterSection from '@/components/dashboard/KlasterSection'
import { AlertSection, AlertT717 } from '@/components/dashboard/AlertSkdrSections'
import { EbsAlertPanel, EbsResponsCard } from '@/components/dashboard/EbsPanels'
import { LihatButton, useSignalModal } from '@/components/dashboard/SignalModal'

export type LiteTab = 'lab' | 't717' | 'alert' | 'klaster' | 'kematian'
/** Modal tab → Main Dashboard section id (app_settings.dashboard_sections); a hidden section hides its tab. */
export const TAB_SECTION: Record<LiteTab, string> = { lab: 'laboratorium', t717: 't717', alert: 'alert', klaster: 'klaster', kematian: 'cfr' }
export const TAB_ORDER: LiteTab[] = ['lab', 't717', 'alert', 'klaster', 'kematian']
const TAB_ICON: Record<LiteTab, typeof FlaskConical> = { lab: FlaskConical, t717: Timer, alert: Siren, klaster: Layers, kematian: Skull }

export type LiteDisease = { code: string; name: string; color: string }
export type LiteChips = { diseases: string; area: string; period: string }

/** Small promise cache per URL (filters + tab), so switching tabs or reopening the modal does not refetch. */
const cache = new Map<string, Promise<unknown>>()
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = fn()
    p.catch(() => cache.delete(key))
    if (cache.size > 40) cache.clear()
    cache.set(key, p)
  }
  return p
}
function useCached<T>(key: string | null, fn: () => Promise<T>) {
  const [d, setD] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!key) return
    let alive = true
    setD(null); setErr('')
    cached(key, fn).then((x) => alive && setD(x)).catch((e) => alive && setErr(String(e?.message || e || 'error')))
    return () => { alive = false }
  }, [key, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err, retry: () => { if (key) cache.delete(key); setTick((x) => x + 1) } }
}

const ratio = (a: number, b: number) => (b > 0 ? (a * 100) / b : null)
/** White → colour ramp for heat cells; t in 0..1. */
const heat = (rgb: [number, number, number], t: number) => {
  const k = Math.max(0, Math.min(1, t))
  const c = rgb.map((v) => Math.round(255 + (v - 255) * (0.12 + 0.78 * k)))
  return { background: k > 0 ? `rgb(${c.join(',')})` : undefined, color: k > 0.62 ? '#fff' : undefined }
}
const RED: [number, number, number] = [220, 38, 38], TEAL: [number, number, number] = [13, 148, 136], GREEN: [number, number, number] = [5, 150, 105]
const BLUE: [number, number, number] = [37, 99, 235], SLATE: [number, number, number] = [71, 85, 105], AMBER: [number, number, number] = [217, 119, 6]
const th = 'px-2 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500'

function Block({ title, desc, children, testId, right }: { title: string; desc?: string; children: React.ReactNode; testId?: string; right?: React.ReactNode }) {
  return (
    <section className="skdr-card p-3" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-sm font-black text-slate-900">{title}</h3>{desc ? <p className="text-[11px] leading-snug text-slate-500">{desc}</p> : null}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

type Rgb = [number, number, number]
/** Colour key: one low → high ramp per column family, same colours as the heat cells. */
function HeatLegend({ items, notes, testId }: { items: { rgb: Rgb; label: string; meaning: string }[]; notes: string[]; testId?: string }) {
  const { t } = useTranslation()
  const lo = (rgb: Rgb) => heat(rgb, 0.0001).background, hi = (rgb: Rgb) => heat(rgb, 1).background
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2" data-testid={testId}>
      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{t('skdr.lite.modal.legendTitle')}</div>
      <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        {items.map((x) => (
          <li key={x.label} className="flex items-center gap-1.5 text-[10.5px] leading-tight text-slate-600">
            <span className="text-[9.5px] text-slate-400">{t('skdr.lite.modal.legendLow')}</span>
            <span className="h-2.5 w-14 shrink-0 rounded-sm border border-slate-200" style={{ background: `linear-gradient(to right, ${lo(x.rgb)}, ${hi(x.rgb)})` }} aria-hidden />
            <span className="text-[9.5px] text-slate-400">{t('skdr.lite.modal.legendHigh')}</span>
            <span className="min-w-0"><b className="text-slate-800">{x.label}</b>: {x.meaning}</span>
          </li>
        ))}
      </ul>
      {notes.map((n) => <p key={n} className="mt-1 text-[10.5px] leading-snug text-slate-500">{n}</p>)}
    </div>
  )
}

type Pd = NonNullable<LabData['by_province_disease']>
type PdRow = { province: string; disease: string; alerts: number; with_specimen: number; positive: number }
/** Same pivot as the backend (lab_klaster::province_disease): order by total specimens, then alerts, then name. */
function pivot(rows: PdRow[], top: number): Pd {
  const order = (key: (r: PdRow) => string) => {
    const m = new Map<string, [number, number]>()
    rows.forEach((r) => { const e = m.get(key(r)) || [0, 0]; e[0] += r.with_specimen; e[1] += r.alerts; m.set(key(r), e) })
    return [...m.entries()].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || a[0].localeCompare(b[0])).map((x) => x[0])
  }
  const provinces = order((r) => r.province).slice(0, top)
  const diseases = order((r) => r.disease)
  const cells = provinces.map((p) => diseases.map((d) => {
    const r = rows.find((x) => x.province === p && x.disease === d)
    return r ? { alerts: r.alerts, with_specimen: r.with_specimen, positive: r.positive } : null
  }))
  return { provinces, diseases, cells }
}

/** Tab 1: Laboratorium = quick reading + disease × result matrix + province × disease matrix + the Main Dashboard lab section. */
function LabTab({ query, diseases }: { query: Record<string, unknown>; diseases: LiteDisease[] }) {
  const { t } = useTranslation()
  const qs = toQs(query)
  const { d, err, retry } = useCached<LabData>(`lab|${qs}`, () => fetchFrom<LabData>(`/api/v1/laboratorium?${qs}`))
  // 1c fallback for backends without by_province_disease: one /laboratorium call per selected disease (its by_province).
  const needFb = !!d && !d.by_province_disease
  const fb = useCached<{ pd: Pd; n: number }>(needFb ? `labpd|${qs}` : null, async () => {
    const parts = await Promise.all(diseases.map((x) => fetchFrom<LabData>(`/api/v1/laboratorium?${toQs({ ...query, disease: x.code })}`)
      .then((r) => r.by_province.map((p) => ({ province: p.province, disease: x.name, alerts: p.alerts, with_specimen: p.with_specimen, positive: p.positive })))))
    return { pd: pivot(parts.flat(), 15), n: diseases.length }
  })
  const pd = d?.by_province_disease ?? fb.d?.pd ?? null
  const [metric, setMetric] = useState<'positive' | 'with_specimen' | 'rate'>('positive')
  const colorOf = (name: string) => diseases.find((x) => x.name === name)?.color ?? '#475569'

  if (err) return <ErrorState message={err} onRetry={retry} />
  if (!d) return <div className="space-y-3"><SkeletonTable rows={5} cols={8} /><SkeletonChart height={240} /></div>
  const k = d.kpis
  const rows = d.by_disease.map((r) => {
    const res = r.positive + r.negative + r.other
    return { ...r, res, exam: ratio(r.with_specimen, r.alerts), posRate: ratio(r.positive, res) }
  })
  const tot = rows.reduce((a, r) => ({ alerts: a.alerts + r.alerts, with_specimen: a.with_specimen + r.with_specimen, positive: a.positive + r.positive, negative: a.negative + r.negative, other: a.other + r.other }), { alerts: 0, with_specimen: 0, positive: 0, negative: 0, other: 0 })
  const max = (f: (r: (typeof rows)[number]) => number) => Math.max(1, ...rows.map(f))
  const mx = { alerts: max((r) => r.alerts), spec: max((r) => r.with_specimen), pos: max((r) => r.positive), neg: max((r) => r.negative), oth: max((r) => r.other) }
  // quick reading (only figures from this response; no causal claims)
  const tested = rows.filter((r) => r.res >= 10).sort((a, b) => (b.posRate ?? 0) - (a.posRate ?? 0))
  const topProv = [...d.by_province].sort((a, b) => b.positive - a.positive)[0]
  const notes: string[] = [
    t('skdr.lite.modal.labNoteExam', { pct: pf(ratio(k.with_specimen, k.alerts)), spec: nf(k.with_specimen), alerts: nf(k.alerts) }),
    tested[0] ? t('skdr.lite.modal.labNoteTopRate', { name: tested[0].disease, pct: pf(tested[0].posRate), pos: nf(tested[0].positive), res: nf(tested[0].res) }) : '',
    topProv && topProv.positive > 0 ? t('skdr.lite.modal.labNoteTopProv', { name: topProv.province, pos: nf(topProv.positive), spec: nf(topProv.with_specimen) }) : '',
    k.with_result > k.with_specimen ? t('skdr.lite.modal.labNoteResultNoSpec', { res: nf(k.with_result), spec: nf(k.with_specimen) }) : '',
  ].filter(Boolean)

  // province × disease: colour per disease column (counts) so the largest disease does not wash out the others; % = absolute 0–100
  const colMax = pd ? pd.diseases.map((_, j) => Math.max(1, ...pd.cells.map((row) => {
    const c = row[j]; return c ? (metric === 'positive' ? c.positive : c.with_specimen) : 0
  }))) : []
  const cellVal = (c: Pd['cells'][number][number]) => !c ? null : metric === 'positive' ? c.positive : metric === 'with_specimen' ? c.with_specimen : ratio(c.positive, c.with_specimen)

  const tip = (row: string, col: string, val: string, meaning: string, relative: boolean) =>
    `${row} · ${col}: ${val}\n${t(`skdr.lite.modal.${meaning}`)}\n(${t(relative ? 'skdr.lite.modal.tipRelative' : 'skdr.lite.modal.tipAbsolute')})`
  const pdRgb = metric === 'with_specimen' ? TEAL : metric === 'rate' ? AMBER : RED
  const pdMeaning = metric === 'with_specimen' ? 'lg_spec' : metric === 'rate' ? 'lg_pd_rate' : 'lg_pos'
  return (
    <div className="space-y-3">
      <Block title={t('skdr.lite.modal.labReading')} testId="lm-lab-notes">
        <ul className="grid gap-1 text-xs text-slate-700 md:grid-cols-2">{notes.map((x) => <li key={x} className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{x}</li>)}</ul>
      </Block>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Block title={t('skdr.lite.modal.matrixDisease')} desc={t('skdr.lite.modal.matrixDiseaseDesc')} testId="lm-lab-matrix-disease">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs tabular-nums">
              <thead className="border-b border-slate-200"><tr>
                <th className={`${th} text-left`}>{t('skdr.lite.disease')}</th><th className={`${th} text-right`}>Alert</th><th className={`${th} text-right`}>{t('skdr.lite.modal.specimen')}</th>
                <th className={`${th} text-right`}>{t('skdr.lite.modal.examined')}</th><th className={`${th} text-right`}>{t('skdr.lite.modal.positive')}</th><th className={`${th} text-right`}>{t('skdr.lite.modal.negative')}</th>
                <th className={`${th} text-right`}>{t('skdr.lite.modal.process')}</th><th className={`${th} text-right`}>{t('skdr.lite.modal.posRate')}</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.disease} className="border-b border-slate-100">
                    <td className="px-2 py-1.5 font-bold text-slate-900"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(r.disease) }} />{r.disease}</td>
                    <td className="px-2 text-right" style={heat(SLATE, r.alerts / mx.alerts)} title={tip(r.disease, 'Alert', nf(r.alerts), 'lg_alerts', true)}>{nf(r.alerts)}</td>
                    <td className="px-2 text-right" style={heat(TEAL, r.with_specimen / mx.spec)} title={tip(r.disease, t('skdr.lite.modal.specimen'), nf(r.with_specimen), 'lg_spec', true)}>{nf(r.with_specimen)}</td>
                    <td className="px-2 text-right" style={heat(TEAL, (r.exam ?? 0) / 100)} title={tip(r.disease, t('skdr.lite.modal.examined'), pf(r.exam), 'lg_exam', false)}>{pf(r.exam)}</td>
                    <td className="px-2 text-right font-bold" style={heat(RED, r.positive / mx.pos)} title={tip(r.disease, t('skdr.lite.modal.positive'), nf(r.positive), 'lg_pos', true)}>{nf(r.positive)}</td>
                    <td className="px-2 text-right" style={heat(GREEN, r.negative / mx.neg)} title={tip(r.disease, t('skdr.lite.modal.negative'), nf(r.negative), 'lg_neg', true)}>{nf(r.negative)}</td>
                    <td className="px-2 text-right" style={heat(BLUE, r.other / mx.oth)} title={tip(r.disease, t('skdr.lite.modal.process'), nf(r.other), 'lg_oth', true)}>{nf(r.other)}</td>
                    <td className="px-2 text-right font-bold" style={heat(RED, (r.posRate ?? 0) / 100)} title={tip(r.disease, t('skdr.lite.modal.posRate'), pf(r.posRate), 'lg_rate', false)}>{pf(r.posRate)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 font-black">
                  <td className="px-2 py-1.5">{t('skdr.lite.modal.total')}</td><td className="px-2 text-right">{nf(tot.alerts)}</td><td className="px-2 text-right">{nf(tot.with_specimen)}</td>
                  <td className="px-2 text-right">{pf(ratio(tot.with_specimen, tot.alerts))}</td><td className="px-2 text-right">{nf(tot.positive)}</td><td className="px-2 text-right">{nf(tot.negative)}</td>
                  <td className="px-2 text-right">{nf(tot.other)}</td><td className="px-2 text-right">{pf(ratio(tot.positive, tot.positive + tot.negative + tot.other))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <HeatLegend testId="lm-legend-disease" items={[
            { rgb: SLATE, label: 'Alert', meaning: t('skdr.lite.modal.lg_alerts') },
            { rgb: TEAL, label: `${t('skdr.lite.modal.specimen')} / ${t('skdr.lite.modal.examined')}`, meaning: `${t('skdr.lite.modal.lg_spec')}; ${t('skdr.lite.modal.lg_exam')}` },
            { rgb: RED, label: `${t('skdr.lite.modal.positive')} / ${t('skdr.lite.modal.posRate')}`, meaning: `${t('skdr.lite.modal.lg_pos')}; ${t('skdr.lite.modal.lg_rate')}` },
            { rgb: GREEN, label: t('skdr.lite.modal.negative'), meaning: t('skdr.lite.modal.lg_neg') },
            { rgb: BLUE, label: t('skdr.lite.modal.process'), meaning: t('skdr.lite.modal.lg_oth') },
          ]} notes={[t('skdr.lite.modal.legendRelative'), t('skdr.lite.modal.legendAbsolute')]} />
          <p className="mt-2 text-[10.5px] leading-snug text-slate-500">{t('skdr.lite.modal.matrixDiseaseNote')}</p>
        </Block>
        <Block title={t('skdr.lite.modal.matrixProvince')} desc={t('skdr.lite.modal.matrixProvinceDesc')} testId="lm-lab-matrix-province"
          right={<div className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-bold" role="group">
            {(['positive', 'with_specimen', 'rate'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} data-testid={`lm-pd-${m}`}
                className={`px-2 py-1 ${metric === m ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t(`skdr.lite.modal.metric_${m}`)}</button>
            ))}
          </div>}>
          {pd ? (pd.provinces.length ? (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e2e8f0]"><tr>
                  <th className={`${th} text-left`}>{t('skdr.lite.province')}</th>
                  {pd.diseases.map((x) => <th key={x} className={`${th} text-right`}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(x) }} />{x}</th>)}
                </tr></thead>
                <tbody>
                  {pd.provinces.map((p, i) => (
                    <tr key={p} className="border-b border-slate-100">
                      <td className="max-w-[11rem] truncate px-2 py-1 font-semibold text-slate-800" title={p}>{p}</td>
                      {pd.diseases.map((x, j) => {
                        const c = pd.cells[i][j], v = cellVal(c)
                        const k01 = v == null ? 0 : metric === 'rate' ? v / 100 : v / colMax[j]
                        return <td key={x} className="px-2 py-1 text-right" style={heat(pdRgb, k01)}
                          title={c ? `${tip(p + ' · ' + x, t(`skdr.lite.modal.metric_${metric}`), v == null ? '—' : metric === 'rate' ? pf(v) : nf(v), pdMeaning, metric !== 'rate')}\n${nf(c.alerts)} alert · ${nf(c.with_specimen)} ${t('skdr.lite.modal.specimen').toLowerCase()} · ${nf(c.positive)} ${t('skdr.lite.modal.positive').toLowerCase()}` : `${p} · ${x}: ${t('skdr.lite.modal.legendDot')}`}>
                          {v == null ? <span className="text-slate-300">·</span> : metric === 'rate' ? pf(v) : nf(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-center text-xs text-slate-500">{t('skdr.lite.modal.empty')}</p>)
            : fb.err ? <ErrorState message={fb.err} onRetry={fb.retry} /> : <SkeletonTable rows={6} cols={5} />}
          {pd && pd.provinces.length ? <HeatLegend testId="lm-legend-province"
            items={[{ rgb: pdRgb, label: t(`skdr.lite.modal.metric_${metric}`), meaning: t(`skdr.lite.modal.${pdMeaning}`) }]}
            notes={[t(metric === 'rate' ? 'skdr.lite.modal.legendAbsolutePd' : 'skdr.lite.modal.legendRelativePd'), t('skdr.lite.modal.legendDot')]} /> : null}
          <p className="mt-2 text-[10.5px] leading-snug text-slate-500">{t(metric === 'rate' ? 'skdr.lite.modal.matrixProvinceNoteRate' : 'skdr.lite.modal.matrixProvinceNote')}
            {needFb ? ` ${t('skdr.lite.modal.matrixFallback', { n: diseases.length })}` : ''}</p>
        </Block>
      </div>
      <LabSection query={query} showHeader={false} data={d} />
    </div>
  )
}

/** Tab 2: 7-1-7 (EBS timeliness from /analytics/summary, Alert SKDR 7-1-7, EBS response card). */
function T717Tab({ query }: { query: Record<string, unknown> }) {
  const { t } = useTranslation()
  const qs = toQs(query)
  const { d, err, retry } = useCached<{ t717?: T717Data | null }>(`sum|${qs}`, () => peFetch<{ data: { t717?: T717Data | null } }>(`/api/v1/analytics/summary?${qs}`).then((j) => j.data))
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">{t('skdr.lite.modal.t717Desc')}</p>
      {err ? <ErrorState message={err} onRetry={retry} /> : d ? <T717 data={d.t717 ?? null} sumber="all" /> : <SkeletonChart height={200} />}
      <AlertT717 query={query} />
      <EbsResponsCard query={query} />
    </div>
  )
}

type ExecRow = { label: string; star: boolean; known: number; deaths: number; form?: string; codes?: string[] }
type ExecR = { cards: { code: string; label: string; color: string; pe_form?: string | null; disease_code?: string | null }[]; cfr: { groups: { code: string; label: string; color: string; rows: ExecRow[] }[] } }
type Death = { id: number; no_pe: string; unit: string | null; kabkota: string | null; province: string | null; date: string | null; epi_week: string | null; status: string; classification: string | null; death_date: string | null }

/** Tab 5: deaths recorded in Form PE (pe_cases.outcome = dead) per Lite disease, all classifications of the CFR table. */
function KematianTab({ query, diseases }: { query: Record<string, unknown>; diseases: LiteDisease[] }) {
  const { t } = useTranslation()
  const qs = toQs(query)
  const codes = diseases.map((x) => x.code).join(',')
  const ex = useCached<ExecR>(`exec|${qs}`, () => peFetch<{ data: ExecR }>(`/api/v1/dashboard/executive?${qs}`).then((j) => j.data))
  const groups = useMemo(() => {
    if (!ex.d) return []
    return ex.d.cards.filter((c) => c.disease_code && codes.split(',').includes(c.disease_code)).map((c) => {
      const g = ex.d!.cfr.groups.find((x) => x.code === c.code)
      const rows = g?.rows ?? []
      const form = rows.find((r) => r.form)?.form || c.pe_form || ''
      return { code: c.code, label: c.label, color: c.color, form, rows, classes: [...new Set(rows.flatMap((r) => r.codes ?? []))] }
    })
  }, [ex.d, codes])
  const key = groups.length ? `deaths|${qs}|${groups.map((g) => `${g.form}:${g.classes.join('+')}`).join(';')}` : null
  const dl = useCached<(Death & { group: string; color: string })[]>(key, async () => {
    const parts = await Promise.all(groups.filter((g) => g.form && g.classes.length).map((g) => {
      const p = new URLSearchParams(qs); p.set('form', g.form); p.set('classes', g.classes.join(','))
      return peFetch<{ data: Death[] }>(`/api/v1/signals/pe-deaths?${p.toString()}`).then((j) => j.data.map((r) => ({ ...r, group: g.label, color: g.color })))
    }))
    return parts.flat().sort((a, b) => String(b.death_date || b.date || '').localeCompare(String(a.death_date || a.date || '')))
  })
  const { open, modal } = useSignalModal()
  const dmy = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
  if (ex.err) return <ErrorState message={ex.err} onRetry={ex.retry} />
  if (!ex.d) return <SkeletonTable rows={6} cols={6} />
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">{t('skdr.lite.modal.deathsDesc')}</p>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="lm-deaths-cards">
        {groups.map((g) => {
          const all = g.rows.reduce((a, r) => a + r.deaths, 0)
          return (
            <div key={g.code} className="skdr-card relative overflow-hidden p-3">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: g.color }} />
              <div className="text-sm font-black text-slate-900">{g.label}</div>
              <div className="text-2xl font-black text-red-600">{nf(all)}</div>
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {g.rows.map((r) => <div key={r.label} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><b className="tabular-nums">{nf(r.deaths)}</b></div>)}
              </div>
            </div>
          )
        })}
      </div>
      <Block title={t('skdr.lite.modal.deathsList')} testId="lm-deaths-list">
        {dl.err ? <ErrorState message={dl.err} onRetry={dl.retry} /> : !dl.d ? (key ? <SkeletonTable rows={5} cols={7} /> : <p className="text-xs text-slate-500">{t('skdr.cfrList.empty')}</p>) : dl.d.length ? (
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_#e2e8f0]"><tr>
                <th className={th}>{t('skdr.cfrList.no')}</th><th className={th}>{t('skdr.lite.disease')}</th><th className={th}>{t('skdr.lite.modal.classification')}</th><th className={th}>{t('skdr.cfrList.unit')}</th>
                <th className={th}>{t('skdr.cfrList.kab')}</th><th className={th}>{t('skdr.cfrList.week')}</th><th className={th}>{t('skdr.lite.modal.deathDate')}</th><th className={th}>{t('skdr.cfrList.status')}</th><th />
              </tr></thead>
              <tbody>
                {dl.d.map((r) => (
                  <tr key={`${r.group}-${r.id}`} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 font-mono font-semibold text-slate-800">{r.no_pe}</td>
                    <td className="px-2 font-bold"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.group}</td>
                    <td className="px-2 text-slate-700">{r.classification || '—'}</td>
                    <td className="px-2 text-slate-700">{r.unit || '—'}</td>
                    <td className="px-2 text-slate-700">{r.kabkota || '—'}<span className="text-slate-400">{r.province ? ` · ${r.province}` : ''}</span></td>
                    <td className="px-2 tabular-nums text-slate-600">{r.epi_week || '—'}</td>
                    <td className="px-2 tabular-nums text-slate-600">{dmy(r.death_date || r.date)}</td>
                    <td className="px-2"><span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span></td>
                    <td className="pl-2 text-right"><LihatButton onClick={() => open('pe', r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs text-slate-500">{t('skdr.cfrList.empty')}</p>}
        <p className="mt-2 text-[10.5px] text-slate-500">{t('skdr.lite.modal.deathsNote')}</p>
      </Block>
      {modal}
    </div>
  )
}

export default function ZoonosisLiteModal({ open, tab, onTab, onClose, query, diseases, chips }: {
  open: boolean; tab: LiteTab; onTab: (t: LiteTab) => void; onClose: () => void
  query: Record<string, unknown>; diseases: LiteDisease[]; chips: LiteChips
}) {
  const { t } = useTranslation()
  const sections = useDashboardSections()
  const hidden = useMemo(() => new Set(sections.hidden), [sections.hidden])
  const tabs = TAB_ORDER.filter((x) => !hidden.has(TAB_SECTION[x]))
  const qkey = toQs(query)
  const active = tabs.includes(tab) ? tab : tabs[0]
  // lazy: a tab mounts on first view and stays mounted (cached) until the filters change
  const [seen, setSeen] = useState<{ q: string; tabs: LiteTab[] }>({ q: qkey, tabs: [] })
  useEffect(() => {
    if (!open || !active) return
    setSeen((s) => (s.q !== qkey ? { q: qkey, tabs: [active] } : s.tabs.includes(active) ? s : { q: s.q, tabs: [...s.tabs, active] }))
  }, [open, active, qkey])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    box.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      // a stacked child dialog (signal detail / death list) handles its own keys
      if (document.querySelector('[data-testid=signal-modal],[data-testid=deaths-modal]')) return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      const f = Array.from(box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select,input')).filter((x) => x.offsetParent !== null)
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; opener?.focus?.() }
  }, [open, onClose])
  if (!open && !seen.tabs.length) return null
  const panel = (x: LiteTab) => {
    if (x === 'lab') return <LabTab query={query} diseases={diseases} />
    if (x === 't717') return <T717Tab query={query} />
    if (x === 'alert') return <div className="space-y-3"><AlertSection query={query} /><EbsAlertPanel query={query} /></div>
    if (x === 'klaster') return <div className="space-y-3"><EpiCurve query={query} /><KlasterSection query={query} showHeader={false} /></div>
    return <KematianTab query={query} diseases={diseases} />
  }
  const mounted = seen.q === qkey ? seen.tabs : []
  return (
    <div className={`fixed inset-0 z-[980] items-center justify-center bg-slate-900/50 p-2 sm:p-4 ${open ? 'flex' : 'hidden'}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} data-testid="lite-modal-overlay">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="lite-modal-title" tabIndex={-1} data-testid="lite-modal"
        className="flex h-[92vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-line bg-page shadow-xl outline-none sm:h-[90vh]">
        <div className="shrink-0 border-b border-slate-200 bg-card px-4 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="skdr-eyebrow">{t('skdr.lite.title')}</div>
              <h2 id="lite-modal-title" className="text-base font-black text-slate-900">{t('skdr.lite.modal.title')}</h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5" data-testid="lite-modal-chips">
              <span className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700" title={chips.diseases}><Activity className="h-3 w-3 shrink-0 text-primary" />{chips.diseases}</span>
              <span className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700" title={chips.area}><MapPin className="h-3 w-3 shrink-0 text-primary" />{chips.area}</span>
              <span className="inline-flex max-w-[22rem] items-center gap-1 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700" title={chips.period}><CalendarDays className="h-3 w-3 shrink-0 text-primary" />{chips.period}</span>
              <button type="button" onClick={onClose} data-testid="lite-modal-edit"
                className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-brand-100"><SlidersHorizontal className="h-3 w-3" />{t('skdr.lite.modal.editFilter')}</button>
              <button type="button" onClick={onClose} aria-label={t('common.close')} data-testid="lite-modal-close"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-line text-slate-600 hover:bg-page"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto" role="tablist" aria-label={t('skdr.lite.modal.title')}>
            {tabs.map((x) => {
              const Icon = TAB_ICON[x]
              return (
                <button key={x} type="button" role="tab" aria-selected={active === x} onClick={() => onTab(x)} data-testid={`lite-tab-${x}`}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${active === x ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  <Icon className="h-3.5 w-3.5" />{t(`skdr.lite.modal.tab_${x}`)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" data-testid="lite-modal-body">
          {tabs.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{t('skdr.lite.modal.allHidden')}</p> : null}
          {tabs.map((x) => (mounted.includes(x) ? (
            <div key={x} role="tabpanel" hidden={active !== x} data-testid={`lite-panel-${x}`}>{panel(x)}</div>
          ) : null))}
        </div>
      </div>
    </div>
  )
}

'use client'
// PR 016: disease section of the main dashboard. Rows come from the DB registry (master_diseases + pe_form_definitions
// via /api/v1/analytics/summary), so a new disease or PE form appears without code changes. Compact sortable table with
// weekly sparklines; EBS and Kasus PE are separate columns (colour + symbol), never summed. Rows link to /penyakit/[kode].
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt } from '@/lib/analytics-api'
import { SOURCE_COLOR } from '@/lib/theme'
import { SourceKey } from '@/components/analytics/SourceBadge'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'

export type Delta = { last4: number; prev4: number } | null
export type D24 = { cur: number; prev: number } | null
export type SummaryDisease = {
  id: number; code: string; name: string; category: string | null; is_zoonotic: boolean; pe_form: string | null
  ebs: { alerts: number; cases: number; deaths: number; provinces: number; spark_alerts: number[]; spark_cases: number[]; delta_alerts: Delta; delta_cases: Delta; last_date?: string | null; d24?: D24 } | null
  pe: { cases: number; deaths: number; provinces: number; spark: number[]; delta: Delta; last_date?: string | null; d24?: D24; known_outcome?: number
    /** sheet No. 17: Kasus PE per case status; classes + labels from the registry (dashboard_executive.groups[].pe_status) */
    status?: { classes: { code: string; label: string; n: number }[]; unclassified: number } | null } | null
}

export function Spark({ values, color, fluid = false }: { values: number[]; color: string; fluid?: boolean }) {
  const max = Math.max(1, ...values)
  const w = 96, h = 24
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={fluid ? '100%' : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={fluid ? 'none' : undefined} aria-hidden className={fluid ? 'block' : 'shrink-0'}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
export function Trend({ d }: { d: Delta }) {
  const { t } = useTranslation()
  if (!d || (d.last4 === 0 && d.prev4 === 0)) return <span className="text-[11px] text-slate-400">—</span>
  const up = d.last4 > d.prev4, same = d.last4 === d.prev4
  return (
    <span title={t('skdr.dtable.deltaHint', { a: fmt(d.last4), b: fmt(d.prev4) })}
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${same ? 'text-slate-500' : up ? 'text-red-600' : 'text-emerald-700'}`}>
      {same ? '=' : up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{fmt(d.last4)}
    </span>
  )
}

type SortKey = 'name' | 'ebs' | 'pe' | 'deaths'
export default function DiseaseTable({ rows, sumber, ukuran }: { rows: SummaryDisease[]; sumber: Sumber; ukuran: UkuranEbs }) {
  const { t } = useTranslation()
  const showEbs = sumber !== 'pe', showPe = sumber !== 'ebs'
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: showEbs ? 'ebs' : 'pe', desc: true })
  const [all, setAll] = useState(false)
  const ebsVal = (r: SummaryDisease) => (ukuran === 'kasus' ? r.ebs?.cases : r.ebs?.alerts) ?? 0
  const deaths = (r: SummaryDisease) => (showEbs ? r.ebs?.deaths ?? 0 : 0) + (showPe ? r.pe?.deaths ?? 0 : 0)
  const active = (r: SummaryDisease) => (showEbs && ebsVal(r) > 0) || (showPe && (r.pe?.cases ?? 0) > 0)
  const sorted = useMemo(() => {
    const key = (r: SummaryDisease): number | string => sort.k === 'name' ? r.name : sort.k === 'ebs' ? ebsVal(r) : sort.k === 'pe' ? r.pe?.cases ?? 0 : deaths(r)
    return [...rows].sort((a, b) => {
      const x = key(a), y = key(b)
      const c = typeof x === 'string' ? x.localeCompare(String(y), 'id') : (x as number) - (y as number)
      return (sort.desc ? -c : c) || a.name.localeCompare(b.name, 'id')
    })
  }, [rows, sort, ukuran, sumber]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeCount = rows.filter(active).length
  const list = all ? sorted : sorted.filter(active)
  const Th = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-2 py-2 ${className}`}>
      <button type="button" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== 'name' }))} className="inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:text-brand-700" aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        {children}{sort.k === k ? (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : null}
      </button>
    </th>
  )
  return (
    <div data-testid="disease-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm [&_td]:align-top">
          <thead className="border-b border-slate-200 text-[11px] text-slate-500">
            <tr>
              <Th k="name">{t('skdr.dtable.disease')}</Th>
              {showEbs ? <Th k="ebs"><SourceKey source="ebs" label={ukuran === 'kasus' ? t('skdr.dtable.ebsCases') : t('skdr.dtable.ebsSignals')} /></Th> : null}
              {showPe ? <Th k="pe"><SourceKey source="pe" label={t('skdr.dtable.peCases')} /></Th> : null}
              <Th k="deaths" className="text-right">{t('skdr.dtable.deaths')}</Th>
              <th className="px-2 py-2 font-bold uppercase tracking-wider">{t('skdr.dtable.regions')}</th>
              <th className="px-2 py-2 font-bold uppercase tracking-wider">{t('skdr.dtable.peForm')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="group border-b border-slate-100 hover:bg-brand-50/60" data-testid="disease-row">
                <td className="px-2 py-2">
                  <Link href={`/penyakit/${r.code.toLowerCase()}`} className="font-bold text-slate-900 group-hover:text-brand-700">{r.name}</Link>
                  {r.category ? <div className="text-[11px] text-slate-500">{r.category}</div> : null}
                </td>
                {showEbs ? (
                  <td className="px-2 py-2"><div className="flex items-center gap-2">
                    <Spark values={(ukuran === 'kasus' ? r.ebs?.spark_cases : r.ebs?.spark_alerts) || []} color={SOURCE_COLOR.ebs} />
                    <span className="w-14 text-right font-mono font-bold text-slate-900">{fmt(ebsVal(r))}</span>
                    <Trend d={(ukuran === 'kasus' ? r.ebs?.delta_cases : r.ebs?.delta_alerts) ?? null} />
                  </div></td>
                ) : null}
                {showPe ? (
                  <td className="px-2 py-2">{r.pe_form || (r.pe?.cases ?? 0) > 0 ? (<>
                    <div className="flex items-center gap-2">
                      <Spark values={r.pe?.spark || []} color={SOURCE_COLOR.pe} />
                      <span className="w-10 text-right font-mono font-bold text-slate-900">{fmt(r.pe?.cases ?? 0)}</span>
                      <Trend d={r.pe?.delta ?? null} />
                    </div>
                    {r.pe?.status?.classes.length ? (
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-600" data-testid="pe-status-split">
                        {r.pe.status.classes.map((c) => <span key={c.code}>{c.label} <b className="text-slate-900">{fmt(c.n)}</b></span>)}
                        {r.pe.status.unclassified ? <span className="text-slate-400" title={t('skdr.dtable.unclassifiedHint')}>{t('skdr.dtable.unclassified')} {fmt(r.pe.status.unclassified)}</span> : null}
                      </div>
                    ) : null}
                  </>) : <span className="text-[11px] italic text-slate-400">{t('skdr.dtable.noPeForm')}</span>}</td>
                ) : null}
                <td className="px-2 py-2 text-right text-xs">
                  {showEbs ? <div className="font-semibold text-red-700" title={t('skdr.source.ebs')}><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ebs" />{fmt(r.ebs?.deaths ?? 0)}</div> : null}
                  {showPe ? <div className="font-semibold text-red-700" title={t('skdr.source.pe')}><span className="mr-1 inline-block h-1.5 w-1.5 rotate-45 bg-pe" />{fmt(r.pe?.deaths ?? 0)}</div> : null}
                </td>
                <td className="px-2 py-2 text-xs text-slate-600">
                  {showEbs ? <div>{t('skdr.dtable.provN', { n: fmt(r.ebs?.provinces ?? 0) })} <span className="text-slate-400">EBS</span></div> : null}
                  {showPe ? <div>{t('skdr.dtable.provN', { n: fmt(r.pe?.provinces ?? 0) })} <span className="text-slate-400">PE</span></div> : null}
                </td>
                <td className="px-2 py-2 text-xs">{r.pe_form ? <Link href={`/pe/${r.pe_form}`} className="font-semibold text-brand-700 hover:underline">{t('skdr.dtable.openForm')}</Link> : <span className="text-slate-400">—</span>}</td>
                <td className="px-1 text-slate-300 group-hover:text-brand-700"><ChevronRight className="h-4 w-4" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{t('skdr.dtable.footer', { active: fmt(activeCount), total: fmt(rows.length) })}</span>
        {rows.length > activeCount ? (
          <button type="button" onClick={() => setAll(!all)} className="font-bold text-brand-700 hover:underline" data-testid="disease-table-toggle">
            {all ? t('skdr.dtable.showActive') : t('skdr.dtable.showAll', { n: fmt(rows.length) })}
          </button>
        ) : null}
      </div>
    </div>
  )
}

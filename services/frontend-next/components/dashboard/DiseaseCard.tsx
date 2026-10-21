'use client'
// PR 018: disease summary card (mockup #s1 "Ringkasan per penyakit"). One card per registry disease from
// /api/v1/analytics/summary — EBS and Kasus PE stay separate (colour + symbol), never summed. Used full on /penyakit
// and compact in the dashboard carousel. Everything follows the global filters and Sumber.
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt } from '@/lib/analytics-api'
import { SOURCE_COLOR } from '@/lib/theme'
import { SourceKey } from '@/components/analytics/SourceBadge'
import { Spark, Trend, type D24, type SummaryDisease } from '@/components/dashboard/DiseaseTable'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'

const STATUS_TONE = ['#00594F', '#00897B', '#4DB6AC', '#B2DFDB', '#F59E0B', '#EF4444']
const dmy = (s?: string | null) => (s ? s.split('-').reverse().join('/') : null)

function Delta24({ d }: { d?: D24 }) {
  const { t } = useTranslation()
  if (!d) return <span className="text-[10.5px] text-slate-400" title={t('skdr.dcard.d24None')}>24j —</span>
  const diff = d.cur - d.prev
  return (
    <span title={t('skdr.dcard.d24Hint', { cur: fmt(d.cur), prev: fmt(d.prev) })}
      className={`text-[10.5px] font-bold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
      24j {diff > 0 ? '+' : ''}{fmt(diff)}
    </span>
  )
}

export function diseaseActive(r: SummaryDisease, sumber: Sumber) {
  return (sumber !== 'pe' && (r.ebs?.alerts ?? 0) > 0) || (sumber !== 'ebs' && (r.pe?.cases ?? 0) > 0)
}

export default function DiseaseCard({ r, sumber, ukuran = 'alert', compact = false }: { r: SummaryDisease; sumber: Sumber; ukuran?: UkuranEbs; compact?: boolean }) {
  const { t } = useTranslation()
  const showEbs = sumber !== 'pe' && !!r.ebs, showPe = sumber !== 'ebs' && !!r.pe
  const ebsVal = ukuran === 'kasus' ? r.ebs?.cases ?? 0 : r.ebs?.alerts ?? 0
  const cfr = r.pe && (r.pe.known_outcome ?? 0) > 0 ? (r.pe.deaths * 100) / (r.pe.known_outcome as number) : null
  const last = [showEbs ? r.ebs?.last_date : null, showPe ? r.pe?.last_date : null].filter(Boolean).sort().pop() as string | undefined
  const st = r.pe?.status
  const stTotal = st ? st.classes.reduce((a, c) => a + c.n, 0) + st.unclassified : 0
  const href = `/penyakit/${r.code.toLowerCase()}`
  return (
    <Link href={href} data-testid={compact ? 'disease-mini' : 'disease-card'} draggable={false}
      className={`skdr-card group flex h-full flex-col transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate font-black text-slate-900 group-hover:text-primary ${compact ? 'text-sm' : 'text-base'}`}>{r.name}</div>
          <div className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{r.category || t('skdr.dcard.noCategory')}{r.is_zoonotic ? ` · ${t('skdr.penyakit.zoonotic')}` : ''}</div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-primary" />
      </div>

      <div className={`mt-3 grid gap-2 ${showEbs && showPe && !compact ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showEbs ? (
          <div className={`rounded-lg bg-page ${compact ? 'px-2 py-1.5' : 'p-2'} min-w-0`}>
            <SourceKey source="ebs" label={ukuran === 'kasus' ? t('skdr.dcard.ebsCases') : t('skdr.dcard.ebsAlerts')} />
            <div className={`mt-1 flex gap-2 ${compact ? 'items-center' : 'flex-col'}`}>
              <span className="text-lg font-black leading-none tabular-nums text-slate-900">{fmt(ebsVal)}</span>
              <div className="min-w-0 flex-1"><Spark fluid values={(ukuran === 'kasus' ? r.ebs?.spark_cases : r.ebs?.spark_alerts) ?? []} color={SOURCE_COLOR.ebs} /></div>
            </div>
            <div className="mt-0.5 flex items-center gap-2"><Trend d={(ukuran === 'kasus' ? r.ebs?.delta_cases : r.ebs?.delta_alerts) ?? null} /><Delta24 d={r.ebs?.d24} /></div>
          </div>
        ) : null}
        {showPe ? (
          <div className={`rounded-lg bg-page ${compact ? 'px-2 py-1.5' : 'p-2'} min-w-0`}>
            <SourceKey source="pe" label={t('skdr.dcard.peCases')} />
            <div className={`mt-1 flex gap-2 ${compact ? 'items-center' : 'flex-col'}`}>
              <span className="text-lg font-black leading-none tabular-nums text-slate-900">{fmt(r.pe?.cases ?? 0)}</span>
              <div className="min-w-0 flex-1"><Spark fluid values={r.pe?.spark ?? []} color={SOURCE_COLOR.pe} /></div>
            </div>
            <div className="mt-0.5 flex items-center gap-2"><Trend d={r.pe?.delta ?? null} /><Delta24 d={r.pe?.d24} /></div>
          </div>
        ) : null}
      </div>

      <dl className={`mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] ${compact ? '' : 'sm:grid-cols-2'}`}>
        <div className="flex justify-between gap-1"><dt className="text-slate-500">{t('skdr.dcard.deaths')}</dt>
          <dd className="font-bold tabular-nums text-slate-800">{fmt((showEbs ? r.ebs?.deaths ?? 0 : 0) + (showPe ? r.pe?.deaths ?? 0 : 0))}</dd></div>
        <div className="flex justify-between gap-1" title={t('skdr.dcard.cfrHint')}><dt className="text-slate-500">CFR PE</dt>
          <dd className="font-bold tabular-nums text-slate-800">{showPe && cfr !== null ? `${cfr.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—'}</dd></div>
        <div className="col-span-2 flex justify-between gap-1"><dt className="text-slate-500">{t('skdr.dcard.provinces')}</dt>
          <dd className="font-bold tabular-nums text-slate-800">
            {showEbs ? <span style={{ color: SOURCE_COLOR.ebs }}>● {fmt(r.ebs?.provinces ?? 0)}</span> : null}
            {showEbs && showPe ? ' · ' : null}
            {showPe ? <span style={{ color: SOURCE_COLOR.pe }}>■ {fmt(r.pe?.provinces ?? 0)}</span> : null}
          </dd></div>
      </dl>

      {showPe && !compact ? (
        <div className="mt-2">
          <div className="text-[10.5px] font-semibold text-slate-500">{t('skdr.dcard.statusSplit')}</div>
          {st && stTotal > 0 ? (
            <>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t('skdr.dcard.statusSplit')}>
                {st.classes.map((c, i) => c.n > 0 ? <span key={c.code} title={`${c.label}: ${fmt(c.n)}`} style={{ width: `${(c.n * 100) / stTotal}%`, background: STATUS_TONE[i % STATUS_TONE.length] }} /> : null)}
                {st.unclassified > 0 ? <span title={`${t('skdr.dcard.unclassified')}: ${fmt(st.unclassified)}`} style={{ width: `${(st.unclassified * 100) / stTotal}%` }} className="bg-slate-300" /> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                {st.classes.filter((c) => c.n > 0).map((c) => <span key={c.code}><span style={{ color: STATUS_TONE[st.classes.indexOf(c) % STATUS_TONE.length] }}>■</span> {c.label} {fmt(c.n)}</span>)}
                {st.unclassified > 0 ? <span><span className="text-slate-400">■</span> {t('skdr.dcard.unclassified')} {fmt(st.unclassified)}</span> : null}
              </div>
            </>
          ) : <div className="mt-1 text-[10.5px] text-slate-400">{r.pe_form ? t('skdr.dcard.noCases') : t('skdr.dcard.noPeForm')}</div>}
        </div>
      ) : null}

      <div className="mt-auto pt-2 text-[10.5px] text-slate-500">{t('skdr.dcard.lastData')}: <span className="font-semibold text-slate-700">{dmy(last) || t('skdr.dcard.noData')}</span></div>
    </Link>
  )
}

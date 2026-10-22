'use client'
// PR 018: Integrasi NAR–SKDR on the main dashboard (mockup layout), following the global filters.
// Only "% kasus dengan NIK terisi" and the Tanpa NIK / Ber-NIK split come from SKDR data; tiles and table that need the
// NAR (lab) API show "—" / an empty state until the connection exists. No estimates, no dummy values.
import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { peFetch } from '@/lib/pe-api'
import { fmt as n, pct1, type Rate } from '@/lib/analytics-api'
import { Panel } from '@/components/analytics/SourceBadge'
import { ErrorState, SkeletonChart } from '@/components/ui/Skeleton'
import type { Sumber } from '@/lib/use-sumber'

type Row = { code: string; name: string; total: number; with_nik: number; valid_nik: number; without_nik: number; pct: Rate }
type Nar = { excluded_classes: string[]; nik: { total: number; with_nik: number; valid_nik: number; pct: Rate; per_disease: Row[] } }

function Tile({ value, label, pending, testId }: { value: React.ReactNode; label: React.ReactNode; pending?: boolean; testId?: string }) {
  const { t } = useTranslation()
  return (
    <div className="skdr-card flex flex-col p-4" data-testid={testId}>
      <div className={`text-3xl font-black tabular-nums ${pending ? 'text-slate-300' : 'text-primary'}`}>{value}</div>
      <div className="mt-1 text-xs leading-snug text-slate-600">{label}</div>
      {pending ? <div className="mt-2 text-[11px] text-slate-400">{t('skdr.nar.pending')}</div> : null}
    </div>
  )
}

const SEG = [
  { key: 'ok', cls: 'bg-emerald-500' },
  { key: 'update', cls: 'bg-amber-500' },
  { key: 'notInNar', cls: 'bg-rose-400' },
  { key: 'noNik', cls: 'bg-slate-700' },
] as const

export default function NarSkdr({ qs, sumber }: { qs: string; sumber: Sumber }) {
  const { t } = useTranslation()
  const [d, setD] = useState<Nar | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let a = true
    setErr('')
    peFetch<{ data: Nar }>(`/api/v1/nar/summary?${qs}`).then((j) => a && setD(j.data)).catch((e) => a && setErr(e.message || 'error'))
    return () => { a = false }
  }, [qs, tick])
  const head = { title: t('skdr.nar.title'), description: t('skdr.nar.desc'), testId: 'nar-skdr' }
  if (sumber === 'ebs') return <Panel {...head}><p className="text-xs text-slate-500">{t('skdr.nar.peOnly')}</p></Panel>
  if (err) return <Panel {...head}><ErrorState message={err} onRetry={() => setTick((x) => x + 1)} /></Panel>
  if (!d) return <Panel {...head}><SkeletonChart /></Panel>
  const p = d.nik.pct
  return (
    <Panel {...head}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile testId="nar-nik" value={p.pct === null ? '—' : `${pct1(p.pct)}%`} label={t('skdr.nar.tileNik', { a: n(p.num), b: n(p.den) })} />
        <Tile testId="nar-pending" pending value="—" label={t('skdr.nar.tileMatch')} />
        <Tile testId="nar-pending" pending value="—" label={t('skdr.nar.tileUpdate')} />
        <Tile testId="nar-pending" pending value="—" label={t('skdr.nar.tilePositive')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="skdr-card p-4" data-testid="nar-per-disease">
          <h3 className="text-sm font-bold text-slate-900">{t('skdr.nar.reconTitle')}</h3>
          {d.nik.per_disease.length ? (
            <div className="mt-3 space-y-2.5">
              {d.nik.per_disease.map((r) => (
                <div key={r.code} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[10rem_1fr_auto]">
                  <span className="truncate font-semibold text-slate-800">{r.name}</span>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={t('skdr.nar.barAria', { a: n(r.with_nik), b: n(r.without_nik) })}>
                    <span className="bg-slate-300" style={{ width: `${(r.with_nik * 100) / Math.max(1, r.total)}%` }} title={`${t('skdr.nar.segWaiting')}: ${n(r.with_nik)}`} />
                    <span className="bg-slate-700" style={{ width: `${(r.without_nik * 100) / Math.max(1, r.total)}%` }} title={`${t('skdr.nar.seg.noNik')}: ${n(r.without_nik)}`} />
                  </div>
                  <span className="whitespace-nowrap tabular-nums text-slate-500">{t('skdr.nar.casesInSkdr', { n: n(r.total) })}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-xs text-slate-500">{t('skdr.state.empty')}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            {SEG.map((s) => <span key={s.key} className={`inline-flex items-center gap-1.5 ${s.key === 'noNik' ? '' : 'opacity-50'}`}><span className={`h-2.5 w-2.5 rounded-sm ${s.cls}`} />{t(`skdr.nar.seg.${s.key}`)}</span>)}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />{t('skdr.nar.segWaiting')}</span>
          </div>
        </div>

        <div className="skdr-card p-4" data-testid="nar-followup">
          <h3 className="text-sm font-bold text-slate-900">{t('skdr.nar.followTitle')}</h3>
          <div className="skdr-table-card mt-3"><table className="skdr-table text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-line"><th className="py-1.5 pr-2">{t('skdr.nar.colAction')}</th><th className="pr-2">{t('skdr.nar.colDisease')}</th><th className="pr-2">{t('skdr.nar.colKab')}</th><th>{t('skdr.nar.colWeek')}</th></tr>
            </thead>
            <tbody><tr><td colSpan={4} className="py-6 text-center text-slate-500">{t('skdr.nar.followEmpty')}</td></tr></tbody>
          </table></div>
        </div>
      </div>
    </Panel>
  )
}

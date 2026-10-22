'use client'
// PR 016: Kinerja 7-1-7 (sheet "Spesifikasi Dashboard Executive" No. 41–45). Alert EBS only, denominator = all alerts
// except discarded. One section, exactly 3 cards (Deteksi / Notifikasi / Respons). "Lihat detail" on any card expands
// all three together (shared state) to show the per-disease breakdown inside each card (rows from the registry).
// Steps without source timestamps show "Data belum tersedia" and the missing EBS field — no estimated values.
import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { fmt as n, pct1 } from '@/lib/analytics-api'
import { MutedNote, Panel } from '@/components/analytics/SourceBadge'
import type { Sumber } from '@/lib/use-sumber'
import { LihatButton, useSignalModal } from '@/components/dashboard/SignalModal'

export type Stage = { den: number; on_time: number; late: number; missing: number; median_days: number | null; pct: number | null }
export type T717Data = {
  notification: Stage | null; detection: Stage | null; response: Stage | null
  missing_fields: { detection: string[]; response: string[] }
  diseases: { id: number; code: string; name: string; notification: Stage }[]
  thresholds: { green: number; yellow: number } | null
  /** PR 018: latest alerts in the filter with their notification lag (days) */
  signals?: { id: number; no_ebs: string | null; disease: string | null; kabkota: string | null; province: string | null; tgl_laporan: string | null; created: string | null; notif_days: number | null; status: string | null }[]
}

/** PR 018 (mockup #s3b): stacked bar on-time / late / missing date for one stage. */
function Stack({ s, compact = false }: { s: Stage | null; compact?: boolean }) {
  const { t } = useTranslation()
  if (!s || !s.den) return <div className={`${compact ? 'h-2' : 'h-2.5'} rounded-full bg-slate-100`} title={t('skdr.t717.unavailable')} />
  const parts = [
    { k: 'on', v: s.on_time, c: 'bg-emerald-500', l: t('skdr.t717.onTime') },
    { k: 'late', v: s.late, c: 'bg-red-500', l: t('skdr.t717.late') },
    { k: 'miss', v: s.missing, c: 'bg-slate-300', l: t('skdr.t717.missing') },
  ]
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1
  return (
    <div className={`flex ${compact ? 'h-2' : 'h-2.5'} overflow-hidden rounded-full bg-slate-100`} role="img"
      aria-label={parts.map((p) => `${p.l} ${n(p.v)}`).join(', ')} data-testid="t717-stack">
      {parts.map((p) => p.v > 0 ? <span key={p.k} className={p.c} style={{ width: `${(p.v * 100) / tot}%` }} title={`${p.l}: ${n(p.v)}`} /> : null)}
    </div>
  )
}

function tone(p: number | null | undefined, th: T717Data['thresholds']) {
  if (p === null || p === undefined || !th) return { text: 'text-slate-500', bg: 'bg-slate-100', ring: 'border-slate-200', dot: 'bg-slate-300' }
  if (p >= th.green) return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'border-emerald-200', dot: 'bg-emerald-500' }
  if (p >= th.yellow) return { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'border-amber-200', dot: 'bg-amber-400' }
  return { text: 'text-red-700', bg: 'bg-red-50', ring: 'border-red-200', dot: 'bg-red-500' }
}

type Key = 'detection' | 'notification' | 'response'

function Card({ k, title, target, explain, s, missing, th, rows, open, onToggle }: {
  k: Key; title: string; target: string; explain: string; s: Stage | null; missing?: string[]; th: T717Data['thresholds']
  rows: { id: number; name: string; s: Stage | null }[]; open: boolean; onToggle: () => void
}) {
  const { t } = useTranslation()
  const c = tone(s?.pct, th)
  const has = !!s && s.pct !== null
  return (
    <div className={`flex h-full min-w-0 flex-col rounded-xl border p-4 ${has ? `${c.ring} ${c.bg}` : 'border-dashed border-slate-200 bg-slate-50'}`} data-testid="t717-step" data-stage={k}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${has ? c.dot : 'bg-slate-300'}`} aria-hidden />
        <span className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</span>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-2xs">{target}</span>
      </div>
      {has ? (
        <>
          <div className={`mt-3 text-5xl font-black leading-none ${c.text}`}>{pct1(s!.pct as number)}%</div>
          <div className="mt-1 text-xs font-semibold text-slate-600">{t('skdr.t717.meetTarget')}</div>
          <div className="mt-2 text-xs text-slate-600">{t('skdr.t717.median', { d: s!.median_days === null ? '—' : pct1(s!.median_days) })} · {t('skdr.t717.onTimeOf', { n: n(s!.on_time), N: n(s!.den) })}</div>
          {s!.missing ? <div className="text-xs text-slate-500">{t('skdr.t717.missingDates', { n: n(s!.missing) })}</div> : null}
          <div className="mt-2"><Stack s={s} /></div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10.5px] text-slate-600">
            <span><span className="text-emerald-600">■</span> {t('skdr.t717.onTime')} {n(s!.on_time)}</span>
            <span><span className="text-red-500">■</span> {t('skdr.t717.late')} {n(s!.late)}</span>
            <span><span className="text-slate-400">■</span> {t('skdr.t717.missing')} {n(s!.missing)}</span>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 text-lg font-black text-slate-400">{t('skdr.t717.unavailable')}</div>
          {missing?.length ? <div className="mt-1 text-[11px] leading-snug text-slate-500">{t('skdr.t717.missingField', { f: missing.join(', ') })}</div> : null}
        </>
      )}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">{explain}</p>

      {/* shared expand: grid-rows 0fr → 1fr gives a smooth height animation without measuring */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} aria-hidden={!open}>
        <div className="min-h-0 overflow-hidden">
          <div className="skdr-table-card mt-3"><table className="skdr-table text-left text-xs" data-testid="t717-detail">
            <thead className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
              <tr><th className="py-1.5 pr-2">{t('skdr.dtable.disease')}</th><th className="px-2 text-right">%</th><th className="px-2 text-right">{t('skdr.t717.medianShort')}</th><th className="pl-2 text-right">n/N</th><th className="w-20 pl-2"><span className="sr-only">{t('skdr.t717.split')}</span></th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => {
                const rc = tone(r.s?.pct, th)
                return (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-2 font-semibold text-slate-800">{r.name}</td>
                    <td className={`px-2 text-right font-black ${r.s && r.s.pct !== null ? rc.text : 'text-slate-400'}`}>{r.s && r.s.pct !== null ? `${pct1(r.s.pct)}%` : '—'}</td>
                    <td className="px-2 text-right text-slate-600">{r.s && r.s.median_days !== null ? pct1(r.s.median_days) : '—'}</td>
                    <td className="pl-2 text-right text-slate-600">{r.s && r.s.den ? `${n(r.s.on_time)}/${n(r.s.den)}` : '—'}</td>
                    <td className="pl-2"><Stack s={r.s} compact /></td>
                  </tr>
                )
              }) : <tr><td colSpan={5} className="py-2 text-slate-500">{t('skdr.state.empty')}</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>

      <button type="button" onClick={onToggle} aria-expanded={open} data-testid="t717-toggle"
        className="mt-auto inline-flex items-center gap-1 self-start pt-3 text-xs font-bold text-brand-700 hover:underline">
        {open ? t('skdr.t717.hideDetail') : t('skdr.t717.showDetail')}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}

export default function T717({ data, sumber }: { data: T717Data | null | undefined; sumber: Sumber }) {
  const { t } = useTranslation()
  const [open2, setOpen] = useState(false)
  const { open, modal } = useSignalModal()
  const info = (
    <span className="inline-flex cursor-help items-center text-slate-400" title={t('skdr.t717.info')} data-testid="t717-info"><Info className="h-4 w-4" /></span>
  )
  if (sumber === 'pe' || !data) {
    return (
      <Panel title={<span className="inline-flex items-center gap-2">{t('skdr.t717.title')} {info}</span>} testId="t717">
        <MutedNote>{t('skdr.t717.ebsOnly')}</MutedNote>
      </Panel>
    )
  }
  const th = data.thresholds
  // detection/response have no per-disease values yet (fields missing from the EBS feed) → rows show "—"
  const rows = (k: Key) => data.diseases.map((d) => ({ id: d.id, name: d.name, s: k === 'notification' ? d.notification : ((d as Record<string, unknown>)[k] as Stage | undefined) ?? null }))
  const common = { th, open: open2, onToggle: () => setOpen((v) => !v) }
  return (
    <Panel title={<span className="inline-flex items-center gap-2">{t('skdr.t717.title')} {info}</span>} testId="t717">
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-3">
        <Card k="detection" title={t('skdr.t717.detect')} target={t('skdr.t717.target', { d: 7 })} explain={t('skdr.t717.detectExplain')} s={data.detection} missing={data.missing_fields.detection} rows={rows('detection')} {...common} />
        <Card k="notification" title={t('skdr.t717.notify')} target={t('skdr.t717.target', { d: 1 })} explain={t('skdr.t717.notifyExplain')} s={data.notification} rows={rows('notification')} {...common} />
        <Card k="response" title={t('skdr.t717.respond')} target={t('skdr.t717.target', { d: 7 })} explain={t('skdr.t717.respondExplain')} s={data.response} missing={data.missing_fields.response} rows={rows('response')} {...common} />
      </div>
      {/* PR 018: per-signal timing — latest alerts with their notification lag vs the 1-day target; Lihat opens the modal */}
      <div className="mt-4" data-testid="t717-signals">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">{t('skdr.t717.signalsTitle')}</h4>
        {data.signals?.length ? (
          <div className="skdr-table-card mt-2 max-h-80 overflow-y-auto">
            <table className="skdr-table text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-2 py-1.5">{t('skdr.t717.colSignal')}</th><th className="px-2">{t('skdr.dtable.disease')}</th><th className="px-2">{t('skdr.t717.colLocation')}</th>
                  <th className="px-2">{t('skdr.t717.colReport')}</th><th className="px-2">{t('skdr.t717.colCreated')}</th><th className="px-2 text-right">{t('skdr.t717.notify')}</th>
                  <th className="px-2">{t('skdr.t717.detect')} / {t('skdr.t717.respond')}</th><th className="px-2"><span className="sr-only">{t('skdr.signal.view')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.signals.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5 font-mono font-semibold text-slate-800">{r.no_ebs || `#${r.id}`}</td>
                    <td className="px-2 text-slate-700">{r.disease || '—'}</td>
                    <td className="px-2 text-slate-600">{[r.kabkota, r.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-2 tabular-nums text-slate-600">{r.tgl_laporan ? r.tgl_laporan.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-2 tabular-nums text-slate-600">{r.created ? `${r.created.slice(0, 10).split('-').reverse().join('/')}${r.created.slice(10)}` : '—'}</td>
                    <td className={`px-2 text-right font-black tabular-nums ${r.notif_days === null ? 'text-slate-400' : r.notif_days <= 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.notif_days === null ? '—' : t('skdr.signal.days', { n: r.notif_days })}</td>
                    <td className="px-2 text-[11px] text-slate-400">{t('skdr.t717.unavailable')}</td>
                    <td className="px-2 text-right"><LihatButton onClick={() => open('ebs', r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-2 text-xs text-slate-500">{t('skdr.t717.unavailable')}</div>}
      </div>
      {modal}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t('skdr.t717.footer', { g: th?.green ?? '—', y: th?.yellow ?? '—' })}</p>
    </Panel>
  )
}

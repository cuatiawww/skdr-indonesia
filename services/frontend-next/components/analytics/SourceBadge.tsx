'use client'
// PR 016: no per-section source badges or filters any more. One global Sumber filter per page (SourceFilter, kept in
// the URL by lib/use-sumber.ts); inside widgets EBS vs Kasus PE are told apart by series colour + legend only
// (EBS = warm orange, Kasus PE = Kemenkes teal; tokens in lib/theme.ts). The two sources are never summed silently.
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { SOURCE_COLOR } from '@/lib/theme'
import type { Sumber, UkuranEbs } from '@/lib/use-sumber'

export type Source = 'ebs' | 'pe'
export { SOURCE_COLOR }

/** Legend chip: coloured symbol + label (circle = EBS, diamond = Kasus PE, same as the map). */
export function SourceKey({ source, label, className = '' }: { source: Source; label?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 ${className}`} title={t(`skdr.source.${source}Hint`)}>
      {source === 'ebs' ? <span className="h-2.5 w-2.5 rounded-full bg-ebs" /> : <span className="mx-px h-2 w-2 rotate-45 bg-pe" />}
      {label ?? t(`skdr.source.${source}`)}
    </span>
  )
}

/** The single global Sumber filter (segmented control). */
export function SourceFilter({ value, onChange }: { value: Sumber | string; onChange: (v: Sumber) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('skdr.source.filter')} className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold" data-testid="global-source-filter">
      {(['all', 'ebs', 'pe'] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} data-value={s}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${value === s ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50'}`}>
          {s === 'ebs' ? <span className={`h-2 w-2 rounded-full ${value === s ? 'bg-white' : 'bg-ebs'}`} /> : s === 'pe' ? <span className={`h-1.5 w-1.5 rotate-45 ${value === s ? 'bg-white' : 'bg-pe'}`} /> : null}
          {s === 'all' ? t('skdr.source.all') : t(`skdr.source.${s}`)}
        </button>
      ))}
    </div>
  )
}

/** Global EBS measure (Alert vs Kasus dilaporkan) — shown next to the Sumber filter when EBS is visible. */
export function UkuranFilter({ value, onChange }: { value: UkuranEbs; onChange: (v: UkuranEbs) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('skdr.source.measure')} className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold" data-testid="global-measure-filter">
      {(['alert', 'kasus'] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}
          className={`rounded-lg px-3 py-1.5 transition ${value === s ? 'bg-brand-100 text-brand-800' : 'text-slate-600 hover:bg-brand-50'}`}>
          {t(s === 'alert' ? 'skdr.charts.metricAlerts' : 'skdr.charts.metricEbsCases')}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, children, className = '', right, testId, legend }: {
  title: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode; testId?: string; legend?: React.ReactNode
}) {
  return (
    <article data-testid={testId} className={`relative flex h-full min-w-0 flex-col overflow-hidden border border-slate-200 bg-white p-4 shadow-sm ${className}`} style={{ borderRadius: '17px 17px 22px 17px' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-black uppercase tracking-wide text-slate-900">{title}</h3>
        <div className="flex flex-wrap items-center gap-3">{legend}{right}</div>
      </div>
      {children}
    </article>
  )
}

/** Editorial section: small uppercase eyebrow + thin rule, no card frame (PR 016 disease page). */
export function Section({ eyebrow, title, children, right, testId, className = '' }: {
  eyebrow: string; title?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; testId?: string; className?: string
}) {
  return (
    <section data-testid={testId} className={`min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-1.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</div>
        {right ? <div className="flex flex-wrap items-center gap-3">{right}</div> : null}
      </div>
      {title ? <h2 className="mt-3 text-lg font-black text-slate-900">{title}</h2> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">{children}</div>
}

/** One-line muted note when a source has no data (instead of a big empty box). */
export function MutedNote({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <p data-testid={testId} className="text-xs italic text-slate-500">{children}</p>
}

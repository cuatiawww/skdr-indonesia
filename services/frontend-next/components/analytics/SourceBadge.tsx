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

/** PR 018: shared section header — small uppercase eyebrow (12px), title text-2xl bold in Kemenkes dark text,
 *  optional one-line description (14px muted), thin rule; title-to-content gap 16px. Vertical rhythm between sections
 *  comes from the `.skdr-section` token (32px mobile / 48px ≥1024 incl. the parent stack gap). */
export function SectionHeader({ eyebrow, title, description, right }: {
  eyebrow?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode; right?: React.ReactNode
}) {
  return (
    <header className="skdr-section-head">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="skdr-eyebrow">{eyebrow}</div> : null}
          {title ? <h2 className="skdr-section-title">{title}</h2> : null}
          {description ? <p className="skdr-section-desc">{description}</p> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-3">{right}</div> : null}
      </div>
    </header>
  )
}

/** Editorial panel (charts/maps/tables, no card frame). API unchanged so every existing Panel follows the header. */
export function Panel({ title, children, className = '', right, testId, legend, eyebrow, description }: {
  title: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode; testId?: string; legend?: React.ReactNode
  eyebrow?: React.ReactNode; description?: React.ReactNode
}) {
  return (
    <section data-testid={testId} className={`skdr-section relative flex h-full min-w-0 flex-col ${className}`}>
      <SectionHeader eyebrow={eyebrow} title={title} description={description} right={legend || right ? <>{legend}{right}</> : null} />
      {children}
    </section>
  )
}

/** Editorial section with eyebrow + optional title (PR 016 disease page). */
export function Section({ eyebrow, title, description, children, right, testId, className = '' }: {
  eyebrow: string; title?: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; testId?: string; className?: string
}) {
  return (
    <section data-testid={testId} className={`skdr-section min-w-0 ${className}`}>
      {title ? <SectionHeader eyebrow={eyebrow} title={title} description={description} right={right} />
        : <SectionHeader title={eyebrow} description={description} right={right} />}
      <div>{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-line bg-page px-4 py-6 text-center text-xs text-slate-500">{children}</div>
}

/** One-line muted note when a source has no data (instead of a big empty box). */
export function MutedNote({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <p data-testid={testId} className="text-xs italic text-slate-500">{children}</p>
}

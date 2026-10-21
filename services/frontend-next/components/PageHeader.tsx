// PR 012: shared page header — text only (title + description), no icon box (UI rule for all pages).
// PR 018: same typography as SectionHeader — 12px uppercase eyebrow, 24px bold title (Kemenkes dark), 14px muted description.
import type { ReactNode } from 'react'

export default function PageHeader({ title, subtitle, actions, eyebrow, lead }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; lead?: ReactNode
}) {
  return (
    <header className="skdr-section-head flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-testid="page-header">
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="min-w-0">
          {eyebrow ? <div className="skdr-eyebrow">{eyebrow}</div> : null}
          <h1 className="skdr-section-title">{title}</h1>
          {subtitle ? <div className="skdr-section-desc">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  )
}

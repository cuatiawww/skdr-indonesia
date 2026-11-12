// PR 012: shared page header — text only (title + description), no icon box (UI rule for all pages).
// PR 018: typography SectionHeader.
// PR 067: Standardisasi PageHeader — hilangkan eyebrow teks di atas judul (fokus pada Judul & Deskripsi),
// tata letak 2-grid responsif (~70% judul & deskripsi di kiri, ~30% tombol aksi di kanan rapi anti-overflow).
import type { ReactNode } from 'react'

export default function PageHeader({ title, subtitle, actions, lead, meta }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; lead?: ReactNode; meta?: ReactNode
}) {
  return (
    <header className="skdr-section-head grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-6" data-testid="page-header">
      <div className={actions ? "min-w-0 lg:col-span-8 xl:col-span-8" : "min-w-0 lg:col-span-12"}>
        {lead ? <div className="mb-2">{lead}</div> : null}
        <h1 className="skdr-section-title text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <div className="skdr-section-desc mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-600">{subtitle}</div> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-start gap-2.5 lg:col-span-4 lg:justify-end xl:col-span-4 shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

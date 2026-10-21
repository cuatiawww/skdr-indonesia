'use client'
// PR 012: consistent source labels. EBS = alert/sinyal (oranye), Kasus PE = laporan individu Form PE (biru).
// Spec rule: the two sources are never summed into one total.
import { useTranslation } from '@/lib/i18n/LanguageContext'

export type Source = 'ebs' | 'pe'
export const SOURCE_COLOR: Record<Source, string> = { ebs: '#C2410C', pe: '#0060A9' }
const CLS: Record<Source | 'both', string> = {
  ebs: 'border-orange-200 bg-orange-50 text-orange-700',
  pe: 'border-sky-200 bg-sky-50 text-[#0060A9]',
  both: 'border-slate-200 bg-slate-50 text-slate-600',
}

export default function SourceBadge({ source, className = '' }: { source: Source | 'both'; className?: string }) {
  const { t } = useTranslation()
  const label = source === 'both' ? t('skdr.source.both') : t(`skdr.source.${source}`)
  return (
    <span data-source={source} title={t(`skdr.source.${source}Hint`)}
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CLS[source]} ${className}`}>
      {label}
    </span>
  )
}

export function SourceFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('skdr.source.filter')} className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
      {(['all', 'ebs', 'pe'] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}
          className={`rounded-lg px-3 py-1.5 transition ${value === s ? 'bg-[#0060A9] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {s === 'all' ? t('skdr.source.all') : t(`skdr.source.${s}`)}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, sources, children, className = '', right, testId }: {
  title: React.ReactNode; sources?: (Source | 'both')[]; children: React.ReactNode; className?: string; right?: React.ReactNode; testId?: string
}) {
  return (
    <article data-testid={testId} className={`relative flex h-full min-w-0 flex-col overflow-hidden border border-slate-200 bg-white p-4 shadow-sm ${className}`} style={{ borderRadius: '17px 17px 22px 17px' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-black uppercase tracking-wide text-slate-900">{title}</h3>
          {(sources || []).map((s) => <SourceBadge key={s} source={s} />)}
        </div>
        {right}
      </div>
      {children}
    </article>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">{children}</div>
}

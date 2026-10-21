import type { LucideIcon } from 'lucide-react'

// Card style copied from the NLP-PENYAKIT home overview metric cards.
export default function MetricCard({ label, value, description, icon: Icon, tone }: {
  label: string; value: string; description?: string; icon: LucideIcon; tone: string
}) {
  return (
    <article className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-[#0060A9]/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      {description ? <p className="mt-1 truncate text-[11px] text-slate-500">{description}</p> : null}
    </article>
  )
}

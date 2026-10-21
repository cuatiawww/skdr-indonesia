'use client'
// PR 018: five-class choropleth legend row ("Jumlah per provinsi: 0 1 2–3 4 5+"); classes from app_settings.map_choropleth.
import type { ChoroClass } from '@/lib/choropleth-classes'

export default function ChoroLegend({ classes, label }: { classes: ChoroClass[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-600" data-testid="choro-legend">
      <span>{label}:</span>
      {classes.map((c) => (
        <span key={c.label} className="flex items-center gap-1">
          <span className="h-3 w-5 rounded-[2px] border border-slate-300/70" style={{ background: c.color }} />
          <span className="tabular-nums">{c.label}</span>
        </span>
      ))}
    </div>
  )
}

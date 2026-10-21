'use client'
import type { Filters, MasterItem } from '@/lib/api'

const input = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-xs focus:border-[#0060A9] focus:outline-none'

export default function FilterBar({ value, onChange, diseases, locations }: {
  value: Filters; onChange: (f: Filters) => void; diseases: MasterItem[]; locations: MasterItem[]
}) {
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: v || undefined })
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">From
        <input type="date" className={input} value={value.from || ''} onChange={(e) => set('from', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">To
        <input type="date" className={input} value={value.to || ''} onChange={(e) => set('to', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Disease
        <select className={input} value={value.disease_id || ''} onChange={(e) => set('disease_id', e.target.value)}>
          <option value="">All diseases</option>
          {diseases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Location
        <select className={input} value={value.location_id || ''} onChange={(e) => set('location_id', e.target.value)}>
          <option value="">All provinces</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => onChange({})} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Reset</button>
    </div>
  )
}

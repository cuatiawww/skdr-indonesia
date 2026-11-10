'use client'

import type { ReactNode } from 'react'

export const nf = (v: number | null | undefined) => new Intl.NumberFormat('id-ID').format(v ?? 0)
export const pf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)

export function EmptyBox({ msg }: { msg: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-xs text-slate-500">
      {msg}
    </div>
  )
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'emerald',
}: {
  icon: any
  label: string
  value: string
  sub?: ReactNode
  tone?: 'emerald' | 'teal' | 'blue' | 'amber' | 'red' | 'slate'
}) {
  const toneCls: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  return (
    <div className="skdr-card flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneCls[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}

export function RekapBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>
  const v = value.toUpperCase()
  const cls = v === 'BAIK' || v === 'SESUAI' || v === 'MEMENUHI SYARAT' || v === 'YA' || v === 'DITUTUP' || v === 'HASIL'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : v === 'BELUM BAIK' || v === 'TIDAK SESUAI' || v === 'TIDAK MEMENUHI SYARAT' || v === 'TIDAK'
      ? 'border-red-200 bg-red-50 text-red-700'
      : v === 'DIKIRIM' || v === 'DILAPORKAN'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-slate-200 bg-slate-100 text-slate-700'
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {value}
    </span>
  )
}

export function RatioBar({
  label,
  good,
  total,
  subRight,
  barCls = 'bg-emerald-600',
}: {
  label: string
  good: number
  total: number
  subRight?: string
  barCls?: string
}) {
  const pctVal = total > 0 ? Math.round((good * 100) / total) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-800">
          {nf(good)}/{nf(total)} ({pctVal}%){subRight ? ` · ${subRight}` : ''}
        </span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={barCls} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  )
}

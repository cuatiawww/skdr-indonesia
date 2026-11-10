'use client'
// PR 042: shared building blocks for the Matriks Analisa tabs (panel, KPI tile, info tooltip, interpretation, export, heat colors).
import { useState, type ReactNode } from 'react'
import { Download, Info, Lightbulb, Loader2 } from 'lucide-react'
import { ErrorState, SkeletonChart, SkeletonKpiRow, SkeletonTable } from '@/components/ui/Skeleton'
import { downloadXlsx, type Sheet } from '@/lib/xlsx-lite'
import { nf, pf } from '@/lib/analisa-api'

export function InfoTip({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return null
  return (
    <span className={`group relative inline-flex align-middle ${className}`} tabIndex={0} aria-label={text}>
      <Info className="h-3.5 w-3.5 cursor-help text-slate-400 group-hover:text-primary" />
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] font-medium normal-case leading-snug tracking-normal text-slate-700 shadow-lg group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  )
}

export function Panel({ title, desc, tip, actions, children, className = '', testId }: { title: ReactNode; desc?: ReactNode; tip?: string; actions?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs ${className}`} data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">{title}<InfoTip text={tip} /></h3>
          {desc ? <p className="mt-0.5 text-xs text-slate-500">{desc}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function Interpretasi({ lines }: { lines?: (string | null | undefined)[] }) {
  const l = (lines || []).filter(Boolean) as string[]
  if (!l.length) return null
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900" data-testid="interpretasi">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div><span className="font-extrabold">Interpretasi: </span>{l.join(' ')}</div>
    </div>
  )
}

export function Note({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'red' }) {
  const c = tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-900' : tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-600'
  return <div className={`rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed ${c}`}>{children}</div>
}

export function Empty({ title = 'Tidak ada data untuk filter ini', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center" data-testid="empty-state">
      <div className="text-sm font-bold text-slate-700">{title}</div>
      {children ? <div className="mx-auto mt-1 max-w-xl text-xs text-slate-500">{children}</div> : null}
    </div>
  )
}

export function Kpi({ label, value, sub, delta, deltaLabel, tip, tone = 'teal', pct = false }: { label: string; value: number | null | undefined; sub?: ReactNode; delta?: number | null; deltaLabel?: string; tip?: string; tone?: 'teal' | 'red' | 'blue' | 'amber' | 'slate'; pct?: boolean }) {
  const bar = { teal: 'bg-teal-600', red: 'bg-red-600', blue: 'bg-blue-600', amber: 'bg-amber-500', slate: 'bg-slate-500' }[tone]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs" data-testid="kpi">
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <div className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">{label}<InfoTip text={tip} /></div>
      <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">{pct ? pf(value) : nf(value)}</div>
      {delta !== undefined ? (
        <div className={`mt-0.5 text-[11px] font-bold ${delta === null ? 'text-slate-400' : delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
          {delta === null ? 'pembanding belum ada data' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} {deltaLabel ? <span className="font-medium text-slate-500">{deltaLabel}</span> : null}
        </div>
      ) : null}
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  )
}

export function ExportButton({ filename, build, label = 'Ekspor Excel' }: { filename: string; build: () => Sheet[] | Promise<Sheet[]>; label?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} data-testid="export-xlsx"
      onClick={async () => { setBusy(true); try { downloadXlsx(filename, await build()) } finally { setBusy(false) } }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {label}
    </button>
  )
}

export function Loading({ kind = 'mixed' }: { kind?: 'mixed' | 'table' | 'chart' }) {
  if (kind === 'table') return <SkeletonTable rows={8} cols={6} />
  if (kind === 'chart') return <SkeletonChart height={240} />
  return <div className="space-y-4"><SkeletonKpiRow count={4} /><SkeletonChart height={220} /><SkeletonTable rows={6} cols={6} /></div>
}

export function State({ loading, error, reload, kind, children }: { loading: boolean; error: string | null; reload: () => void; kind?: 'mixed' | 'table' | 'chart'; children: ReactNode }) {
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading) return <Loading kind={kind} />
  return <>{children}</>
}

/** Sequential teal heat color for a value relative to the max (0 = white). */
export function heat(v: number, max: number) {
  if (!v || max <= 0) return { background: 'transparent', color: '#94a3b8' }
  const t = Math.min(1, Math.sqrt(v / max))
  const l = 97 - t * 62
  return { background: `hsl(174 62% ${l}%)`, color: l < 55 ? '#fff' : '#0f172a' }
}

/** Kinerja color class: hijau ≥ hijau, kuning ≥ kuning, merah below. */
export function kinerjaTone(v: number | null | undefined, ambang: { hijau?: number; kuning?: number } = {}) {
  const h = ambang.hijau ?? 80, k = ambang.kuning ?? 60
  if (v === null || v === undefined) return { cls: 'bg-slate-100 text-slate-500', label: 'Tidak ada data', color: '#94a3b8' }
  if (v >= h) return { cls: 'bg-emerald-100 text-emerald-800', label: `Baik (≥ ${h}%)`, color: '#059669' }
  if (v >= k) return { cls: 'bg-amber-100 text-amber-800', label: `Perlu perhatian (${k}–${h - 0.1}%)`, color: '#d97706' }
  return { cls: 'bg-red-100 text-red-800', label: `Rendah (< ${k}%)`, color: '#dc2626' }
}

export function Pct({ v, ambang }: { v: number | null | undefined; ambang?: { hijau?: number; kuning?: number } }) {
  const t = kinerjaTone(v, ambang)
  return <span className={`inline-block min-w-[3.5rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-extrabold tabular-nums ${t.cls}`}>{pf(v)}</span>
}

export function Seg<T extends string>({ value, onChange, options, testId }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[]; testId?: string }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${value === o.value ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{o.label}</button>
      ))}
    </div>
  )
}

export const COLORS = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#db2777', '#475569', '#ea580c', '#0d9488', '#4f46e5']

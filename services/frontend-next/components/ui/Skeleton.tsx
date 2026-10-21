'use client'
// PR 016: shared loading skeletons (Kemenkes palette, shimmer) + honest error state with retry.
// Every widget renders a skeleton shaped like itself instead of a spinner / "Memuat..." text.
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`skdr-skeleton rounded-md ${className}`} style={style} />
}

function Frame({ children, className = '', testId = 'skeleton' }: { children: React.ReactNode; className?: string; testId?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" aria-label={t('skdr.state.loading')} data-testid={testId} className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs ${className}`}>
      {children}
      <span className="sr-only">{t('skdr.state.loading')}</span>
    </div>
  )
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Frame key={i} testId="skeleton-kpi" className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex items-end justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-16" /></div>
          <div className="flex items-end justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-12" /></div>
        </Frame>
      ))}
    </div>
  )
}

const BARS = [38, 52, 44, 61, 70, 58, 76, 66, 84, 72, 63, 80, 90, 74, 68, 55, 62, 48, 57, 66, 71, 60, 52, 45]
export function SkeletonChart({ height = 260 }: { height?: number }) {
  return (
    <Frame testId="skeleton-chart">
      <div className="mb-4 flex items-center justify-between"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-28" /></div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {BARS.map((h, i) => <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />)}
      </div>
    </Frame>
  )
}

export function SkeletonMap({ height = 520 }: { height?: number }) {
  return (
    <Frame testId="skeleton-map" className="relative overflow-hidden p-0">
      <Skeleton className="w-full rounded-none" style={{ height }} />
      <div className="absolute bottom-4 left-4 w-48 space-y-2 rounded-xl bg-white/80 p-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-36" /><Skeleton className="h-3 w-28" /></div>
    </Frame>
  )
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Frame testId="skeleton-table" className="space-y-3">
      <div className="flex gap-4 border-b border-slate-100 pb-3">{Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-40' : 'w-20'}`} />)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-40' : i === 1 ? 'w-24' : 'w-16'}`} />)}
        </div>
      ))}
    </Frame>
  )
}

export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Frame key={i} testId="skeleton-card" className="space-y-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /><Skeleton className="h-10 w-full" /></Frame>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="skeleton-dashboard">
      <div className="flex items-center justify-between"><Skeleton className="h-7 w-64" /><Skeleton className="h-9 w-72 rounded-full" /></div>
      <SkeletonKpiRow />
      <SkeletonMap />
      <SkeletonChart />
      <SkeletonTable />
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="w-full space-y-8 px-4 py-6 sm:px-6 lg:px-8" data-testid="skeleton-detail">
      <div className="space-y-3"><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-80" /><Skeleton className="h-4 w-96" /></div>
      <div className="grid gap-6 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-4/6" /></div>)}</div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2"><SkeletonTable rows={3} cols={2} /><SkeletonTable rows={3} cols={2} /></div>
      <SkeletonChart />
      <SkeletonMap height={420} />
    </div>
  )
}

export function ErrorState({ message, onRetry, className = '' }: { message?: string; onRetry?: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="alert" data-testid="error-state" className={`flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 ${className}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{t('skdr.state.error')}{message ? `: ${message}` : ''}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} data-testid="retry" className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100">
          <RefreshCw className="h-3.5 w-3.5" /> {t('skdr.state.retry')}
        </button>
      ) : null}
    </div>
  )
}

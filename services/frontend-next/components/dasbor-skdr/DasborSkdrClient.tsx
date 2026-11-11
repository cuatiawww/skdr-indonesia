'use client'
// PR 057: Unified Orchestrator Client for Dasbor SKDR Terpadu
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Award,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import SkdrFilterPanel from '@/components/dasbor-skdr/SkdrFilterPanel'
import SkdrRingkasanView from '@/components/dasbor-skdr/SkdrRingkasanView'
import SkdrTrenView from '@/components/dasbor-skdr/SkdrTrenView'
import SkdrDistribusiView from '@/components/dasbor-skdr/SkdrDistribusiView'
import Skdr717View from '@/components/dasbor-skdr/Skdr717View'
import SkdrDeteksiView from '@/components/dasbor-skdr/SkdrDeteksiView'
import SkdrBuletinView from '@/components/dasbor-skdr/SkdrBuletinView'
import {
  activeFilterCount,
  defaultSkdrFilter,
  readSkdrFilter,
  skdrHref,
  SKDR_PAGES,
  writeSkdrFilter,
  type SkdrFilter,
  type SkdrTab,
} from '@/lib/dasbor-skdr-filter'

const PANEL_KEY = 'skdr-dasbor-filter-panel-open'

export default function DasborSkdrClient({ page: tab }: { page: SkdrTab }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [f, setF] = useState<SkdrFilter>(defaultSkdrFilter())
  const [ready, setReady] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)

  // Initialize from URL search params & localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      setF(readSkdrFilter(sp))
      const savedPanel = window.localStorage.getItem(PANEL_KEY)
      if (savedPanel !== null) {
        setPanelOpen(savedPanel === '1')
      }
      setReady(true)
    }
  }, [])

  // Sync filter changes into URL search params
  const updateFilter = useCallback(
    (patch: Partial<SkdrFilter>) => {
      setF((prev) => {
        const next = { ...prev, ...patch }
        if (typeof window !== 'undefined') {
          const qs = writeSkdrFilter(next)
          const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
          window.history.replaceState(null, '', newUrl)
        }
        return next
      })
    },
    []
  )

  const togglePanel = () => {
    setPanelOpen((cur) => {
      const next = !cur
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PANEL_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  const meta = SKDR_PAGES.find((p) => p.key === tab) || SKDR_PAGES[0]
  const count = activeFilterCount(f, tab)

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8" data-testid="dasbor-skdr-root">
      {/* Page Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider text-primary">
            {meta.eyebrow}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            {meta.title}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-4xl">{meta.desc}</p>
        </div>

        {/* Filter Toggle Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePanel}
            className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition shadow-xs ${
              panelOpen
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {panelOpen ? (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Sembunyikan Filter</span>
              </>
            ) : (
              <>
                <PanelLeftOpen className="h-4 w-4" />
                <span>Buka Filter</span>
                {count > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] text-white">
                    {count}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Secondary Quick Navigation Pills (1-Click Switcher between the 6 sub-dashboards) */}
      <div className="border-b border-slate-200 pb-3">
        <nav
          className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1"
          aria-label="Sub-dasbor SKDR"
        >
          {SKDR_PAGES.map((item) => {
            const Icon = item.icon
            const isActive = item.key === tab
            return (
              <Link
                key={item.key}
                href={skdrHref(item.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Main Layout: Dynamic Sidebar Filter Panel + View Content */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left Filter Panel (Collapsible) */}
        {panelOpen && (
          <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[280px]">
            <SkdrFilterPanel
              f={f}
              set={updateFilter}
              tab={tab}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}

        {/* Right Active View Content */}
        <div className="min-w-0 flex-1">
          {tab === 'ringkasan' && <SkdrRingkasanView f={f} />}
          {tab === 'tren' && <SkdrTrenView f={f} />}
          {tab === 'distribusi' && <SkdrDistribusiView f={f} />}
          {tab === '717' && <Skdr717View f={f} />}
          {tab === 'deteksi' && <SkdrDeteksiView f={f} />}
          {tab === 'buletin' && <SkdrBuletinView f={f} />}
        </div>
      </div>
    </div>
  )
}

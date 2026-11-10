'use client'
// PR 035: Dasbor SKDR EBS & IBS — satu halaman dengan 2 pagination:
// Halaman 1 = Dasbor EBS (Transaksi Form Laporan EBS)
// Halaman 2 = Dasbor IBS (Transaksi Entri Data Agregat & Form Individu IBS)
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, FileSpreadsheet, Radio } from 'lucide-react'
import EbsDashboardView from '@/components/dasbor-ebs-ibs/EbsDashboardView'
import IbsDashboardView from '@/components/dasbor-ebs-ibs/IbsDashboardView'

type DashTab = 'ebs' | 'ibs'

function PaginationBar({
  tab,
  setTab,
  ebsCount,
  ibsCount,
}: {
  tab: DashTab
  setTab: (t: DashTab) => void
  ebsCount: number | null
  ibsCount: number | null
}) {
  const pageNum = tab === 'ebs' ? 1 : 2
  const nf = (n: number | null) => (n === null ? null : new Intl.NumberFormat('id-ID').format(n))

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="ebs-ibs-pagination"
    >
      {/* Tab-style page buttons */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Pagination Dasbor EBS & IBS">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ebs'}
          onClick={() => setTab('ebs')}
          data-testid="page-tab-ebs"
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
            tab === 'ebs'
              ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black ${tab === 'ebs' ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
            1
          </span>
          <Radio className="h-3.5 w-3.5" />
          <span>Dasbor EBS</span>
          {nf(ebsCount) !== null ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tab === 'ebs' ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-800'}`}>
              {nf(ebsCount)}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ibs'}
          onClick={() => setTab('ibs')}
          data-testid="page-tab-ibs"
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
            tab === 'ibs'
              ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black ${tab === 'ibs' ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
            2
          </span>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>Dasbor IBS</span>
          {nf(ibsCount) !== null ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tab === 'ibs' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-800'}`}>
              {nf(ibsCount)}
            </span>
          ) : null}
        </button>
      </div>

      {/* Prev / Next pagination controls */}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={tab === 'ebs'}
          onClick={() => setTab('ebs')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
        </button>
        <span className="px-2 font-bold text-slate-600 tabular-nums">
          Halaman {pageNum} dari 2
        </span>
        <button
          type="button"
          disabled={tab === 'ibs'}
          onClick={() => setTab('ibs')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Berikutnya <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function DasborEbsIbsClient() {
  const [tab, setTabState] = useState<DashTab>('ebs')
  const [ebsCount, setEbsCount] = useState<number | null>(null)
  const [ibsCount, setIbsCount] = useState<number | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab')
    if (p === 'ibs') setTabState('ibs')
  }, [])

  const setTab = (next: DashTab) => {
    setTabState(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', next)
      window.history.replaceState({}, '', url.toString())
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 pb-8 sm:px-6 lg:px-8" data-testid="dasbor-ebs-ibs-page">
      {/* Page Title */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
            Dasbor Transaksi SKDR
          </div>
          <h2 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
            Dasbor SKDR EBS &amp; IBS
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Visualisasi langsung dari Transaksi Form Laporan EBS, Entri Data Agregat (IBS), dan Form Individu (IBS) — tanpa data dummy atau fallback.
          </p>
        </div>
      </div>

      {/* Top Pagination Switcher (Page 1: EBS, Page 2: IBS) */}
      <PaginationBar tab={tab} setTab={setTab} ebsCount={ebsCount} ibsCount={ibsCount} />

      {/* Active Page Content */}
      {tab === 'ebs' ? (
        <EbsDashboardView onCount={setEbsCount} />
      ) : (
        <IbsDashboardView onCount={setIbsCount} />
      )}

      {/* Bottom Pagination Switcher */}
      <PaginationBar tab={tab} setTab={setTab} ebsCount={ebsCount} ibsCount={ibsCount} />
    </div>
  )
}


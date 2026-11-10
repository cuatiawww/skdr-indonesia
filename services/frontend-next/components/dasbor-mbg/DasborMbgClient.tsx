'use client'
// PR 036: Dasbor MBG — satu halaman dengan 2 pagination:
// Halaman 1 = Pengawasan Gizi MBG (`mbg_kunjungan` & `mbg_form` Form 1–13)
// Halaman 2 = Keracunan Pangan MBG (`mbg_keracunan` & `mbg_keracunan_update`)
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, Utensils } from 'lucide-react'
import GiziDashboardView from '@/components/dasbor-mbg/GiziDashboardView'
import KeracunanDashboardView from '@/components/dasbor-mbg/KeracunanDashboardView'

type MbgTab = 'gizi' | 'keracunan'

function MbgPaginationBar({
  tab,
  setTab,
  giziCount,
  keracunanCount,
}: {
  tab: MbgTab
  setTab: (t: MbgTab) => void
  giziCount: number | null
  keracunanCount: number | null
}) {
  const pageNum = tab === 'gizi' ? 1 : 2
  const nf = (n: number | null) => (n === null ? null : new Intl.NumberFormat('id-ID').format(n))

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="mbg-pagination"
    >
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Pagination Dasbor MBG">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gizi'}
          onClick={() => setTab('gizi')}
          data-testid="page-tab-gizi"
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
            tab === 'gizi'
              ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black ${tab === 'gizi' ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
            1
          </span>
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span>Pengawasan Gizi MBG</span>
          {nf(giziCount) !== null ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tab === 'gizi' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-800'}`}>
              {nf(giziCount)}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'keracunan'}
          onClick={() => setTab('keracunan')}
          data-testid="page-tab-keracunan"
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
            tab === 'keracunan'
              ? 'border-red-700 bg-red-700 text-white shadow-sm'
              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black ${tab === 'keracunan' ? 'bg-white/20 text-white' : 'bg-white text-slate-600'}`}>
            2
          </span>
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Keracunan Pangan MBG</span>
          {nf(keracunanCount) !== null ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tab === 'keracunan' ? 'bg-white/20 text-white' : 'bg-red-50 text-red-800'}`}>
              {nf(keracunanCount)}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={tab === 'gizi'}
          onClick={() => setTab('gizi')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
        </button>
        <span className="px-2 font-bold text-slate-600 tabular-nums">
          Halaman {pageNum} dari 2
        </span>
        <button
          type="button"
          disabled={tab === 'keracunan'}
          onClick={() => setTab('keracunan')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Berikutnya <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function DasborMbgClient() {
  const [tab, setTabState] = useState<MbgTab>('gizi')
  const [giziCount, setGiziCount] = useState<number | null>(null)
  const [keracunanCount, setKeracunanCount] = useState<number | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab')
    if (p === 'keracunan') setTabState('keracunan')
  }, [])

  const setTab = (next: MbgTab) => {
    setTabState(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', next)
      window.history.replaceState({}, '', url.toString())
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 pb-8 sm:px-6 lg:px-8" data-testid="dasbor-mbg-page">
      {/* Header & Quick Form Links */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">
            <Utensils className="h-3.5 w-3.5" />
            <span>Dasbor Program MBG</span>
          </div>
          <h2 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">
            Dasbor MBG (Makan Bergizi Gratis)
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Visualisasi langsung dari Transaksi Form Pengawasan Gizi MBG (Formulir 1–13) dan Transaksi Form Keracunan Pangan MBG — tanpa data dummy atau fallback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/pengawasan-gizi"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <span>Buka Transaksi Pengawasan Gizi</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/keracunan-mbg"
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100"
          >
            <span>Buka Transaksi Keracunan Pangan</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Top Pagination */}
      <MbgPaginationBar tab={tab} setTab={setTab} giziCount={giziCount} keracunanCount={keracunanCount} />

      {/* Active Page View */}
      {tab === 'gizi' ? (
        <GiziDashboardView onCount={setGiziCount} />
      ) : (
        <KeracunanDashboardView onCount={setKeracunanCount} />
      )}

      {/* Bottom Pagination */}
      <MbgPaginationBar tab={tab} setTab={setTab} giziCount={giziCount} keracunanCount={keracunanCount} />
    </div>
  )
}

'use client'
// PR 042: Matriks Analisa (Dasbor Limited) - one page, one filter bar, 6 tabs, for Laporan EBS / Laporan Agregat IBS /
// Laporan Individu IBS. Filters and the active tab live in the URL so every view can be shared/bookmarked.
import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, BarChart3, ClipboardCheck, Grid3x3, Users } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { readFilter, writeFilter, useAnalisa, defaultFilter, type AFilter, type TabKey } from '@/lib/analisa-api'
import FilterBar, { scopeFilter } from './FilterBar'
import { Note } from './ui'
import TabRingkasan from './TabRingkasan'
import TabMatriks from './TabMatriks'
import TabMorbiditas from './TabMorbiditas'
import TabKinerja from './TabKinerja'
import TabSinyal from './TabSinyal'
import TabProfil from './TabProfil'

const TABS: { key: TabKey; label: string; icon: any; desc: string }[] = [
  { key: 'ringkasan', label: 'Ringkasan & Tren', icon: Activity, desc: 'KPI, tren mingguan vs tahun lalu, ambang, penyakit & wilayah teratas' },
  { key: 'matriks', label: 'Matriks & Laporan', icon: Grid3x3, desc: 'Matriks penyakit × wilayah (drilldown) + semua jenis laporan, grafik & diagram' },
  { key: 'morbiditas', label: 'Morbiditas', icon: BarChart3, desc: 'Proporsi kasus terhadap kunjungan, porsi kasus, CFR' },
  { key: 'kinerja', label: 'Kinerja Pelaporan', icon: ClipboardCheck, desc: 'Kelengkapan & ketepatan IBS, cakupan & 7-1-7 EBS' },
  { key: 'sinyal', label: 'Alert & Sinyal', icon: AlertTriangle, desc: 'Alert IBS, kualitas sinyal EBS, konversi KLB, hotspot, daftar' },
  { key: 'profil', label: 'Profil Kasus', icon: Users, desc: 'Kelompok umur, jenis kelamin, kematian & CFR' },
]

export default function MatriksAnalisaClient() {
  const [f, setF] = useState<AFilter>(defaultFilter())
  const [tab, setTab] = useState<TabKey>('ringkasan')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setF(readFilter(sp))
    const t = sp.get('tab') as TabKey | null
    if (t && TABS.some((x) => x.key === t)) setTab(t)
    setReady(true)
  }, [])
  const sync = useCallback((nf: AFilter, nt: TabKey, extra?: Record<string, string | null>) => {
    const url = new URL(window.location.href)
    writeFilter(url, nf)
    url.searchParams.set('tab', nt)
    if (extra) for (const [k, v] of Object.entries(extra)) { if (v === null) url.searchParams.delete(k); else url.searchParams.set(k, v) }
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
  const set = useCallback((p: Partial<AFilter>) => setF((old) => { const n = { ...old, ...p }; sync(n, tab); return n }), [sync, tab])
  const go = (t: TabKey) => { setTab(t); sync(f, t) }
  const sf = scopeFilter(f, tab)
  const opsi = useAnalisa('opsi', { ...sf, penyakit: [] }, {}, ready)
  const rd = opsi.data?.rentang_data
  const srcRange = f.sumber === 'ebs' ? rd?.ebs : f.sumber === 'ibs' ? rd?.ibs : null
  const outOfRange = srcRange?.akhir && opsi.data?.meta?.mulai && opsi.data.meta.mulai > srcRange.akhir
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-10 sm:px-6 lg:px-8" data-testid="matriks-analisa-page">
      <PageHeader eyebrow="Dasbor Limited" title="Matriks Analisa"
        subtitle="Analisa SKDR IBS & EBS dalam satu halaman: tren minggu epid, matriks penyakit × wilayah, morbiditas, kinerja pelaporan, alert & sinyal, serta profil kasus. Sumber: Laporan EBS, Laporan Agregat IBS, dan Laporan Individu IBS." />
      <FilterBar f={f} set={set} tab={tab} opsi={opsi.data} opsiLoading={opsi.loading} />
      {rd ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500" data-testid="rentang-data">
          <span>Data Laporan EBS: <b className="text-slate-700">{rd.ebs?.mulai_label || '–'} s.d. {rd.ebs?.akhir_label || '–'}</b></span>
          <span>Data Laporan Agregat IBS: <b className="text-slate-700">{rd.ibs?.mulai_label || '–'} s.d. {rd.ibs?.akhir_label || '–'}</b></span>
          <span>Laporan Individu IBS: <b className="text-slate-700">{Number(opsi.data?.cakupan?.ibs?.individu || 0).toLocaleString('id-ID')}</b></span>
        </div>
      ) : null}
      {outOfRange ? <Note tone="red">Periode terpilih berada di luar rentang data {f.sumber === 'ebs' ? 'Laporan EBS' : 'Laporan Agregat IBS'} (data terakhir {srcRange.akhir_label}). Ubah rentang minggu epid.</Note> : null}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xs" role="tablist" aria-label="Tab Matriks Analisa">
        {TABS.map((t) => {
          const I = t.icon
          const on = t.key === tab
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => go(t.key)} title={t.desc} data-testid={`tab-${t.key}`}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${on ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <I className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>
      {ready ? (
        <div role="tabpanel" data-testid={`panel-${tab}`}>
          {tab === 'ringkasan' ? <TabRingkasan f={sf} set={set} /> : null}
          {tab === 'matriks' ? <TabMatriks f={sf} set={set} sync={(extra) => sync(f, tab, extra)} potensial={opsi.data?.potensial_wabah} /> : null}
          {tab === 'morbiditas' ? <TabMorbiditas f={sf} set={set} /> : null}
          {tab === 'kinerja' ? <TabKinerja f={sf} set={set} /> : null}
          {tab === 'sinyal' ? <TabSinyal f={sf} set={set} /> : null}
          {tab === 'profil' ? <TabProfil f={sf} set={set} cakupan={opsi.data?.cakupan} /> : null}
        </div>
      ) : null}
    </div>
  )
}

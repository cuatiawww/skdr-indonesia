'use client'
// Dasbor MBG — 3 sub-menu di bawah "Dasbor MBG" pada sidebar DASBOR (tanpa tab bar di dalam halaman):
// 1. Ringkasan Eksekutif (/dashboard/mbg/ringkasan)
// 2. Keracunan Pangan (/dashboard/mbg/keracunan)
// 3. Pengawasan Gizi (/dashboard/mbg/pengawasan)
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCheck, ExternalLink, LayoutDashboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { ExportButton } from '@/components/analisa/ui'
import GiziDashboardView, { temuanLabel } from '@/components/dasbor-mbg/GiziDashboardView'
import KeracunanDashboardView from '@/components/dasbor-mbg/KeracunanDashboardView'
import MbgFilterPanel from '@/components/dasbor-mbg/MbgFilterPanel'
import MbgMapSection from '@/components/dasbor-mbg/MbgSections'
import MbgRingkasan, { pencegahanRows, RISIKO_LABEL, riskRows } from '@/components/dasbor-mbg/MbgRingkasan'
import { fetchGiziDash, fetchKeracunanDash, type GiziDashData, type KeracunanDashData } from '@/lib/dasbor-mbg-api'
import {
  activeMbgCount,
  aggregateSeries,
  defaultMbgFilter,
  giziParams,
  GRAN_OPTS,
  keracunanParams,
  readMbgFilter,
  wilson,
  writeMbgFilter,
  type MapState,
  type MbgFilter,
  type MbgTab,
} from '@/lib/dasbor-mbg-filter'
import type { Sheet } from '@/lib/xlsx-lite'

export const MBG_PAGES: { key: MbgTab; slug: string; label: string; icon: any; desc: string }[] = [
  {
    key: 'ringkasan',
    slug: 'ringkasan',
    label: 'Ringkasan Eksekutif',
    icon: LayoutDashboard,
    desc: 'Sintesis eksekutif pimpinan, identifikasi masalah, rekomendasi pengerahan sumber daya, korelasi risiko pengawasan × kejadian, dan peta komparasi spasial',
  },
  {
    key: 'keracunan',
    slug: 'keracunan',
    label: 'Keracunan Pangan',
    icon: AlertTriangle,
    desc: 'Analisa epidemiologi KLB keracunan pangan: beban kasus & CFR, peta geospasial KLB, kurva epidemi, respons ≤24 jam, etiologi lab & lingkungan dapur',
  },
  {
    key: 'gizi',
    slug: 'pengawasan',
    label: 'Pengawasan Gizi',
    icon: ClipboardCheck,
    desc: 'Analisa kepatuhan standar gizi & audit SPPG (Formulir 1–13): cakupan, peta skor wilayah, matriks SPPG × formulir, akar masalah & prioritas pembinaan',
  },
]

export const mbgHref = (t: MbgTab) => `/dashboard/mbg/${MBG_PAGES.find((x) => x.key === t)?.slug || 'ringkasan'}`
const FILTER_KEY = 'skdr-dasbor-mbg-filter'
const PANEL_KEY = 'skdr-dasbor-mbg-filter-panel'
const PROV_MAP: MapState = { level: 'prov', parent: null }

function useDash<T>(fetcher: (p: any) => Promise<T>, params: any, ready: boolean) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  const key = JSON.stringify(params)
  useEffect(() => {
    if (!ready) return
    const my = ++seq.current
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      fetcher(JSON.parse(key))
        .then((d) => {
          if (my === seq.current) setData(d)
        })
        .catch((e) => {
          if (my === seq.current) setError(e?.message || 'Gagal memuat data dasbor')
        })
        .finally(() => {
          if (my === seq.current) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [key, ready, tick, fetcher])
  return { data, loading, error, reload: () => setTick((x) => x + 1) }
}

const HEADER_META: Record<MbgTab, { eyebrow: string; title: string; subtitle: string }> = {
  ringkasan: {
    eyebrow: 'Dasbor MBG · Ringkasan Eksekutif',
    title: 'Kajian Eksekutif & Matriks Risiko Program MBG',
    subtitle:
      'Sintesis komando pimpinan: identifikasi permasalahan utama, rekomendasi pengerahan sumber daya (TGC, Labkesda, Dinkes, TPG Puskesmas), korelasi pengawasan gizi × insiden keracunan, dan komparasi geospasial.',
  },
  keracunan: {
    eyebrow: 'Dasbor MBG · Surveilans Kejadian Luar Biasa',
    title: 'Analisa Epidemiologi & Respons KLB Keracunan Pangan',
    subtitle:
      'Evaluasi beban kasus, fatalitas (CFR IK 95% Wilson), distribusi geospasial KLB, kurva epidemi, kecepatan pelaporan ≤24 jam, konfirmasi laboratorium, serta investigasi higiene sanitasi dapur SPPG.',
  },
  gizi: {
    eyebrow: 'Dasbor MBG · Audit Standar & Pencegahan',
    title: 'Analisa Pengawasan Standar Gizi & Kepatuhan SPPG (F1–F13)',
    subtitle:
      'Evaluasi cakupan audit SPPG, capaian skor penerapan SOP rantai pasok pangan (Formulir 1–13), identifikasi aspek operasional terlemah, analisis ketenagaan, serta daftar prioritas pembinaan SPPG.',
  },
}

export default function DasborMbgClient({ page: tab }: { page: MbgTab }) {
  const router = useRouter()
  const [f, setF] = useState<MbgFilter>(defaultMbgFilter())
  const [qs, setQs] = useState('')
  const [ready, setReady] = useState(false)
  const [kMap, setKMap] = useState<MapState>(PROV_MAP)
  const [gMap, setGMap] = useState<MapState>(PROV_MAP)
  const [panel, setPanel] = useState(true)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      setWide(mq.matches)
      if (!mq.matches) setPanel(false)
      else {
        try {
          setPanel(localStorage.getItem(PANEL_KEY) !== '0')
        } catch {
          setPanel(true)
        }
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const togglePanel = (open: boolean) => {
    setPanel(open)
    if (wide) {
      try {
        localStorage.setItem(PANEL_KEY, open ? '1' : '0')
      } catch {}
    }
  }

  useEffect(() => {
    let sp = new URLSearchParams(window.location.search)
    if (![...sp.keys()].length) {
      try {
        const saved = sessionStorage.getItem(FILTER_KEY)
        if (saved) {
          sp = new URLSearchParams(saved)
          const url = new URL(window.location.href)
          writeMbgFilter(url, readMbgFilter(sp))
          window.history.replaceState(window.history.state, '', url.toString())
        }
      } catch {}
    }
    const nf0 = readMbgFilter(sp)
    setF(nf0)
    const u = new URL('http://x/')
    writeMbgFilter(u, nf0)
    setQs(u.search)
    setReady(true)
  }, [])

  const sync = useCallback((nf: MbgFilter) => {
    const url = new URL(window.location.href)
    writeMbgFilter(url, nf)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', url.toString())
    const u = new URL('http://x/')
    writeMbgFilter(u, nf)
    setQs(u.search)
    try {
      sessionStorage.setItem(FILTER_KEY, u.search.replace(/^\?/, ''))
    } catch {}
  }, [])

  const set = useCallback(
    (p: Partial<MbgFilter>) => {
      setF((old) => {
        const n = { ...old, ...p }
        sync(n)
        return n
      })
      if (p.prov || p.kab) {
        setKMap(PROV_MAP)
        setGMap(PROV_MAP)
      }
    },
    [sync],
  )

  const go = (t: MbgTab) => {
    router.push(`${mbgHref(t)}${qs}`)
  }

  const ker = useDash<KeracunanDashData>(fetchKeracunanDash, keracunanParams(f, kMap), ready)
  const gizi = useDash<GiziDashData>(fetchGiziDash, giziParams(f, gMap), ready)

  const nAktif = activeMbgCount(f, tab)
  const toggleBtn = (
    <button
      type="button"
      onClick={() => togglePanel(!panel)}
      aria-expanded={panel}
      aria-controls="mbg-filter-panel"
      data-testid="toggle-filter"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
        panel
          ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          : 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800'
      }`}
    >
      {panel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      {panel ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
      {nAktif ? (
        <span className={`rounded-full px-1.5 text-[10px] ${panel ? 'bg-primary text-white' : 'bg-white text-teal-800'}`}>
          {nAktif}
        </span>
      ) : null}
    </button>
  )

  const actions = (
    <>
      <Link
        href="/keracunan-mbg"
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100"
      >
        Form Keracunan <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      <Link
        href="/pengawasan-gizi"
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
      >
        Form Pengawasan <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      <ExportButton
        filename={`dasbor-mbg-${new Date().toISOString().slice(0, 10)}.xlsx`}
        build={() => buildSheets(f, ker.data, gizi.data)}
      />
      {toggleBtn}
    </>
  )

  const filterPanel = (
    <MbgFilterPanel
      f={f}
      set={set}
      tab={tab}
      kerOpts={ker.data?.filter_options}
      giziOpts={gizi.data?.filter_options}
      onClose={() => togglePanel(false)}
    />
  )

  const kd = ker.data?.kpis
  const gd = gizi.data?.kpis
  const mapSection = <MbgMapSection ker={ker.data} gizi={gizi.data} kMap={kMap} setKMap={setKMap} gMap={gMap} setGMap={setGMap} />
  const periode = f.from || f.to ? `${f.from || 'awal'} s.d. ${f.to || 'sekarang'}` : 'Seluruh Periode Transaksi'
  const meta = HEADER_META[tab]

  return (
    <div className="w-full space-y-4 px-4 pb-10 sm:px-6 lg:px-8" data-testid="dasbor-mbg-page">
      <PageHeader eyebrow={meta.eyebrow} title={meta.title} subtitle={meta.subtitle} actions={actions} />

      <div className="flex items-start gap-4">
        {panel && wide ? (
          <aside
            id="mbg-filter-panel"
            className="sticky top-4 w-[280px] shrink-0 self-start"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
            data-testid="filter-panel"
          >
            {filterPanel}
          </aside>
        ) : null}
        {panel && !wide ? (
          <div
            className="fixed inset-0 z-50 flex"
            role="dialog"
            aria-modal="true"
            aria-label="Filter Dasbor MBG"
            data-testid="filter-drawer"
          >
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => togglePanel(false)} />
            <aside id="mbg-filter-panel" className="relative h-full w-[300px] max-w-[88vw] p-2">
              {filterPanel}
            </aside>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-4">
          {/* Baris Konteks Rentang Data Aktif (Tanpa Tab Bar di Dalam Halaman) */}
          <div
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] text-slate-500 shadow-2xs"
            data-testid="rentang-data"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Filter Periode: <b className="text-slate-800">{periode}</b>
              </span>
              <span>
                Rekaman KLB Keracunan:{' '}
                <b className="text-slate-800">{kd?.date_min ? `${kd.date_min} s.d. ${kd.date_max}` : '–'}</b>
              </span>
              <span>
                Rekaman Pengawasan Gizi:{' '}
                <b className="text-slate-800">{gd?.date_min ? `${gd.date_min} s.d. ${gd.date_max}` : '–'}</b>
              </span>
            </div>
            <span className="text-[10.5px] font-semibold text-teal-800">
              Navigasi Sub-Modul tersedia pada menu Dasbor MBG di Sidebar Kiri
            </span>
          </div>

          {ready ? (
            <div data-testid={`panel-${tab}`}>
              {tab === 'ringkasan' ? (
                ker.error || gizi.error ? (
                  <KeracunanDashboardView
                    data={null}
                    loading={false}
                    error={ker.error || gizi.error}
                    reload={() => {
                      ker.reload()
                      gizi.reload()
                    }}
                    f={f}
                    map={kMap}
                    setMap={setKMap}
                  />
                ) : (ker.loading && !ker.data) || (gizi.loading && !gizi.data) ? (
                  <KeracunanDashboardView
                    data={null}
                    loading
                    error={null}
                    reload={ker.reload}
                    f={f}
                    map={kMap}
                    setMap={setKMap}
                  />
                ) : (
                  <div className={ker.loading || gizi.loading ? 'opacity-60 transition' : 'transition'}>
                    <MbgRingkasan ker={ker.data} gizi={gizi.data} f={f} go={go} mapSection={mapSection} />
                  </div>
                )
              ) : null}

              {tab === 'keracunan' ? (
                <div className={ker.loading && ker.data ? 'opacity-60 transition' : 'transition'}>
                  <KeracunanDashboardView
                    data={ker.data}
                    loading={ker.loading}
                    error={ker.error}
                    reload={ker.reload}
                    f={f}
                    map={kMap}
                    setMap={setKMap}
                    gizi={gizi.data}
                    gMap={gMap}
                    setGMap={setGMap}
                  />
                </div>
              ) : null}

              {tab === 'gizi' ? (
                <div className={gizi.loading && gizi.data ? 'opacity-60 transition' : 'transition'}>
                  <GiziDashboardView
                    data={gizi.data}
                    loading={gizi.loading}
                    error={gizi.error}
                    reload={gizi.reload}
                    f={f}
                    map={gMap}
                    setMap={setGMap}
                    ker={ker.data}
                    kMap={kMap}
                    setKMap={setKMap}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Excel export of what the dashboard shows for the current filter (no PII). */
function buildSheets(f: MbgFilter, ker: KeracunanDashData | null, gizi: GiziDashData | null): Sheet[] {
  const k = ker?.kpis
  const g = gizi?.kpis
  const cfr = k ? wilson(k.total_meninggal, k.total_kasus) : null
  const filt = [
    ['Periode', f.from || f.to ? `${f.from || 'awal'} s.d. ${f.to || 'sekarang'}` : 'Seluruh periode'],
    ['Granularitas', GRAN_OPTS.find((x) => x.value === f.gran)?.label],
    ['Jenis analisa', f.jenis],
    ['Provinsi (id)', f.prov.join(', ') || 'Semua'],
    ['Kab/Kota (id)', f.kab.join(', ') || 'Semua'],
    ['Kecamatan', f.kec.join(', ') || 'Semua'],
    ['SPPG', f.sppg || 'Semua'],
    ['Sekolah', f.sekolah || '—'],
  ]
  const sheets: Sheet[] = [
    {
      name: 'Ringkasan',
      note: 'Dasbor MBG — sumber: transaksi Keracunan Pangan MBG & Pengawasan Gizi MBG',
      rows: [
        ['Filter', 'Nilai'],
        ...filt,
        [],
        ['Indikator', 'Nilai'],
        ['Kejadian keracunan', k?.total_kejadian],
        ['Kasus', k?.total_kasus],
        ['Rawat inap', k?.rawat_inap],
        ['Meninggal', k?.total_meninggal],
        ['CFR (%)', cfr?.p],
        ['CFR IK95% bawah (%)', cfr?.lo],
        ['CFR IK95% atas (%)', cfr?.hi],
        ['Attack rate (%)', k?.attack_rate_pct],
        ['Provinsi terdampak', k?.provinsi_unik],
        ['Kab/Kota terdampak', k?.kabkota_unik],
        ['SPPG terdampak', k?.sppg_unik],
        ['Lapor ≤ 24 jam (%)', ker?.ketepatan_lapor?.pct_le24],
        ['Median kejadian→lapor (jam)', ker?.ketepatan_lapor?.median_jam],
        ['Lab: ada hasil', k?.lab_hasil],
        ['Lab: dikirim', k?.lab_dikirim],
        ['Lab: belum', k?.lab_belum],
        ['IKL memenuhi syarat', ker?.lingkungan_sop.ikl.memenuhi],
        ['IKL tidak memenuhi', ker?.lingkungan_sop.ikl.tidak_memenuhi],
        ['SLHS ada', k?.slhs_ya],
        ['SLHS tidak ada', k?.slhs_tidak],
        ['Kunjungan pengawasan', g?.total_kunjungan],
        ['SPPG diawasi', g?.sppg_unik],
        ['Skor SOP rata-rata', g?.avg_skor_sop],
        ['F12 BAIK', g?.rekap12_baik],
        ['F12 BELUM BAIK', g?.rekap12_belum_baik],
        ['F13 BAIK', g?.rekap13_baik],
        ['F13 BELUM BAIK', g?.rekap13_belum_baik],
      ],
    },
  ]
  const curve = aggregateSeries(ker?.daily_series || [], f.gran, ['kejadian', 'kasus', 'meninggal', 'rawat_inap'])
  sheets.push({
    name: 'Kurva epidemi',
    rows: [['Periode', 'Kejadian', 'Kasus', 'Meninggal', 'Rawat inap'], ...curve.map((r) => [r.label, r.kejadian, r.kasus, r.meninggal, r.rawat_inap])],
  })
  for (const [lv, nm] of [
    ['provinsi', 'Wilayah provinsi'],
    ['kabkota', 'Wilayah kab-kota'],
    ['kecamatan', 'Wilayah kecamatan'],
  ] as const) {
    sheets.push({
      name: nm,
      rows: [
        ['Wilayah', 'Induk', 'Kejadian', 'Kasus', 'Meninggal', 'Terpapar', 'Rawat inap', 'CFR (%)', 'AR (%)'],
        ...(ker?.ranking?.[lv] || []).map((r) => [r.name, r.parent, r.kejadian, r.kasus, r.meninggal, r.terpapar, r.rawat_inap, r.cfr_pct, r.ar_pct]),
      ],
    })
  }
  sheets.push({
    name: 'Daftar kejadian',
    rows: [
      ['No. laporan', 'Tgl kejadian', 'Tgl lapor', 'Selang lapor (jam)', 'SPPG', 'Sekolah', 'Kecamatan', 'Kab/Kota', 'Provinsi', 'Terpapar', 'Kasus', 'Rawat inap', 'Meninggal', 'AR (%)', 'CFR (%)', 'Status lab', 'Status', 'IKL', 'SLHS'],
      ...(ker?.recent_incidents || []).map((r) => [
        r.no_laporan,
        r.tgl_kejadian,
        r.tgl_lapor,
        r.lapor_jam,
        r.nama_sppg,
        r.sekolah,
        r.kecamatan,
        r.kabkota_name,
        r.province_name,
        r.jumlah_terpapar,
        r.jumlah_kasus,
        r.rawat_inap,
        r.jumlah_meninggal,
        r.ar_pct,
        r.cfr_pct,
        r.lab_status,
        r.status,
        r.ikl,
        r.slhs,
      ]),
    ],
  })
  sheets.push({
    name: 'Gejala',
    rows: [['Gejala', 'Kejadian', 'Jumlah kasus', '% kasus'], ...(ker?.by_gejala || []).map((x) => [x.nama, x.kejadian, x.jumlah_kasus, x.pct_kasus])],
  })
  sheets.push({
    name: 'Pangan dicurigai',
    rows: [
      ['Jenis', 'Nama', 'Kategori/komponen', 'Positif', 'Diuji / kejadian', 'Kasus'],
      ...(ker?.pangan?.sampel_positif || []).map((x) => ['Sampel lab', x.nama, x.kategori, x.positif, x.diuji, null]),
      ...(ker?.pangan?.menu || []).map((x) => ['Menu tersaji', x.nama, x.komponen, null, x.kejadian, x.kasus]),
    ],
  })
  sheets.push({
    name: 'Tautan risiko SPPG',
    rows: [
      ['SPPG', 'Kab/Kota', 'Provinsi', 'Kategori risiko', 'Kejadian', 'Kasus', 'Meninggal', 'Kejadian terakhir', 'Kunjungan pengawasan', 'Skor SOP', 'F12 terakhir', 'F13 terakhir', 'Pengawasan terakhir'],
      ...riskRows(ker).map((s) => [
        s.nama_sppg,
        s.kabkota_name,
        s.province_name,
        RISIKO_LABEL[s.risiko],
        s.kejadian,
        s.kasus,
        s.meninggal,
        s.last_kejadian,
        s.pengawasan_kunjungan,
        s.pengawasan_avg_skor,
        s.pengawasan_rekap12,
        s.pengawasan_rekap13,
        s.pengawasan_terakhir,
      ]),
      [],
      ['Prioritas pencegahan (skor rendah tanpa kejadian)'],
      ...pencegahanRows(gizi, ker).map((s) => [
        s.nama_sppg,
        s.kabkota_name,
        s.province_name,
        'Skor rendah, belum ada kejadian',
        null,
        null,
        null,
        null,
        s.kunjungan,
        s.avg_skor,
        s.last_rekap12,
        s.last_rekap13,
        s.last_tanggal,
      ]),
    ],
  })
  sheets.push({
    name: 'Pengawasan per SPPG',
    rows: [
      ['SPPG', 'Puskesmas', 'Kab/Kota', 'Provinsi', 'Kunjungan', 'Kunjungan terakhir', 'F12 terakhir', 'F13 terakhir', 'Skor SOP rata-rata'],
      ...(gizi?.sppg_summary || []).map((s) => [s.nama_sppg, s.puskesmas, s.kabkota_name, s.province_name, s.kunjungan, s.last_tanggal, s.last_rekap12, s.last_rekap13, s.avg_skor]),
    ],
  })
  sheets.push({
    name: 'Formulir F1-F13',
    rows: [
      ['Formulir', 'Judul', 'Tersimpan', 'Dikirim', 'Sesuai/BAIK', 'Tidak Sesuai/BELUM BAIK', 'Skor rata-rata'],
      ...(gizi?.by_formulir || []).map((x) => [`F${x.form_no}`, x.title, x.tersimpan, x.dikirim, x.sesuai, x.tidak_sesuai, x.avg_skor]),
    ],
  })
  sheets.push({
    name: 'Temuan pengawasan',
    rows: [
      ['Formulir', 'Butir', 'Jumlah Tidak Sesuai', 'Formulir dikirim', '%'],
      ...(gizi?.temuan || []).map((t) => [`F${t.form_no}`, temuanLabel(t.form_no, t.kode, t.label), t.jumlah, t.dinilai, t.pct]),
    ],
  })
  return sheets
}

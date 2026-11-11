'use client'
// PR 036: Dasbor MBG — Pengawasan Gizi MBG (`mbg_kunjungan` & `mbg_form` Form 1–13) dan Keracunan Pangan MBG
// (`mbg_keracunan` & `mbg_keracunan_update`).
// PR 052: revamp — satu panel filter samping bersama (gaya Matriks Analisa: 280 px, sticky, buka/tutup diingat di
// localStorage, laci di layar sempit), 3 tab (Ringkasan · Keracunan Pangan · Pengawasan Gizi), filter & tab di URL,
// ekspor Excel. Mempertahankan seluruh panel PR 036 dan opsi panel "KERACUNAN MAKAN MBG" dasbor Kemkes.
// PR 052b: tab → rute /dashboard/mbg/{ringkasan,keracunan,pengawasan} (menu kategori sidebar); panel filter tetap di tiap
// halaman, filter dibawa lewat query string + sessionStorage; peta 2 kolom (Keracunan | Pengawasan) dalam satu bagian.
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
  activeMbgCount, aggregateSeries, defaultMbgFilter, giziParams, GRAN_OPTS, keracunanParams, readMbgFilter, wilson, writeMbgFilter,
  type MapState, type MbgFilter, type MbgTab,
} from '@/lib/dasbor-mbg-filter'
import type { Sheet } from '@/lib/xlsx-lite'

/** PR 052b: tiap halaman kini rute tersendiri (menu kategori "Dasbor MBG" di sidebar), bukan tab. Kunci internal `gizi` ↔ slug `pengawasan`. */
export const MBG_PAGES: { key: MbgTab; slug: string; label: string; icon: any; desc: string }[] = [
  { key: 'ringkasan', slug: 'ringkasan', label: 'Ringkasan & Tautan Risiko', icon: LayoutDashboard, desc: 'Kartu ringkas Kerpang & SLHS/IKL, peta 2 kolom, grafik wilayah, kurva epidemi, SPPG berisiko' },
  { key: 'keracunan', slug: 'keracunan', label: 'Keracunan Pangan', icon: AlertTriangle, desc: 'Angka utama, peta, kurva epidemi, wilayah terdampak, respons & penyebab, daftar kejadian' },
  { key: 'gizi', slug: 'pengawasan', label: 'Pengawasan Gizi', icon: ClipboardCheck, desc: 'Cakupan, sebaran skor, aspek lemah F1–F13, temuan, SPPG perlu tindak lanjut, tren' },
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
        .then((d) => { if (my === seq.current) setData(d) })
        .catch((e) => { if (my === seq.current) setError(e?.message || 'Gagal memuat data dasbor') })
        .finally(() => { if (my === seq.current) setLoading(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [key, ready, tick, fetcher])
  return { data, loading, error, reload: () => setTick((x) => x + 1) }
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
      else { try { setPanel(localStorage.getItem(PANEL_KEY) !== '0') } catch { setPanel(true) } }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const togglePanel = (open: boolean) => { setPanel(open); if (wide) { try { localStorage.setItem(PANEL_KEY, open ? '1' : '0') } catch {} } }
  useEffect(() => {
    // Filter dibaca dari URL; bila URL tanpa parameter filter (mis. dibuka dari menu sidebar), pakai filter terakhir di
    // sessionStorage agar filter tetap sama saat berpindah halaman Ringkasan/Keracunan/Pengawasan.
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
    const u = new URL('http://x/'); writeMbgFilter(u, nf0); setQs(u.search)
    setReady(true)
  }, [])
  const sync = useCallback((nf: MbgFilter) => {
    const url = new URL(window.location.href)
    writeMbgFilter(url, nf)
    url.searchParams.delete('tab')
    window.history.replaceState(window.history.state, '', url.toString())
    const u = new URL('http://x/'); writeMbgFilter(u, nf)
    setQs(u.search)
    try { sessionStorage.setItem(FILTER_KEY, u.search.replace(/^\?/, '')) } catch {}
  }, [])
  const set = useCallback((p: Partial<MbgFilter>) => {
    setF((old) => { const n = { ...old, ...p }; sync(n); return n })
    if (p.prov || p.kab) { setKMap(PROV_MAP); setGMap(PROV_MAP) }
  }, [sync])
  const go = (t: MbgTab) => { router.push(`${mbgHref(t)}${qs}`) }

  const ker = useDash<KeracunanDashData>(fetchKeracunanDash, keracunanParams(f, kMap), ready)
  const gizi = useDash<GiziDashData>(fetchGiziDash, giziParams(f, gMap), ready)

  const nAktif = activeMbgCount(f, tab)
  const toggleBtn = (
    <button type="button" onClick={() => togglePanel(!panel)} aria-expanded={panel} aria-controls="mbg-filter-panel" data-testid="toggle-filter"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${panel ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800'}`}>
      {panel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      {panel ? 'Sembunyikan filter' : 'Tampilkan filter'}
      {nAktif ? <span className={`rounded-full px-1.5 text-[10px] ${panel ? 'bg-primary text-white' : 'bg-white text-teal-800'}`}>{nAktif}</span> : null}
    </button>
  )
  const actions = (
    <>
      <Link href="/keracunan-mbg" className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100">Transaksi Keracunan <ExternalLink className="h-3.5 w-3.5" /></Link>
      <Link href="/pengawasan-gizi" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">Transaksi Pengawasan <ExternalLink className="h-3.5 w-3.5" /></Link>
      <ExportButton filename={`dasbor-mbg-${new Date().toISOString().slice(0, 10)}.xlsx`} build={() => buildSheets(f, ker.data, gizi.data)} />
      {toggleBtn}
    </>
  )
  const filterPanel = <MbgFilterPanel f={f} set={set} tab={tab} kerOpts={ker.data?.filter_options} giziOpts={gizi.data?.filter_options} onClose={() => togglePanel(false)} />
  const kd = ker.data?.kpis
  const mapSection = <MbgMapSection ker={ker.data} gizi={gizi.data} kMap={kMap} setKMap={setKMap} gMap={gMap} setGMap={setGMap} />
  const gd = gizi.data?.kpis
  const periode = f.from || f.to ? `${f.from || 'awal'} s.d. ${f.to || 'sekarang'}` : 'Seluruh periode'
  return (
    <div className="w-full space-y-4 px-4 pb-10 sm:px-6 lg:px-8" data-testid="dasbor-mbg-page">
      <PageHeader eyebrow="Dasbor MBG" title={tab === 'ringkasan' ? 'Dasbor MBG — Ringkasan' : tab === 'keracunan' ? 'Dasbor MBG — Keracunan Pangan' : 'Dasbor MBG — Pengawasan Gizi'} actions={actions}
        subtitle="Keracunan Pangan MBG (kejadian) dan Pengawasan Gizi MBG (pencegahan) dalam satu dasbor: kurva epidemi, wilayah, SPPG berisiko, temuan pengawasan. Data langsung dari transaksi form." />
      <div className="flex items-start gap-4">
        {panel && wide ? (
          <aside id="mbg-filter-panel" className="sticky top-4 w-[280px] shrink-0 self-start" style={{ maxHeight: 'calc(100vh - 2rem)' }} data-testid="filter-panel">{filterPanel}</aside>
        ) : null}
        {panel && !wide ? (
          <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Filter Dasbor MBG" data-testid="filter-drawer">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => togglePanel(false)} />
            <aside id="mbg-filter-panel" className="relative h-full w-[300px] max-w-[88vw] p-2">{filterPanel}</aside>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500" data-testid="rentang-data">
            <span>Periode: <b className="text-slate-700">{periode}</b></span>
            <span>Data Keracunan: <b className="text-slate-700">{kd?.date_min ? `${kd.date_min} s.d. ${kd.date_max}` : '–'}</b></span>
            <span>Data Pengawasan: <b className="text-slate-700">{gd?.date_min ? `${gd.date_min} s.d. ${gd.date_max}` : '–'}</b></span>
          </div>
          <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xs" aria-label="Halaman Dasbor MBG">
            {MBG_PAGES.map((t) => {
              const I = t.icon
              const on = t.key === tab
              const count = t.key === 'keracunan' ? kd?.total_kejadian : t.key === 'gizi' ? gd?.total_kunjungan : undefined
              return (
                <Link key={t.key} href={`${mbgHref(t.key)}${qs}`} aria-current={on ? 'page' : undefined} title={t.desc} data-testid={`page-tab-${t.key}`}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${on ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                  <I className="h-3.5 w-3.5" /> {t.label}
                  {count !== undefined ? <span className={`rounded-full px-1.5 py-px text-[10px] tabular-nums ${on ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{count.toLocaleString('id-ID')}</span> : null}
                </Link>
              )
            })}
          </nav>
          {ready ? (
            <div data-testid={`panel-${tab}`}>
              {tab === 'ringkasan' ? (
                ker.error || gizi.error ? <KeracunanDashboardView data={null} loading={false} error={ker.error || gizi.error} reload={() => { ker.reload(); gizi.reload() }} f={f} map={kMap} setMap={setKMap} />
                  : (ker.loading && !ker.data) || (gizi.loading && !gizi.data) ? <KeracunanDashboardView data={null} loading error={null} reload={ker.reload} f={f} map={kMap} setMap={setKMap} />
                  : <div className={ker.loading || gizi.loading ? 'opacity-60 transition' : 'transition'}><MbgRingkasan ker={ker.data} gizi={gizi.data} f={f} go={go} mapSection={mapSection} /></div>
              ) : null}
              {tab === 'keracunan' ? <div className={ker.loading && ker.data ? 'opacity-60 transition' : 'transition'}><KeracunanDashboardView data={ker.data} loading={ker.loading} error={ker.error} reload={ker.reload} f={f} map={kMap} setMap={setKMap} gizi={gizi.data} gMap={gMap} setGMap={setGMap} /></div> : null}
              {tab === 'gizi' ? <div className={gizi.loading && gizi.data ? 'opacity-60 transition' : 'transition'}><GiziDashboardView data={gizi.data} loading={gizi.loading} error={gizi.error} reload={gizi.reload} f={f} map={gMap} setMap={setGMap} ker={ker.data} kMap={kMap} setKMap={setKMap} /></div> : null}
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
    ['Granularitas', GRAN_OPTS.find((x) => x.value === f.gran)?.label], ['Jenis analisa', f.jenis],
    ['Provinsi (id)', f.prov.join(', ') || 'Semua'], ['Kab/Kota (id)', f.kab.join(', ') || 'Semua'], ['Kecamatan', f.kec.join(', ') || 'Semua'],
    ['SPPG', f.sppg || 'Semua'], ['Sekolah', f.sekolah || '—'],
  ]
  const sheets: Sheet[] = [{
    name: 'Ringkasan', note: 'Dasbor MBG — sumber: transaksi Keracunan Pangan MBG & Pengawasan Gizi MBG',
    rows: [['Filter', 'Nilai'], ...filt, [], ['Indikator', 'Nilai'],
      ['Kejadian keracunan', k?.total_kejadian], ['Kasus', k?.total_kasus], ['Rawat inap', k?.rawat_inap], ['Meninggal', k?.total_meninggal],
      ['CFR (%)', cfr?.p], ['CFR IK95% bawah (%)', cfr?.lo], ['CFR IK95% atas (%)', cfr?.hi], ['Attack rate (%)', k?.attack_rate_pct],
      ['Provinsi terdampak', k?.provinsi_unik], ['Kab/Kota terdampak', k?.kabkota_unik], ['SPPG terdampak', k?.sppg_unik],
      ['Lapor ≤ 24 jam (%)', ker?.ketepatan_lapor?.pct_le24], ['Median kejadian→lapor (jam)', ker?.ketepatan_lapor?.median_jam],
      ['Lab: ada hasil', k?.lab_hasil], ['Lab: dikirim', k?.lab_dikirim], ['Lab: belum', k?.lab_belum],
      ['IKL memenuhi syarat', ker?.lingkungan_sop.ikl.memenuhi], ['IKL tidak memenuhi', ker?.lingkungan_sop.ikl.tidak_memenuhi], ['SLHS ada', k?.slhs_ya], ['SLHS tidak ada', k?.slhs_tidak],
      ['Kunjungan pengawasan', g?.total_kunjungan], ['SPPG diawasi', g?.sppg_unik], ['Skor SOP rata-rata', g?.avg_skor_sop],
      ['F12 BAIK', g?.rekap12_baik], ['F12 BELUM BAIK', g?.rekap12_belum_baik], ['F13 BAIK', g?.rekap13_baik], ['F13 BELUM BAIK', g?.rekap13_belum_baik]],
  }]
  const curve = aggregateSeries(ker?.daily_series || [], f.gran, ['kejadian', 'kasus', 'meninggal', 'rawat_inap'])
  sheets.push({ name: 'Kurva epidemi', rows: [['Periode', 'Kejadian', 'Kasus', 'Meninggal', 'Rawat inap'], ...curve.map((r) => [r.label, r.kejadian, r.kasus, r.meninggal, r.rawat_inap])] })
  for (const [lv, nm] of [['provinsi', 'Wilayah provinsi'], ['kabkota', 'Wilayah kab-kota'], ['kecamatan', 'Wilayah kecamatan']] as const) {
    sheets.push({ name: nm, rows: [['Wilayah', 'Induk', 'Kejadian', 'Kasus', 'Meninggal', 'Terpapar', 'Rawat inap', 'CFR (%)', 'AR (%)'],
      ...(ker?.ranking?.[lv] || []).map((r) => [r.name, r.parent, r.kejadian, r.kasus, r.meninggal, r.terpapar, r.rawat_inap, r.cfr_pct, r.ar_pct])] })
  }
  sheets.push({ name: 'Daftar kejadian', rows: [['No. laporan', 'Tgl kejadian', 'Tgl lapor', 'Selang lapor (jam)', 'SPPG', 'Sekolah', 'Kecamatan', 'Kab/Kota', 'Provinsi', 'Terpapar', 'Kasus', 'Rawat inap', 'Meninggal', 'AR (%)', 'CFR (%)', 'Status lab', 'Status', 'IKL', 'SLHS'],
    ...(ker?.recent_incidents || []).map((r) => [r.no_laporan, r.tgl_kejadian, r.tgl_lapor, r.lapor_jam, r.nama_sppg, r.sekolah, r.kecamatan, r.kabkota_name, r.province_name, r.jumlah_terpapar, r.jumlah_kasus, r.rawat_inap, r.jumlah_meninggal, r.ar_pct, r.cfr_pct, r.lab_status, r.status, r.ikl, r.slhs])] })
  sheets.push({ name: 'Gejala', rows: [['Gejala', 'Kejadian', 'Jumlah kasus', '% kasus'], ...(ker?.by_gejala || []).map((x) => [x.nama, x.kejadian, x.jumlah_kasus, x.pct_kasus])] })
  sheets.push({ name: 'Pangan dicurigai', rows: [['Jenis', 'Nama', 'Kategori/komponen', 'Positif', 'Diuji / kejadian', 'Kasus'],
    ...(ker?.pangan?.sampel_positif || []).map((x) => ['Sampel lab', x.nama, x.kategori, x.positif, x.diuji, null]),
    ...(ker?.pangan?.menu || []).map((x) => ['Menu tersaji', x.nama, x.komponen, null, x.kejadian, x.kasus])] })
  sheets.push({ name: 'Tautan risiko SPPG', rows: [['SPPG', 'Kab/Kota', 'Provinsi', 'Kategori risiko', 'Kejadian', 'Kasus', 'Meninggal', 'Kejadian terakhir', 'Kunjungan pengawasan', 'Skor SOP', 'F12 terakhir', 'F13 terakhir', 'Pengawasan terakhir'],
    ...riskRows(ker).map((s) => [s.nama_sppg, s.kabkota_name, s.province_name, RISIKO_LABEL[s.risiko], s.kejadian, s.kasus, s.meninggal, s.last_kejadian, s.pengawasan_kunjungan, s.pengawasan_avg_skor, s.pengawasan_rekap12, s.pengawasan_rekap13, s.pengawasan_terakhir]),
    [], ['Prioritas pencegahan (skor rendah tanpa kejadian)'],
    ...pencegahanRows(gizi, ker).map((s) => [s.nama_sppg, s.kabkota_name, s.province_name, 'Skor rendah, belum ada kejadian', null, null, null, null, s.kunjungan, s.avg_skor, s.last_rekap12, s.last_rekap13, s.last_tanggal])] })
  sheets.push({ name: 'Pengawasan per SPPG', rows: [['SPPG', 'Puskesmas', 'Kab/Kota', 'Provinsi', 'Kunjungan', 'Kunjungan terakhir', 'F12 terakhir', 'F13 terakhir', 'Skor SOP rata-rata'],
    ...(gizi?.sppg_summary || []).map((s) => [s.nama_sppg, s.puskesmas, s.kabkota_name, s.province_name, s.kunjungan, s.last_tanggal, s.last_rekap12, s.last_rekap13, s.avg_skor])] })
  sheets.push({ name: 'Formulir F1-F13', rows: [['Formulir', 'Judul', 'Tersimpan', 'Dikirim', 'Sesuai/BAIK', 'Tidak Sesuai/BELUM BAIK', 'Skor rata-rata'],
    ...(gizi?.by_formulir || []).map((x) => [`F${x.form_no}`, x.title, x.tersimpan, x.dikirim, x.sesuai, x.tidak_sesuai, x.avg_skor])] })
  sheets.push({ name: 'Temuan pengawasan', rows: [['Formulir', 'Butir', 'Jumlah Tidak Sesuai', 'Formulir dikirim', '%'],
    ...(gizi?.temuan || []).map((t) => [`F${t.form_no}`, temuanLabel(t.form_no, t.kode, t.label), t.jumlah, t.dinilai, t.pct])] })
  return sheets
}

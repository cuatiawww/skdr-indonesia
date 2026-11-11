'use client'
// PR 044: Spasial (Dasbor Limited) - peta analisa SKDR IBS & EBS bergaya halaman analisa ABVC: peta penuh dengan panel
// mengambang (lapisan, legenda, hotspot & detail, putar ulang per minggu epid), filter samping yang sama dengan
// Matriks Analisa (parameter URL sama), KPI + interpretasi, dan tabel laporan di bawah peta (pengganti Pemetaan lama).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { defaultFilter, readFilter, useAnalisa, writeFilter, type AFilter } from '@/lib/analisa-api'
import { decodeTitik, type Area, type Metric, type SpasialResp, type Titik } from '@/lib/spasial-api'
import { useChoroConfig } from '@/lib/choropleth-classes'
import FilterBar, { activeFilterCount, scopeFilter } from '@/components/analisa/FilterBar'
import { Interpretasi, Kpi, Note, Seg } from '@/components/analisa/ui'
import { DEFAULT_LAYERS, type Focus, type Layers } from './SpasialMap'
import SpasialPanel from './SpasialPanel'
import SpasialDaftar from './SpasialDaftar'

const SpasialMap = dynamic(() => import('./SpasialMap'), { ssr: false, loading: () => <div className="flex h-[680px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">Memuat peta…</div> })

const PANEL_KEY = 'skdr-spasial-filter-panel'
const MAP_KEY = 'skdr-spasial-peta'
const TAB = 'sinyal' as const // filter lanjutan lengkap (status alert/KLB/verifikasi/respons) seperti Pemetaan lama

export default function SpasialClient() {
  const [f, setF] = useState<AFilter>(defaultFilter())
  const [ready, setReady] = useState(false)
  const [panel, setPanel] = useState(true)
  const [wide, setWide] = useState(true)
  const [metric, setMetricRaw] = useState<Metric>('kasus')
  const [layers, setLayersRaw] = useState<Layers>(DEFAULT_LAYERS)
  const [rightOpen, setRightOpen] = useState(true)
  const [sel, setSel] = useState<Area | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [defs, setDefs] = useState(false)
  const mapBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      setWide(mq.matches)
      if (!mq.matches) { setPanel(false); setRightOpen(false) } else { try { setPanel(localStorage.getItem(PANEL_KEY) !== '0') } catch { setPanel(true) } }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const togglePanel = (open: boolean) => { setPanel(open); if (wide) { try { localStorage.setItem(PANEL_KEY, open ? '1' : '0') } catch {} } }
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setF(readFilter(sp))
    const m = sp.get('indikator') as Metric | null
    if (m) setMetricRaw(m)
    try { const raw = localStorage.getItem(MAP_KEY); if (raw) setLayersRaw({ ...DEFAULT_LAYERS, ...JSON.parse(raw), status: [], kasusMin: 0 }) } catch {}
    if (sp.get('titik') === 'titik' || sp.get('titik') === 'kluster' || sp.get('titik') === 'off') setLayersRaw((l) => ({ ...l, points: sp.get('titik') as any }))
    if (sp.get('heatmap') === '1') setLayersRaw((l) => ({ ...l, heat: true }))
    setReady(true)
  }, [])
  const sync = useCallback((nf: AFilter, extra?: Record<string, string | null>) => {
    const url = new URL(window.location.href)
    writeFilter(url, nf)
    if (extra) for (const [k, v] of Object.entries(extra)) { if (v === null) url.searchParams.delete(k); else url.searchParams.set(k, v) }
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
  const set = useCallback((p: Partial<AFilter>) => { setSel(null); setF((old) => { const n = { ...old, ...p }; sync(n); return n }) }, [sync])
  const setMetric = (m: Metric) => { setMetricRaw(m); sync(f, { indikator: m === 'kasus' ? null : m }) }
  const setLayers = (l: Layers) => {
    setLayersRaw(l)
    try { localStorage.setItem(MAP_KEY, JSON.stringify({ base: l.base, choro: l.choro, opChoro: l.opChoro, points: l.points, heat: l.heat })) } catch {}
    sync(f, { titik: l.points === 'kluster' ? null : l.points, heatmap: l.heat ? '1' : null })
  }
  const sf = scopeFilter(f, TAB)
  const opsi = useAnalisa('opsi', { ...sf, penyakit: [] }, {}, ready)
  const sp = useAnalisa<SpasialResp>('spasial', sf, {}, ready)
  const data = sp.loading ? null : sp.data
  const titik = useMemo(() => decodeTitik(sp.data), [sp.data])
  const choroCfg = useChoroConfig()
  const rd = opsi.data?.rentang_data
  const srcRange = f.sumber === 'ebs' ? rd?.ebs : f.sumber === 'ibs' ? rd?.ibs : null
  const outOfRange = srcRange?.akhir && opsi.data?.meta?.mulai && opsi.data.meta.mulai > srcRange.akhir
  const nAktif = activeFilterCount(f, TAB)
  const r = sp.data?.ringkasan
  const lv = sp.data?.level
  const onDrill = (a: Area) => { if (lv === 'provinsi') set({ prov: String(a.id), kab: '', kec: '' }); else set({ kab: String(a.id), kec: '' }) }
  const onUp = f.kec ? () => set({ kec: '' }) : f.kab ? () => set({ kab: '', kec: '' }) : f.prov ? () => set({ prov: '', kab: '', kec: '' }) : null
  const pickArea = (a: Area, fromMap = false) => {
    setSel(a)
    if (!fromMap && a.lat != null && a.lon != null) setFocus({ lat: a.lat, lon: a.lon, area: a, zoom: lv === 'provinsi' ? 6.5 : 9.5, nonce: Date.now() })
  }
  const pickTitik = (t: Titik) => setFocus({ lat: t.lat, lon: t.lon, titik: t, nonce: Date.now() })
  const focusRow = (row: any) => {
    const t = titik.find((x) => x.lat === row.lat && x.lon === row.lon && (x.unit || '').toLowerCase() === String(row.unit || '').toLowerCase()) || null
    setFocus({ lat: row.lat, lon: row.lon, titik: t, row: t ? null : row, nonce: Date.now() })
    mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const toggleBtn = (
    <button type="button" onClick={() => togglePanel(!panel)} aria-expanded={panel} aria-controls="spasial-filter-panel" data-testid="toggle-filter"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${panel ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800'}`}>
      {panel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      {panel ? 'Sembunyikan filter' : 'Tampilkan filter'}
      {nAktif ? <span className={`rounded-full px-1.5 text-[10px] ${panel ? 'bg-primary text-white' : 'bg-white text-teal-800'}`}>{nAktif}</span> : null}
    </button>
  )
  const filterPanel = <FilterBar f={f} set={set} tab={TAB} opsi={opsi.data} opsiLoading={opsi.loading} onClose={() => togglePanel(false)} />
  const alertLabel = f.sumber === 'ebs' ? 'Sinyal EBS' : 'Alert / sinyal'
  return (
    <div className="w-full space-y-4 px-4 pb-10 sm:px-6 lg:px-8" data-testid="spasial-page">
      <PageHeader eyebrow="Dasbor Limited" title="Spasial" actions={toggleBtn}
        subtitle="Peta analisa SKDR IBS & EBS: choropleth provinsi/kab-kota dengan drilldown, titik unit pelapor (kluster/heatmap) berstatus KLB, verifikasi dan respons, hotspot, serta putar ulang per minggu epid. Sumber: Laporan EBS, Laporan Agregat IBS, dan Laporan Individu IBS." />
      <div className="flex items-start gap-4">
        {panel && wide ? <aside id="spasial-filter-panel" className="sticky top-4 w-[280px] shrink-0 self-start" style={{ maxHeight: 'calc(100vh - 2rem)' }} data-testid="filter-panel">{filterPanel}</aside> : null}
        {panel && !wide ? (
          <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Filter analisa" data-testid="filter-drawer">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => togglePanel(false)} />
            <aside id="spasial-filter-panel" className="relative h-full w-[300px] max-w-[88vw] p-2">{filterPanel}</aside>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Sumber</span>
            <Seg value={f.sumber} onChange={(v) => set({ sumber: v as AFilter['sumber'] })} options={[{ value: 'ibs', label: 'IBS' }, { value: 'ebs', label: 'EBS' }, { value: 'semua', label: 'Semua' }]} testId="sumber-cepat" />
            <span className="text-[11px] text-slate-500">· {sp.data?.meta?.periode_label || `M${f.sw}/${f.sy} – M${f.ew}/${f.ey}`}{sp.data?.meta?.breadcrumb ? ` · ${sp.data.meta.breadcrumb.map((c: any) => c.label).join(' › ')}` : ''}{f.penyakit.length ? ` · ${f.penyakit.length} penyakit` : ''}</span>
          </div>
          {outOfRange ? <Note tone="red">Periode terpilih berada di luar rentang data {f.sumber === 'ebs' ? 'Laporan EBS' : 'Laporan Agregat IBS'} (data terakhir {srcRange.akhir_label}). Ubah rentang minggu epid.</Note> : null}
          {sp.error ? <Note tone="red">Data peta gagal dimuat: {sp.error}. <button type="button" className="font-bold underline" onClick={sp.reload}>Coba lagi</button></Note> : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="spasial-kpi">
            <Kpi label="Kasus" value={r?.kasus} delta={r ? r.chg?.kasus ?? null : undefined} deltaLabel="vs periode sebelumnya" tip="Jumlah kasus pada rentang minggu epid; pembanding = rentang yang sama panjang tepat sebelumnya." />
            <Kpi label="Kematian" value={r?.kematian} tone="red" delta={r ? r.chg?.kematian ?? null : undefined} deltaLabel="vs periode sebelumnya" />
            <Kpi label="CFR" value={r?.cfr} pct tone="red" sub={r?.cfr_ci ? `95% CI ${r.cfr_ci[0].toLocaleString('id-ID')}–${r.cfr_ci[1].toLocaleString('id-ID')}%` : undefined} tip="Kematian ÷ kasus × 100, dengan interval kepercayaan Wilson 95%." />
            <Kpi label="Laporan" value={r?.laporan} tone="blue" delta={r ? r.chg?.laporan ?? null : undefined} deltaLabel="vs periode sebelumnya" />
            <Kpi label={alertLabel} value={r?.alert} tone="amber" delta={r ? r.chg?.alert ?? null : undefined} deltaLabel="vs periode sebelumnya" tip="IBS: baris penyakit yang memicu alert SKDR. EBS: setiap Laporan EBS = satu sinyal." />
            <Kpi label="KLB" value={r?.klb} tone="red" delta={r ? r.chg?.klb ?? null : undefined} deltaLabel="vs periode sebelumnya" />
            <Kpi label="Unit pelapor di peta" value={r?.unit} tone="slate" sub={r ? `${r.unit ? Math.round((r.unit_persis * 1000) / r.unit) / 10 : 0}% koordinat unit · ${r.unit_perkiraan} perkiraan` : undefined} tip="Unit pelapor yang muncul sebagai titik. Koordinat diambil dari titik unit pada Alert SKDR (cadangan: master fasyankes); bila tidak ada, titik diletakkan di pusat kab/kota (perkiraan)." />
          </div>
          <Interpretasi lines={sp.data?.interpretasi} />
          <div ref={mapBox}>
            <SpasialMap data={data} titik={titik} metric={metric} setMetric={setMetric} layers={layers} setLayers={setLayers} choroCfg={choroCfg} sumber={f.sumber}
              selectedId={sel?.id ?? null} onSelectArea={(a) => (a ? pickArea(a, true) : setSel(null))} onDrill={onDrill} onUp={onUp} focus={focus} panelOpen={rightOpen} setPanelOpen={setRightOpen}
              rightPanel={<SpasialPanel f={sf} data={data} titik={titik} metric={metric} selected={sel} onPickArea={(a) => pickArea(a)} onPickTitik={pickTitik} onClose={() => setRightOpen(false)} onClear={() => setSel(null)} />} />
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <button type="button" onClick={() => setDefs(!defs)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-extrabold text-slate-900" aria-expanded={defs} data-testid="spasial-definisi">
              Definisi & catatan data peta <ChevronDown className={`h-4 w-4 transition ${defs ? 'rotate-180' : ''}`} />
            </button>
            {defs ? (
              <ul className="list-disc space-y-1 px-8 pb-4 text-xs leading-relaxed text-slate-600">
                <li><b>Choropleth</b>: provinsi (nasional) atau kab/kota (bila satu provinsi dipilih; kab/kota terpilih disorot). Batas wilayah: GeoJSON BPS di aplikasi (38 provinsi, 514 kab/kota). Kecamatan belum punya batas wilayah, sehingga filter kecamatan hanya memengaruhi titik, KPI, dan tabel.</li>
                <li><b>Ambang warna</b>: indikator jumlah memakai 5 kelas (0, lalu kuartil wilayah bernilai &gt; 0) dari pengaturan <i>map_choropleth</i>, dihitung ulang tiap peta; saat putar ulang, skala dihitung dari semua minggu agar bisa dibandingkan. CFR dan perubahan memakai ambang tetap.</li>
                <li><b>Perubahan vs minggu lalu</b> = (kasus minggu epid terakhir − minggu sebelumnya) ÷ minggu sebelumnya. <b>vs periode sebelumnya</b> = rentang yang sama panjang tepat sebelum rentang terpilih.</li>
                <li><b>Titik unit pelapor</b>: Laporan EBS dan IBS tidak menyimpan koordinat. Titik memakai koordinat unit pada Alert SKDR (kode unit untuk IBS, nama unit + kab/kota untuk EBS), cadangan master fasyankes. Unit yang tidak cocok diletakkan di pusat kab/kota dan digambar berpinggiran putus-putus, bukan lokasi kejadian sebenarnya.</li>
                <li><b>Status titik</b>: KLB &gt; terverifikasi &gt; alert belum diverifikasi / rumor &gt; laporan tanpa alert. Pinggiran hitam = ada alert yang direspons lebih dari 24 jam. Kluster berwarna status terberat di dalamnya.</li>
                <li><b>Heatmap</b> menggambarkan kepadatan kasus menurut lokasi unit pelapor (bobot √kasus), bukan tempat tinggal kasus. Laporan EBS dihitung per lokasi unit pelapor.</li>
                <li>Tidak ada penyebut populasi, sehingga peta menampilkan jumlah, bukan insidens. Bandingkan antarwilayah dengan hati-hati (jumlah unit pelapor dan kelengkapan laporan berbeda).</li>
              </ul>
            ) : null}
          </section>
          {ready ? <SpasialDaftar f={sf} onFocus={focusRow} /> : null}
        </div>
      </div>
    </div>
  )
}

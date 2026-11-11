'use client'
// PR 052: panel filter samping Dasbor MBG — gaya sama dengan Matriks Analisa (components/analisa/FilterBar.tsx).
// Periode & granularitas, Jenis Analisa, wilayah bertingkat (Provinsi → Kab/Kota → Kecamatan, multi-pilih), SPPG, sekolah,
// dan filter lanjutan per modul. Filter yang tidak berlaku untuk tab aktif tetap terlihat tetapi ditandai.
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import SearchSelect from '@/components/ui/SearchSelect'
import { InfoTip, Seg } from '@/components/analisa/ui'
import { fetchKabkota, fetchProvinces, type MasterKabkota, type MasterProvince } from '@/lib/skdr-api'
import { activeMbgCount, defaultMbgFilter, GRAN_OPTS, JENIS_OPTS, presetRange, type MbgFilter, type MbgTab } from '@/lib/dasbor-mbg-filter'
import type { MbgFilterOptions } from '@/lib/dasbor-mbg-api'

const box = 'h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none hover:border-brand-300 focus:border-primary'
const lbl = 'mb-1 flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600'
const only = (t: string) => <span className="ml-auto rounded bg-slate-100 px-1 py-px text-[9px] font-bold normal-case tracking-normal text-slate-500">{t}</span>

export default function MbgFilterPanel({ f, set, tab, kerOpts, giziOpts, onClose }: {
  f: MbgFilter
  set: (p: Partial<MbgFilter>) => void
  tab: MbgTab
  kerOpts?: MbgFilterOptions | null
  giziOpts?: MbgFilterOptions | null
  onClose?: () => void
}) {
  const [provs, setProvs] = useState<MasterProvince[]>([])
  const [kabs, setKabs] = useState<MasterKabkota[]>([])
  const [adv, setAdv] = useState(() => activeMbgCount({ ...defaultMbgFilter(), status: f.status, lab: f.lab, ikl: f.ikl, slhs: f.slhs, gstatus: f.gstatus, rekap12: f.rekap12 }) > 0)
  useEffect(() => { fetchProvinces().then(setProvs).catch(() => setProvs([])) }, [])
  const provKey = f.prov.join(',')
  useEffect(() => {
    if (!f.prov.length) { setKabs([]); return }
    Promise.all(f.prov.map((p) => fetchKabkota(Number(p)).catch(() => [] as MasterKabkota[]))).then((l) => setKabs(l.flat())).catch(() => setKabs([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provKey])
  const kecOpts = useMemo(() => {
    const list = kerOpts?.kecamatan || []
    const seen = new Set<string>()
    return list.filter((k) => (!f.kab.length || (k.kabkota_id !== null && f.kab.includes(String(k.kabkota_id)))) && !seen.has(k.name.toLowerCase()) && seen.add(k.name.toLowerCase()))
      .map((k) => ({ value: k.name, label: k.name }))
  }, [kerOpts, f.kab])
  const sppgOpts = useMemo(() => {
    const s = new Map<string, string>()
    for (const x of [...(kerOpts?.sppg || []), ...(giziOpts?.sppg || [])]) if (!s.has(x.toLowerCase())) s.set(x.toLowerCase(), x)
    return [...s.values()].sort((a, b) => a.localeCompare(b, 'id')).map((x) => ({ value: x, label: x }))
  }, [kerOpts, giziOpts])
  const total = activeMbgCount(f, tab)
  const kerOnly = tab === 'gizi' ? only('Keracunan saja') : null
  const sel = (v: string, onChange: (v: string) => void, opts: [string, string][], label: string) => (
    <select className={box} value={v} onChange={(e) => onChange(e.target.value)} aria-label={label}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
  )
  return (
    <div className="flex max-h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xs" data-testid="mbg-filter">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
          <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Filter Dasbor MBG
          {total ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-white" data-testid="filter-count">{total}</span> : null}
        </div>
        {onClose ? <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Sembunyikan filter" data-testid="filter-close"><X className="h-4 w-4" /></button> : null}
      </div>
      <div className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
        <div>
          <div className={lbl}>Jenis Analisa <InfoTip text="Ukuran yang dipakai grafik wilayah & kurva epidemi Keracunan: jumlah kejadian (KLB), jumlah kasus (orang sakit), atau jumlah meninggal." /></div>
          <Seg value={f.jenis} onChange={(v) => set({ jenis: v })} options={JENIS_OPTS.map((o) => ({ value: o.value, label: o.label, title: o.long }))} testId="filter-jenis" />
        </div>
        <div>
          <div className={lbl}><CalendarDays className="h-3 w-3" /> Periode <InfoTip text="Keracunan: menurut tanggal kejadian. Pengawasan Gizi: menurut tanggal kunjungan. Kosong = seluruh data." /></div>
          <div className="flex items-center gap-1">
            <span className="w-8 text-[10.5px] font-bold text-slate-500">Dari</span>
            <input type="date" className={box} value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="Tanggal awal" data-testid="filter-from" />
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span className="w-8 text-[10.5px] font-bold text-slate-500">s.d.</span>
            <input type="date" className={box} value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="Tanggal akhir" data-testid="filter-to" />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {([['7h', '7 hari'], ['30h', '30 hari'], ['12m', '12 minggu'], ['tahun', 'Tahun berjalan'], ['semua', 'Semua']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set(presetRange(k))} data-testid={`preset-${k}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 hover:border-primary hover:text-primary">{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={lbl}>Granularitas waktu <InfoTip text="Satuan sumbu waktu kurva epidemi & tren skor: Tahun, Bulan, Minggu Epid (MMWR, Minggu–Sabtu), atau Harian. Minggu/Harian dianjurkan untuk mendeteksi klaster KLB." /></div>
          <Seg value={f.gran} onChange={(v) => set({ gran: v })} options={GRAN_OPTS} testId="filter-gran" />
        </div>
        <div>
          <div className={lbl}>Provinsi</div>
          <SearchSelect multiple options={provs.map((p) => ({ value: String(p.id), label: p.name }))} value={f.prov} placeholder="Semua provinsi"
            onChange={(v) => set({ prov: v, kab: [], kec: [] })} testId="filter-prov" />
        </div>
        <div>
          <div className={lbl}>Kab/Kota</div>
          <SearchSelect multiple options={kabs.map((k) => ({ value: String(k.id), label: k.name, hint: f.prov.length > 1 ? k.province_name : undefined }))} value={f.kab}
            disabled={!f.prov.length} disabledHint="Pilih provinsi dulu" placeholder="Semua kab/kota" onChange={(v) => set({ kab: v, kec: [] })} testId="filter-kab" />
        </div>
        <div>
          <div className={lbl}>Kecamatan {kerOnly || <InfoTip text="Dari isian kecamatan laporan Keracunan Pangan MBG (form Pengawasan Gizi tidak mencatat kecamatan)." />}</div>
          <SearchSelect multiple options={kecOpts} value={f.kec} disabled={!f.kab.length} disabledHint="Pilih kab/kota dulu" placeholder="Semua kecamatan" emptyText="Belum ada kecamatan pada laporan"
            onChange={(v) => set({ kec: v })} testId="filter-kec" />
        </div>
        <div>
          <div className={lbl}>SPPG <InfoTip text="Satuan Pelayanan Pemenuhan Gizi (dapur MBG). Daftar gabungan dari laporan Keracunan dan kunjungan Pengawasan Gizi." /></div>
          <SearchSelect options={sppgOpts} value={f.sppg || null} clearable placeholder="Semua SPPG" onChange={(v) => set({ sppg: v || '' })} testId="filter-sppg" />
        </div>
        <div>
          <div className={lbl}>Sekolah / sasaran {kerOnly}</div>
          <input type="search" className={`${box} w-full`} value={f.sekolah} placeholder="Cari nama sekolah…" onChange={(e) => set({ sekolah: e.target.value })} aria-label="Cari sekolah" data-testid="filter-sekolah" />
        </div>
        <div className="rounded-xl border border-slate-200">
          <button type="button" onClick={() => setAdv((x) => !x)} aria-expanded={adv} data-testid="toggle-lanjutan"
            className="flex w-full items-center justify-between px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
            <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Filter lanjutan</span>
            <ChevronDown className={`h-3.5 w-3.5 transition ${adv ? 'rotate-180' : ''}`} />
          </button>
          {adv ? (
            <div className="space-y-2.5 border-t border-slate-100 bg-slate-50 p-2.5" data-testid="filter-lanjutan">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-red-700">Keracunan Pangan</div>
              <div><div className={lbl}>Status laporan</div>{sel(f.status, (v) => set({ status: v }), [['all', 'Semua status'], ['dilaporkan', 'Dilaporkan'], ['ditutup', 'Ditutup'], ['draf', 'Draf']], 'Status laporan')}</div>
              <div><div className={lbl}>Status lab</div>{sel(f.lab, (v) => set({ lab: v }), [['all', 'Semua'], ['belum', 'Belum diambil'], ['dikirim', 'Dikirim'], ['hasil', 'Ada hasil']], 'Status lab')}</div>
              <div><div className={lbl}>Hasil IKL</div>{sel(f.ikl, (v) => set({ ikl: v }), [['all', 'Semua'], ['Memenuhi Syarat', 'Memenuhi Syarat'], ['Tidak Memenuhi Syarat', 'Tidak Memenuhi Syarat']], 'Hasil IKL')}</div>
              <div><div className={lbl}>Kepemilikan SLHS</div>{sel(f.slhs, (v) => set({ slhs: v }), [['all', 'Semua'], ['Ya', 'Ya (ada SLHS)'], ['Tidak', 'Tidak ada']], 'Kepemilikan SLHS')}</div>
              <div className="pt-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Pengawasan Gizi</div>
              <div><div className={lbl}>Status kunjungan</div>{sel(f.gstatus, (v) => set({ gstatus: v }), [['all', 'Semua (dikirim & draf)'], ['dikirim', 'Dikirim'], ['draf', 'Draf']], 'Status kunjungan')}</div>
              <div><div className={lbl}>Rekap standar gizi (F12)</div>{sel(f.rekap12, (v) => set({ rekap12: v }), [['all', 'Semua'], ['BAIK', 'BAIK'], ['BELUM BAIK', 'BELUM BAIK'], ['belum', 'Belum ada rekap F12']], 'Rekap F12')}</div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="border-t border-slate-100 p-3">
        <button type="button" onClick={() => set({ ...defaultMbgFilter(), jenis: f.jenis, gran: f.gran })} disabled={!activeMbgCount(f, 'ringkasan')}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-40" data-testid="reset-filter">
          <RotateCcw className="h-3.5 w-3.5" /> Atur ulang filter
        </button>
      </div>
    </div>
  )
}

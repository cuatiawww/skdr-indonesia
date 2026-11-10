'use client'
// PR 042: one filter bar for every Matriks Analisa tab. Only filters relevant to the active tab + Sumber are shown
// (and sent); uncommon ones live under "Filter lanjutan".
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import SearchSelect, { type SelectOption } from '@/components/ui/SearchSelect'
import { fetchKabkota, fetchProvinces, type MasterKabkota, type MasterProvince } from '@/lib/skdr-api'
import { getEpiWeekDateRange, getWeeksInYear } from '@/lib/epi-week'
import { ADV_KEYS, defaultFilter, preset, type AdvKey, type AFilter, type SumberA, type TabKey } from '@/lib/analisa-api'
import { InfoTip, Seg } from './ui'

const ADV_LABEL: Record<AdvKey, { label: string; tip: string }> = {
  jenis_unit: { label: 'Jenis unit pelapor', tip: 'Puskesmas, Rumah Sakit, Klinik, Laboratorium, Dinkes, BKK, dll.' },
  kelompok: { label: 'Kelompok unit', tip: 'Pemerintah / TNI / Polri / Swasta (dari isian form; data impor API lama belum memuat field ini).' },
  status_rumor: { label: 'Status rumor (EBS)', tip: 'Status kejadian pada Laporan EBS: Terverifikasi, Dalam investigasi, Discarded, dst.' },
  klb: { label: 'Status KLB', tip: 'EBS: "Memenuhi kriteria KLB?". IBS: status KLB pada alert SKDR.' },
  klb_status: { label: 'Situasi KLB (EBS)', tip: 'Status KLB saat ini: Berlangsung / Berakhir (form Laporan EBS).' },
  w1: { label: 'Formulir W1 (EBS)', tip: 'Apakah Formulir W1 (laporan KLB 24 jam) sudah dibuat.' },
  sumber_info: { label: 'Sumber informasi (EBS)', tip: 'Sumber rumor/informasi pada Laporan EBS.' },
  spesimen: { label: 'Diperiksa lab / spesimen', tip: 'EBS: pengambilan spesimen. IBS: alert dengan spesimen.' },
  respon: { label: 'Respons', tip: 'Respons ≤ 24 jam (IBS: Alert SKDR; EBS: pembaruan pertama setelah laporan dibuat).' },
  verif: { label: 'Verifikasi', tip: 'IBS: status verifikasi alert. EBS: kelas status rumor (Terverifikasi/Discarded/Dalam investigasi).' },
}

/** Advanced filters that apply to a tab for a source. */
export function relevantAdv(tab: TabKey, sumber: SumberA): AdvKey[] {
  if (sumber === 'semua') return ['jenis_unit', 'kelompok']
  const ebs: AdvKey[] = ['jenis_unit', 'kelompok', 'status_rumor', 'klb', 'klb_status', 'w1', 'sumber_info', 'spesimen', 'respon']
  const ibs: AdvKey[] = ['jenis_unit', 'kelompok', 'verif', 'klb', 'respon', 'spesimen']
  const all = sumber === 'ebs' ? ebs : ibs
  switch (tab) {
    case 'kinerja': case 'morbiditas': return ['jenis_unit', 'kelompok']
    case 'ringkasan': case 'profil': return sumber === 'ebs' ? ['jenis_unit', 'kelompok', 'status_rumor', 'klb'] : ['jenis_unit', 'kelompok']
    default: return all
  }
}
export function scopeFilter(f: AFilter, tab: TabKey): AFilter {
  const keep = new Set(relevantAdv(tab, f.sumber))
  const g = { ...f }
  for (const k of ADV_KEYS) if (!keep.has(k)) g[k] = []
  if (f.sumber !== 'ebs') g.basis = 'verif'
  return g
}

const box = 'h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none hover:border-brand-300 focus:border-primary'
const lbl = 'mb-1 flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600'

export default function FilterBar({ f, set, tab, opsi, opsiLoading }: { f: AFilter; set: (p: Partial<AFilter>) => void; tab: TabKey; opsi: any; opsiLoading: boolean }) {
  const [provs, setProvs] = useState<MasterProvince[]>([])
  const [kabs, setKabs] = useState<MasterKabkota[]>([])
  const [adv, setAdv] = useState(false)
  useEffect(() => { fetchProvinces().then(setProvs).catch(() => setProvs([])) }, [])
  useEffect(() => { if (f.prov) fetchKabkota(Number(f.prov)).then(setKabs).catch(() => setKabs([])); else setKabs([]) }, [f.prov])
  const years = useMemo(() => { const y = new Date().getFullYear(); return Array.from({ length: y - 2019 }, (_, i) => y - i) }, [])
  const weeks = (y: number) => Array.from({ length: getWeeksInYear(y) }, (_, i) => i + 1)
  const range = `${getEpiWeekDateRange(f.sy, f.sw).startFormatted} – ${getEpiWeekDateRange(f.ey, f.ew).endFormatted}`
  const advKeys = relevantAdv(tab, f.sumber)
  const advActive = advKeys.filter((k) => f[k].length).length + (f.sumber === 'ebs' && f.basis === 'rumor' ? 1 : 0)
  const optsFor = (k: AdvKey): SelectOption[] => {
    const o = opsi?.opsi || {}
    const src: any[] = k === 'jenis_unit' ? o.jenis_unit : k === 'kelompok' ? o.kelompok : k === 'status_rumor' ? o.status_rumor : k === 'klb_status' ? o.status_klb
      : k === 'sumber_info' ? o.sumber_informasi : k === 'respon' ? o.respon : k === 'verif' ? (f.sumber === 'ebs' ? [{ value: 'Terverifikasi', label: 'Terverifikasi' }, { value: 'Dalam investigasi', label: 'Dalam investigasi' }, { value: 'Discarded', label: 'Discarded' }, { value: '(Belum diisi)', label: '(Belum diisi)' }] : o.verif_ibs) : o.ya_tidak
    const list = (src || []).map((x: any) => ({ value: String(x.value), label: String(x.label) }))
    if (['jenis_unit', 'kelompok', 'status_rumor', 'klb_status', 'sumber_info'].includes(k)) list.push({ value: '(Belum diisi)', label: '(Belum diisi)' })
    return list
  }
  const sumberOpts: { value: SumberA; label: string; title: string }[] = [
    { value: 'ibs', label: 'IBS', title: 'Laporan Agregat IBS (+ Laporan Individu IBS untuk profil kasus)' },
    { value: 'ebs', label: 'EBS', title: 'Laporan EBS (sinyal/rumor)' },
    { value: 'semua', label: 'Semua', title: 'Laporan EBS + Laporan Agregat IBS (penyakit disatukan menurut master penyakit)' },
  ]
  const showPeriode = tab === 'ringkasan' || tab === 'matriks'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs" data-testid="analisa-filter">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[auto_minmax(20rem,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)]">
        <div>
          <div className={lbl}>Sumber <InfoTip text="EBS = Laporan EBS (sinyal/rumor, minggu epid dihitung dari tanggal laporan). IBS = Laporan Agregat IBS (rekap mingguan unit) + Laporan Individu IBS. Semua = keduanya." /></div>
          <Seg value={f.sumber} onChange={(v) => set({ sumber: v })} options={sumberOpts} testId="filter-sumber" />
        </div>
        <div>
          <div className={lbl}><CalendarDays className="h-3 w-3" /> Rentang minggu epid <span className="font-semibold normal-case tracking-normal text-slate-400">({range})</span></div>
          <div className="flex flex-wrap items-center gap-1">
            <select className={box} value={f.sy} onChange={(e) => { const y = Number(e.target.value); set({ sy: y, sw: Math.min(f.sw, getWeeksInYear(y)) }) }} aria-label="Tahun awal">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select className={box} value={f.sw} onChange={(e) => set({ sw: Number(e.target.value) })} aria-label="Minggu awal">{weeks(f.sy).map((w) => <option key={w} value={w}>M{w}</option>)}</select>
            <span className="px-0.5 text-xs font-bold text-slate-400">s.d.</span>
            <select className={box} value={f.ey} onChange={(e) => { const y = Number(e.target.value); set({ ey: y, ew: Math.min(f.ew, getWeeksInYear(y)) }) }} aria-label="Tahun akhir">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <select className={box} value={f.ew} onChange={(e) => set({ ew: Number(e.target.value) })} aria-label="Minggu akhir">{weeks(f.ey).map((w) => <option key={w} value={w}>M{w}</option>)}</select>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {([['4minggu', '4 minggu terakhir'], ['12minggu', '12 minggu terakhir'], ['tahun', 'Tahun berjalan']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set(preset(k))} data-testid={`preset-${k}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 hover:border-primary hover:text-primary">{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={lbl}>Provinsi</div>
          <SearchSelect options={provs.map((p) => ({ value: String(p.id), label: p.name }))} value={f.prov || null} clearable placeholder="Semua provinsi"
            onChange={(v) => set({ prov: v || '', kab: '', kec: '' })} testId="filter-prov" />
        </div>
        <div>
          <div className={lbl}>Kab/Kota</div>
          <SearchSelect options={kabs.map((k) => ({ value: String(k.id), label: k.name }))} value={f.kab || null} clearable disabled={!f.prov} disabledHint="Pilih provinsi dulu" placeholder="Semua kab/kota"
            onChange={(v) => set({ kab: v || '', kec: '' })} testId="filter-kab" />
        </div>
        <div>
          <div className={lbl}>Kecamatan</div>
          <SearchSelect options={(opsi?.kecamatan || []).map((k: any) => ({ value: k.value, label: k.label }))} value={f.kec || null} clearable disabled={!f.kab} disabledHint="Pilih kab/kota dulu"
            loading={opsiLoading} placeholder="Semua kecamatan" onChange={(v) => set({ kec: v || '' })} testId="filter-kec" />
        </div>
        <div>
          <div className={lbl}>Penyakit <InfoTip text="Diurutkan menurut jumlah kasus pada periode & wilayah terpilih." /></div>
          <SearchSelect multiple options={(opsi?.penyakit || []).map((p: any) => ({ value: p.value, label: p.label || p.value, hint: `${Number(p.kasus).toLocaleString('id-ID')} kasus` }))}
            value={f.penyakit} loading={opsiLoading} placeholder="Semua penyakit" onChange={(v) => set({ penyakit: v })} testId="filter-penyakit" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        {showPeriode ? (
          <div className="flex items-center gap-1.5"><span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Agregasi</span>
            <Seg value={f.periode} onChange={(v) => set({ periode: v })} options={[{ value: 'minggu', label: 'Mingguan' }, { value: 'bulan', label: 'Bulanan' }, { value: 'tahun', label: 'Tahunan' }]} testId="filter-periode" />
          </div>
        ) : null}
        {f.sumber === 'ebs' && tab !== 'kinerja' ? (
          <div className="flex items-center gap-1.5"><span className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600">Penyakit menurut <InfoTip text="Terverifikasi = penyakit hasil verifikasi (jika ada, selain itu rumor). Rumor = penyakit seperti dilaporkan pertama kali." /></span>
            <Seg value={f.basis} onChange={(v) => set({ basis: v })} options={[{ value: 'verif', label: 'Terverifikasi' }, { value: 'rumor', label: 'Rumor' }]} testId="filter-basis" />
          </div>
        ) : null}
        <button type="button" onClick={() => setAdv((x) => !x)} aria-expanded={adv} data-testid="toggle-lanjutan"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filter lanjutan {advActive ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{advActive}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 transition ${adv ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => { const d = defaultFilter(); set({ ...d, sumber: f.sumber }) }} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-primary" data-testid="reset-filter">
          <RotateCcw className="h-3.5 w-3.5" /> Atur ulang
        </button>
      </div>
      {adv ? (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" data-testid="filter-lanjutan">
          {advKeys.map((k) => (
            <div key={k}>
              <div className={lbl}>{ADV_LABEL[k].label}<InfoTip text={ADV_LABEL[k].tip} /></div>
              <SearchSelect multiple options={optsFor(k)} value={f[k]} placeholder="Semua" onChange={(v) => set({ [k]: v } as Partial<AFilter>)} testId={`filter-${k}`} />
            </div>
          ))}
          <div className="col-span-full text-[10.5px] text-slate-500">Hanya filter yang berlaku untuk tab dan sumber terpilih yang ditampilkan. "(Belum diisi)" = laporan yang tidak mengisi field tersebut.</div>
        </div>
      ) : null}
    </div>
  )
}

'use client'
// PR 044: table under the Spasial map (replaces the old Pemetaan table): one row per laporan x penyakit with
// Peta (zoom to the unit) and Detail. IBS: alert rows by default (as in the old Pemetaan), or all rows.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, MapPin, Search } from 'lucide-react'
import Modal from '@/components/Modal'
import { apiQuery, fetchAnalisa, nf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, Panel, Seg, State } from '@/components/analisa/ui'

type Col = { k: string; l: string; num?: boolean }
function cols(sumber: string): Col[] {
  const base: Col[] = [{ k: 'provinsi', l: 'Provinsi' }, { k: 'kabkota', l: 'Kab/Kota' }, { k: 'kecamatan', l: 'Kecamatan' }, { k: 'unit', l: 'Unit pelapor' }]
  const kk: Col[] = [{ k: 'penyakit', l: 'Penyakit' }, { k: 'kasus', l: 'Kasus', num: true }, { k: 'kematian', l: 'Kematian', num: true }]
  if (sumber === 'ebs') return [{ k: 'no', l: 'No. laporan' }, { k: 'tanggal', l: 'Tanggal' }, { k: 'minggu', l: 'Minggu' }, { k: 'tahun', l: 'Tahun' }, ...base, ...kk, { k: 'status_rumor', l: 'Status rumor' }, { k: 'klb', l: 'KLB' }, { k: 'respon', l: 'Respons ≤ 24 jam' }]
  if (sumber === 'ibs') return [...base, { k: 'minggu', l: 'Minggu' }, { k: 'tahun', l: 'Tahun' }, ...kk, { k: 'klb', l: 'KLB' }, { k: 'verif', l: 'Verifikasi' }, { k: 'respon', l: 'Respons ≤ 24 jam' }]
  return [{ k: 'src', l: 'Sumber' }, ...base, { k: 'minggu', l: 'Minggu' }, { k: 'tahun', l: 'Tahun' }, ...kk, { k: 'klb', l: 'KLB' }, { k: 'verif', l: 'Verifikasi' }, { k: 'respon', l: 'Respons ≤ 24 jam' }]
}
const DETAIL: Col[] = [
  { k: 'src', l: 'Sumber' }, { k: 'no', l: 'No. laporan' }, { k: 'tanggal', l: 'Tanggal laporan / periksa' }, { k: 'minggu_label', l: 'Minggu epid' },
  { k: 'provinsi', l: 'Provinsi' }, { k: 'kabkota', l: 'Kab/Kota' }, { k: 'kecamatan', l: 'Kecamatan' }, { k: 'unit', l: 'Unit pelapor' }, { k: 'jenis_unit', l: 'Jenis unit' }, { k: 'kelompok', l: 'Kelompok unit' },
  { k: 'penyakit', l: 'Penyakit' }, { k: 'kasus', l: 'Kasus', num: true }, { k: 'kematian', l: 'Kematian', num: true }, { k: 'lab', l: 'Diperiksa lab', num: true },
  { k: 'alert', l: 'Alert / sinyal' }, { k: 'klb', l: 'KLB' }, { k: 'verif', l: 'Verifikasi' }, { k: 'respon', l: 'Respons' }, { k: 'spesimen', l: 'Spesimen' },
  { k: 'status_rumor', l: 'Status rumor (EBS)' }, { k: 'klb_status', l: 'Situasi KLB (EBS)' }, { k: 'w1', l: 'Formulir W1 (EBS)' }, { k: 'sumber_info', l: 'Sumber informasi (EBS)' },
  { k: 'lat', l: 'Lintang unit' }, { k: 'lon', l: 'Bujur unit' },
]
const SRC: Record<string, string> = { ibs: 'Laporan Agregat IBS', ebs: 'Laporan EBS', ind: 'Laporan Individu IBS' }
const show = (row: any, k: string) => {
  const v = row[k]
  if (k === 'src') return SRC[v] || v
  if (k === 'alert') return v ? 'Ya' : 'Tidak'
  if (k === 'respon') return v === '≤ 24 jam' ? 'Ya (≤ 24 jam)' : v === '> 24 jam' ? 'Tidak (> 24 jam)' : v
  return v
}
const badge = (k: string, v: any) => {
  if (k === 'klb' && v === 'Ya') return 'bg-red-100 text-red-700'
  if (k === 'verif' && v === 'Terverifikasi') return 'bg-emerald-100 text-emerald-800'
  if (k === 'verif' && v) return 'bg-amber-100 text-amber-800'
  if (k === 'respon' && v === '> 24 jam') return 'bg-amber-100 text-amber-800'
  if (k === 'respon' && v === '≤ 24 jam') return 'bg-emerald-100 text-emerald-800'
  if (k === 'status_rumor' && String(v).startsWith('Terverifikasi')) return 'bg-emerald-100 text-emerald-800'
  return ''
}

export default function SpasialDaftar({ f, onFocus }: { f: AFilter; onFocus: (row: any) => void }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [qq, setQq] = useState('')
  const [urut, setUrut] = useState<'tgl' | 'kasus' | 'wilayah'>('tgl')
  const [jenis, setJenis] = useState<'alert' | 'semua'>(f.sumber === 'ibs' ? 'alert' : 'semua')
  const [kmin, setKmin] = useState(0)
  const [detail, setDetail] = useState<any>(null)
  useEffect(() => { const t = setTimeout(() => { setQq(q); setPage(1) }, 350); return () => clearTimeout(t) }, [q])
  useEffect(() => { setJenis(f.sumber === 'ibs' ? 'alert' : 'semua') }, [f.sumber])
  const fq = apiQuery(f)
  useEffect(() => { setPage(1) }, [fq, jenis, kmin, urut])
  const per = 25
  const extra = { jenis, page, per, q: qq, urut, kasus_min: kmin || undefined }
  const r = useAnalisa('spasial/daftar', f, extra)
  const d: any = r.data
  const cs = cols(f.sumber)
  const pages = d ? Math.max(1, Math.ceil(d.total / per)) : 1
  const build = async () => {
    const all: any[] = []
    const max = 50000
    for (let p = 1; p <= Math.ceil(Math.min(d?.total || 0, max) / 5000); p++) {
      const x: any = await fetchAnalisa('spasial/daftar', f, { ...extra, page: p, per: 5000 })
      all.push(...(x?.data || []))
    }
    return [{ name: 'Daftar spasial', rows: [DETAIL.map((c) => c.l), ...all.map((row) => DETAIL.map((c) => show(row, c.k) ?? ''))],
      note: (d?.total || 0) > max ? `Dibatasi ${max.toLocaleString('id-ID')} baris pertama dari ${d.total.toLocaleString('id-ID')}` : undefined }]
  }
  const title = f.sumber === 'ebs' ? 'Daftar Laporan EBS pada peta' : f.sumber === 'ibs' ? (jenis === 'alert' ? 'Daftar alert Laporan Agregat IBS pada peta' : 'Daftar baris Laporan Agregat IBS pada peta') : 'Daftar laporan EBS & IBS pada peta'
  return (
    <Panel title={title} testId="spasial-daftar"
      desc="Pengganti tabel Pemetaan lama: satu baris per laporan × penyakit sesuai filter. Tombol Peta memperbesar peta ke unit pelapor; Detail menampilkan isian laporan (tanpa nama pasien, alamat, kronologi, atau kontak)."
      actions={d ? <ExportButton filename={`spasial-${f.sumber}-${d.meta?.periode_label || ''}`} build={build} label={`Ekspor Excel (${nf(Math.min(d.total, 50000))})`} /> : null}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {f.sumber !== 'ebs' ? <Seg value={jenis} onChange={(v) => setJenis(v)} options={[{ value: 'alert', label: 'Hanya alert', title: 'Baris penyakit yang memicu alert SKDR (seperti Pemetaan lama)' }, { value: 'semua', label: 'Semua baris' }]} testId="daftar-jenis" /> : null}
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. laporan, unit, penyakit, kecamatan…" className="h-8 w-64 rounded-lg border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-primary" data-testid="spasial-cari" />
        </label>
        <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">Kasus ≥
          <input type="number" min={0} value={kmin || ''} placeholder="0" onChange={(e) => setKmin(Math.max(0, Number(e.target.value) || 0))} className="h-8 w-16 rounded-lg border border-slate-200 px-1.5 text-right text-xs" /></label>
        <select value={urut} onChange={(e) => setUrut(e.target.value as any)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="Urutan">
          <option value="tgl">Terbaru dulu</option><option value="kasus">Kasus terbanyak</option><option value="wilayah">Wilayah (A–Z)</option>
        </select>
        {d ? <span className="text-[11px] text-slate-500">{nf(d.total)} baris</span> : null}
      </div>
      <State {...r} kind="table">
        {d && d.total === 0 ? <Empty>Tidak ada baris untuk filter ini.</Empty> : d ? (
          <>
            <div className="skdr-table-card max-h-[560px] overflow-auto"><table className="skdr-table w-full text-[11px]">
              <thead className="sticky top-0 z-10"><tr><th className="text-right">No</th>{cs.map((c) => <th key={c.k} className={`${c.num ? 'text-right' : 'text-left'} whitespace-nowrap`}>{c.l}</th>)}<th>Peta</th><th>Detail</th></tr></thead>
              <tbody>{d.data.map((row: any, i: number) => (
                <tr key={`${row.src}-${row.id}-${i}`}>
                  <td className="text-right tabular-nums text-slate-400">{nf((page - 1) * per + i + 1)}</td>
                  {cs.map((c) => { const v = show(row, c.k); const b = badge(c.k, row[c.k]); return <td key={c.k} className={`${c.num ? 'text-right tabular-nums' : ''} whitespace-nowrap`}>{v === null || v === undefined || v === '' ? <span className="text-slate-300">–</span> : c.num ? nf(v) : b ? <span className={`rounded px-1.5 py-0.5 font-bold ${b}`}>{String(v)}</span> : String(v)}</td> })}
                  <td className="text-center"><button type="button" disabled={row.lat == null} onClick={() => onFocus(row)} title={row.lat == null ? 'Koordinat unit tidak tersedia' : 'Perbesar peta ke unit ini'} className="rounded p-1 text-teal-700 hover:bg-teal-50 disabled:text-slate-300" data-testid="daftar-peta"><MapPin className="h-3.5 w-3.5" /></button></td>
                  <td className="text-center"><button type="button" onClick={() => setDetail(row)} className="rounded p-1 text-slate-600 hover:bg-slate-100" title="Detail" data-testid="daftar-detail"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="mt-2 flex items-center justify-end gap-2 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Sebelumnya"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span>Hal. {page} / {nf(pages)}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40" aria-label="Berikutnya"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </>
        ) : null}
      </State>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.no || 'Laporan'} · ${detail.penyakit || ''}` : ''} maxWidth="max-w-xl">
        {detail ? (
          <div className="text-xs">
            <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1">{DETAIL.map((c) => { const v = show(detail, c.k); return [<dt key={`${c.k}-l`} className="font-semibold text-slate-500">{c.l}</dt>, <dd key={`${c.k}-v`} className="font-bold text-slate-800">{v === null || v === undefined || v === '' ? <span className="font-normal text-slate-300">–</span> : c.num ? nf(v) : String(v)}</dd>] })}</dl>
            {detail.lat != null ? <button type="button" onClick={() => { onFocus(detail); setDetail(null) }} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-bold text-white"><MapPin className="h-3.5 w-3.5" />Lihat di peta</button> : <p className="mt-3 text-[11px] text-amber-700">Koordinat unit pelapor tidak tersedia; laporan ini tampil di pusat kab/kota pada peta.</p>}
          </div>
        ) : null}
      </Modal>
    </Panel>
  )
}

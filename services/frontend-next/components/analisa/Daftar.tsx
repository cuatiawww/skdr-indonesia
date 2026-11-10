'use client'
// PR 042: paginated, searchable line lists (Laporan EBS, Alert IBS, Laporan Agregat IBS, Laporan Individu IBS,
// Surveilans Terpadu Penyakit Berbasis KLB). Read-only; nama pasien disamarkan, alamat/NIK/kontak tidak dikirim backend.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { apiQuery, fetchAnalisa, nf, useAnalisa, type AFilter } from '@/lib/analisa-api'
import { Empty, ExportButton, Note, Panel, State } from './ui'

export type DaftarJenis = 'ebs' | 'alert' | 'agregat' | 'individu' | 'klb'
const TITLE: Record<DaftarJenis, string> = {
  ebs: 'Daftar Laporan EBS', alert: 'Line list Alert IBS', agregat: 'Line list Laporan Agregat IBS (per baris penyakit)',
  individu: 'Line list Laporan Individu IBS', klb: 'Surveilans Terpadu Penyakit Berbasis KLB',
}
type Col = { k: string; l: string; num?: boolean }
const BASE: Col[] = [{ k: 'no', l: 'No. laporan' }, { k: 'minggu', l: 'Minggu epid' }, { k: 'tanggal', l: 'Tanggal' }, { k: 'provinsi', l: 'Provinsi' }, { k: 'kabkota', l: 'Kab/Kota' }, { k: 'kecamatan', l: 'Kecamatan' }, { k: 'unit', l: 'Unit pelapor' }, { k: 'penyakit', l: 'Penyakit' }]
function cols(j: DaftarJenis, usia: { key: string; label: string }[]): Col[] {
  const kk: Col[] = [{ k: 'kasus', l: 'Kasus', num: true }, { k: 'kematian', l: 'Kematian', num: true }]
  if (j === 'ebs') return [...BASE, ...kk, { k: 'status_rumor', l: 'Status rumor' }, { k: 'klb', l: 'KLB' }, { k: 'klb_status', l: 'Situasi KLB' }, { k: 'w1', l: 'W1' }, { k: 'sumber_info', l: 'Sumber informasi' }, { k: 'spesimen', l: 'Spesimen' }, { k: 'respon', l: 'Respons' }]
  if (j === 'alert') return [...BASE, ...kk, { k: 'lab', l: 'Lab', num: true }, { k: 'verif', l: 'Verifikasi' }, { k: 'respon', l: 'Respons' }, { k: 'klb', l: 'KLB' }, { k: 'spesimen', l: 'Spesimen' }]
  if (j === 'agregat') return [...BASE, { k: 'jenis_unit', l: 'Jenis unit' }, { k: 'kelompok', l: 'Kelompok' }, ...kk, { k: 'lab', l: 'Lab', num: true }, { k: 'verif', l: 'Alert: verifikasi' }]
  if (j === 'individu') return [...BASE, { k: 'nama_pasien', l: 'Nama (disamarkan)' }, { k: 'jenis_kelamin', l: 'JK' }, { k: 'umur', l: 'Umur' }, { k: 'diagnosa', l: 'Diagnosa' }, { k: 'status_akhir', l: 'Status akhir' }]
  return [...BASE, ...usia.flatMap((u) => [{ k: `usia.pria_${u.key}`, l: `${u.label} L`, num: true }, { k: `usia.wanita_${u.key}`, l: `${u.label} P`, num: true }]),
    ...kk, { k: 'status_klb', l: 'Situasi KLB' }, { k: 'tgl_mulai', l: 'Tgl mulai' }, { k: 'klb_tgl_berakhir', l: 'Tgl akhir' }, { k: 'tgl_diketahui', l: 'Tgl diketahui' }, { k: 'tgl_tanggulang', l: 'Tgl ditanggulangi' }]
}
const val = (r: any, k: string) => k.startsWith('usia.') ? (r.usia_terisi && r.usia ? r.usia[k.slice(5)] ?? 0 : null) : r[k]

export default function Daftar({ f, jenis, title, desc }: { f: AFilter; jenis: DaftarJenis; title?: string; desc?: string }) {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [qq, setQq] = useState('')
  const [urut, setUrut] = useState<'tgl' | 'kasus'>('tgl')
  useEffect(() => { const t = setTimeout(() => { setQq(q); setPage(1) }, 350); return () => clearTimeout(t) }, [q])
  const fq = apiQuery(f)
  useEffect(() => { setPage(1) }, [fq, jenis])
  const per = 25
  const r = useAnalisa('daftar', f, { jenis, page, per, q: qq, urut })
  const d: any = r.data
  const cs = cols(jenis, d?.usia_kolom || [])
  const pages = d ? Math.max(1, Math.ceil(d.total / per)) : 1
  const build = async () => {
    const all: any[] = []
    const max = 50000
    for (let p = 1; p <= Math.ceil(Math.min(d?.total || 0, max) / 5000); p++) {
      const x: any = await fetchAnalisa('daftar', f, { jenis, page: p, per: 5000, q: qq, urut })
      all.push(...(x?.data || []))
    }
    return [{ name: TITLE[jenis].slice(0, 31), rows: [cs.map((c) => c.l), ...all.map((row) => cs.map((c) => val(row, c.k) ?? ''))], note: (d?.total || 0) > max ? `Dibatasi ${max.toLocaleString('id-ID')} baris pertama dari ${d.total.toLocaleString('id-ID')}` : undefined }]
  }
  return (
    <Panel title={title || TITLE[jenis]} testId={`daftar-${jenis}`}
      desc={desc || (jenis === 'klb' ? 'Laporan EBS yang memenuhi kriteria KLB, dengan sebaran umur pria/wanita, kasus/meninggal, dan tanggal kejadian. Hanya baca.' : 'Hanya baca. Nama pasien disamarkan; alamat, NIK, kronologi, dan kontak tidak ditampilkan.')}
      actions={d ? <ExportButton filename={`matriks-analisa-${jenis}-${d.meta?.periode_label || ''}`} build={build} label={`Ekspor Excel (${nf(Math.min(d.total, 50000))})`} /> : null}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. laporan, unit, penyakit, kecamatan…" data-testid="daftar-cari"
            className="h-8 w-72 rounded-lg border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-primary" />
        </label>
        <select value={urut} onChange={(e) => setUrut(e.target.value as any)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs" aria-label="Urutan">
          <option value="tgl">Terbaru dulu</option><option value="kasus">Kasus terbanyak</option>
        </select>
        {d ? <span className="text-[11px] text-slate-500">{nf(d.total)} baris</span> : null}
      </div>
      <State {...r} kind="table">
        {d && d.total === 0 ? (
          <Empty>{jenis === 'individu' ? 'Belum ada Laporan Individu IBS terkirim untuk filter ini.' : jenis === 'klb' ? 'Tidak ada Laporan EBS berstatus KLB untuk filter ini.' : 'Tidak ada baris untuk filter ini.'}</Empty>
        ) : d ? (
          <>
            {jenis === 'klb' && d.data.some((x: any) => !x.usia_terisi) ? <Note>Kolom umur kosong pada laporan yang tidak mengisi isian usia (termasuk data impor API lama); ditampilkan "–", bukan 0.</Note> : null}
            <div className="skdr-table-card max-h-[560px] overflow-auto"><table className="skdr-table w-full text-[11px]">
              <thead className="sticky top-0 z-10"><tr>{cs.map((c) => <th key={c.k} className={`${c.num ? 'text-right' : 'text-left'} whitespace-nowrap`}>{c.l}</th>)}</tr></thead>
              <tbody>{d.data.map((row: any, i: number) => (
                <tr key={`${row.no}-${i}`}>{cs.map((c) => { const v = val(row, c.k); return <td key={c.k} className={`${c.num ? 'text-right tabular-nums' : ''} whitespace-nowrap`}>{v === null || v === undefined || v === '' ? <span className="text-slate-300">–</span> : c.num ? nf(v) : String(v)}</td> })}</tr>
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
    </Panel>
  )
}

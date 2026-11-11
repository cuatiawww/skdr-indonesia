'use client'
// PR 052: daftar kejadian Keracunan Pangan MBG (drilldown) — cari, urut, halaman, dan tautan ke detail laporan.
// Tidak memuat PII pelapor (backend tidak mengirimkannya).
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react'
import { Panel } from '@/components/analisa/ui'
import { EmptyBox, RekapBadge, nf, pf } from '@/components/dasbor-mbg/MbgUi'
import type { KeracunanDashData } from '@/lib/dasbor-mbg-api'
import { fmtJam } from '@/lib/dasbor-mbg-filter'

type Row = KeracunanDashData['recent_incidents'][number]
const PAGE = 15
const STATUS_LABEL: Record<string, string> = { draf: 'Draf', dilaporkan: 'Dilaporkan', ditutup: 'Ditutup' }
const LAB_LABEL: Record<string, string> = { belum: 'Belum', dikirim: 'Dikirim', hasil: 'Hasil' }

export default function IncidentList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'tanggal' | 'kasus' | 'lapor'>('tanggal')
  const [page, setPage] = useState(0)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const r = rows.filter((x) => !t || [x.no_laporan, x.nama_sppg, x.sekolah, x.kecamatan, x.kabkota_name, x.province_name].some((v) => (v || '').toLowerCase().includes(t)))
    if (sort === 'kasus') r.sort((a, b) => b.jumlah_kasus - a.jumlah_kasus)
    else if (sort === 'lapor') r.sort((a, b) => (b.lapor_jam ?? -1) - (a.lapor_jam ?? -1))
    return r
  }, [rows, q, sort])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const shown = list.slice(pg * PAGE, pg * PAGE + PAGE)
  return (
    <Panel title="Daftar Kejadian Keracunan Pangan MBG" testId="panel-daftar-kejadian"
      desc={`${nf(list.length)} kejadian sesuai filter${rows.length >= 1000 ? ' (dibatasi 1.000 terbaru)' : ''} · klik nomor laporan untuk membuka detail`}
      actions={<>
        <div className="relative"><Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Cari no. laporan, SPPG, sekolah, wilayah…" className="h-8 w-64 rounded-lg border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-primary" data-testid="cari-kejadian" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-700" aria-label="Urutkan">
          <option value="tanggal">Terbaru</option><option value="kasus">Kasus terbanyak</option><option value="lapor">Lapor paling lambat</option>
        </select>
      </>}>
      {!shown.length ? <EmptyBox msg={rows.length ? 'Tidak ada kejadian yang cocok dengan pencarian.' : 'Belum ada transaksi Keracunan Pangan MBG pada filter ini.'} /> : (
        <>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-left">No. laporan</th>
                  <th className="px-2 py-2 text-left">Tgl kejadian</th>
                  <th className="px-2 py-2 text-left">SPPG · sekolah · wilayah</th>
                  <th className="px-2 py-2 text-right">Terpapar</th>
                  <th className="px-2 py-2 text-right">Kasus</th>
                  <th className="px-2 py-2 text-right">Inap</th>
                  <th className="px-2 py-2 text-right">Mati</th>
                  <th className="px-2 py-2 text-right">AR</th>
                  <th className="px-2 py-2 text-right">Lapor</th>
                  <th className="px-2 py-2 text-center">Lab · status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-2 py-2"><Link href={`/keracunan-mbg/${r.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-bold text-primary hover:underline">{r.no_laporan || `#${r.id}`}<ExternalLink className="h-3 w-3" /></Link></td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-slate-600">{r.tgl_kejadian?.slice(0, 10) || '—'}<div className="text-[10px] text-slate-400">{r.tgl_kejadian?.slice(11, 16)}</div></td>
                    <td className="px-2 py-2"><div className="font-semibold text-slate-800">{r.nama_sppg || '—'}</div>{r.sekolah ? <div className="text-[10.5px] text-slate-500">{r.sekolah}</div> : null}<div className="text-[10.5px] text-slate-400">{[r.kecamatan, r.kabkota_name, r.province_name].filter(Boolean).join(', ') || '—'}</div></td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{r.jumlah_terpapar != null ? nf(r.jumlah_terpapar) : '—'}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-red-700">{nf(r.jumlah_kasus)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-700">{nf(r.rawat_inap)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-900">{nf(r.jumlah_meninggal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{pf(r.ar_pct)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${r.lapor_jam != null && r.lapor_jam > 24 ? 'font-bold text-red-700' : 'text-slate-600'}`} title="Selang kejadian → laporan dikirim">{r.lapor_jam != null ? fmtJam(r.lapor_jam) : '—'}</td>
                    <td className="px-2 py-2 text-center"><div className="flex flex-col items-center gap-1"><RekapBadge value={LAB_LABEL[r.lab_status] || r.lab_status} /><RekapBadge value={STATUS_LABEL[r.status] || r.status} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs">
              <button type="button" disabled={pg === 0} onClick={() => setPage(pg - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya</button>
              <span className="font-bold tabular-nums text-slate-600">Halaman {pg + 1} dari {pages}</span>
              <button type="button" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Berikutnya <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  )
}

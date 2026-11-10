'use client'
// PR 033: daftar kunjungan Pengawasan Gizi MBG — tab status, cari, paginasi, kemajuan 13 formulir, rekap F12/F13, hapus draf.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Eye, FilePlus2, Pencil, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import SearchInput from '@/components/SearchInput'
import { tableHeadCls, thCls, TableState } from '@/components/master/MasterUi'
import { useAuth } from '@/lib/skdr-auth'
import { MBG_API, MBG_HREF, mbgFetch, STATUS_CLS, STATUS_LABEL, type MbgListRow } from '@/lib/pengawasan-gizi/api'
import { KesBadge } from './MbgFields'

const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const actBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition'

export default function MbgList() {
  const { can } = useAuth()
  const [rows, setRows] = useState<MbgListRow[]>([])
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [del, setDel] = useState<MbgListRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (status !== 'all') qs.set('status', status)
      if (search.trim()) qs.set('search', search.trim())
      const j = await mbgFetch<{ data: MbgListRow[]; total: number; total_pages: number; by_status: Record<string, number> }>(`${MBG_API}?${qs}`)
      setRows(j.data); setTotal(j.total); setTotalPages(j.total_pages); setByStatus(j.by_status)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } finally { setLoading(false) }
  }, [status, search, page, perPage])
  useEffect(() => { load() }, [load])
  const allCount = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const doDelete = async () => {
    if (!del) return
    setDeleting(true)
    try {
      await mbgFetch(`${MBG_API}/${del.id}`, { method: 'DELETE' })
      toast.success(`Draf ${del.no_kunjungan} dihapus`)
      setDel(null); if (rows.length === 1 && page > 1) setPage(page - 1); else load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setDeleting(false) }
  }
  const input = can('pe_input')

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Transaksi" title="Pengawasan Gizi MBG" subtitle="Kunjungan pengawasan standar gizi Makan Bergizi Gratis ke SPPG oleh Tenaga Pelaksana Gizi Puskesmas — Formulir 1–13 dan rekapitulasi." actions={<>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
        </button>
        {input && (
          <Link href={`${MBG_HREF}/baru`} data-testid="mbg-add" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark">
            <FilePlus2 className="h-4 w-4" /> Tambah Kunjungan
          </Link>
        )}
      </>} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nomor, SPPG, pengawas, TPG, puskesmas, kab/kota…" />
        </div>
        <div className="flex flex-wrap gap-1">
          {['all', 'draf', 'dikirim'].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1) }}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${status === s ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'Semua' : STATUS_LABEL[s]} {s === 'all' ? allCount : byStatus[s] || 0}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs font-medium text-slate-500">Total: <span className="font-bold text-slate-800">{total.toLocaleString('id-ID')}</span></div>
      </div>

      <div>
        <div className="skdr-table-card overflow-x-auto">
          <table className="skdr-table text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>Nomor</th><th className={thCls}>Tanggal</th><th className={thCls}>SPPG · Pengawas Gizi</th><th className={thCls}>Puskesmas · TPG</th>
              <th className={thCls}>Formulir</th><th className={thCls}>Ketaatan (F12)</th><th className={thCls}>Daya Terima (F13)</th><th className={thCls}>Status</th><th className={thCls}>Diperbarui</th>
              <th className={`${thCls} text-right`}>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const draft = r.status === 'draf'
                const pct = Math.round((r.form_terkirim / 13) * 100)
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5"><Link href={`${MBG_HREF}/${r.id}${draft && input ? '' : '?mode=lihat'}`} className="font-mono font-semibold text-primary hover:underline">{r.no_kunjungan}</Link></td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{r.tanggal || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700"><span className="font-medium">{r.nama_sppg || '—'}</span>{r.nama_pengawas && <span className="block text-[10px] text-slate-400">{r.nama_pengawas}</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.puskesmas || '—'}<span className="block text-[10px] text-slate-400">{[r.kabkota, r.nama_tpg].filter(Boolean).join(' · ')}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div><span className="tabular-nums text-slate-600">{r.form_terkirim}/13</span></div>
                      {r.form_draf > 0 && <span className="text-[10px] text-amber-600">{r.form_draf} draf</span>}
                      {r.aspek_dinilai > 0 && <span className="block text-[10px] text-slate-400">{r.aspek_sesuai}/{r.aspek_dinilai} aspek sesuai</span>}
                    </td>
                    <td className="px-4 py-2.5"><KesBadge v={r.rekap_ketaatan} empty="—" /></td>
                    <td className="px-4 py-2.5"><KesBadge v={r.rekap_daya_terima} empty="—" /></td>
                    <td className="px-4 py-2.5"><span className={badge(STATUS_CLS[r.status] || '')}>{STATUS_LABEL[r.status] || r.status}</span>{r.error_count > 0 && <span className="block text-[10px] text-amber-600">identitas belum lengkap</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.updated_at ? `${r.updated_at} WIB` : '—'}{r.created_by_name && <span className="block font-sans text-[10px] text-slate-400">{r.created_by_name}</span>}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`${MBG_HREF}/${r.id}?mode=lihat`} title="Lihat (hanya baca)" aria-label={`Lihat ${r.no_kunjungan}`} className={`${actBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /></Link>
                        {draft && input && <Link href={`${MBG_HREF}/${r.id}`} title="Lanjutkan pengisian" aria-label={`Lanjutkan ${r.no_kunjungan}`} className={`${actBtn} border-primary/30 text-primary hover:bg-primary/5`}><Pencil className="h-3.5 w-3.5" /></Link>}
                        {draft && input && <button type="button" onClick={() => setDel(r)} title="Hapus draf" aria-label={`Hapus ${r.no_kunjungan}`} className={`${actBtn} border-red-200 text-red-600 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <TableState loading={loading} error={error} empty={rows.length === 0} />
        {rows.length > 0 && <Pagination page={page} totalPages={totalPages} total={total} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} onGoTo={setPage} pageSize={perPage} onPageSizeChange={(n: number) => { setPerPage(n); setPage(1) }} />}
      </div>

      <Modal open={!!del} title="Hapus draf kunjungan" onClose={() => !deleting && setDel(null)}>
        {del && <DeleteBody no={del.no_kunjungan} deleting={deleting} onCancel={() => setDel(null)} onConfirm={doDelete} />}
      </Modal>
    </div>
  )
}

export function DeleteBody({ no, deleting, onCancel, onConfirm }: { no: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-semibold">Hapus draf {no}?</p><p className="mt-1 text-xs">Kunjungan beserta seluruh formulir drafnya disembunyikan dari daftar (soft delete) dan tercatat di riwayat.</p></div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={deleting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
        <button type="button" onClick={onConfirm} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}</button>
      </div>
    </div>
  )
}

'use client'
// PR 030: daftar Laporan EBS / IBS (draf & terkirim): tab status, cari, paginasi, lanjutkan/lihat/hapus draf.
// PR 031: + Form Individu IBS; kolom EBS lebih lengkap (Tgl Laporan, Penyakit Terverifikasi, Status Kejadian, KLB), IBS + Petugas.
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
import { weeksOf, type FormDef } from '@/lib/laporan/engine'
import { lapFetch, STATUS_CLS, STATUS_LABEL } from '@/lib/laporan/api'

interface Row {
  id: number; no_laporan: string; status: string; unit: string | null; kabkota: string | null; error_count: number; created_by_name: string | null
  updated_at: string | null; tgl_laporan: string | null; tgl_rumor: string | null; penyakit: string | null; kasus: number | null; kematian: number | null
  tahun: number | null; minggu: number | null; kunjungan: number | null
  // EBS (PR 031)
  penyakit_terverifikasi?: string | null; status_kejadian?: string | null; klb?: string | null; klb_status?: string | null; jenis_unit?: string | null
  // IBS / Individu (PR 031)
  petugas?: string | null; nama_pasien?: string | null; kelamin?: string | null; umur?: string | null; penyakit_label?: string | null
  tgl_periksa?: string | null; status_akhir?: string | null; diagnosa?: string | null
}
const KEJADIAN_CLS = (s: string) => (s.startsWith('Terverifikasi') ? 'border-sky-200 bg-sky-50 text-sky-700' : s === 'Discarded' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-amber-200 bg-amber-50 text-amber-700')
const LP: Record<string, string> = { Pria: 'L', Wanita: 'P' }
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const actBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition'

export default function LaporanList({ def, subtitle }: { def: FormDef; subtitle: string }) {
  const { can } = useAuth()
  const ebs = def.jenis === 'ebs'
  const ind = def.jenis === 'individu'
  const [rows, setRows] = useState<Row[]>([])
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [del, setDel] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (status !== 'all') qs.set('status', status)
      if (search.trim()) qs.set('search', search.trim())
      const j = await lapFetch<{ data: Row[]; total: number; total_pages: number; by_status: Record<string, number> }>(`/api/v1/laporan/${def.jenis}?${qs}`)
      setRows(j.data); setTotal(j.total); setTotalPages(j.total_pages); setByStatus(j.by_status)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } finally { setLoading(false) }
  }, [def.jenis, status, search, page, perPage])
  useEffect(() => { load() }, [load])
  const allCount = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const doDelete = async () => {
    if (!del) return
    setDeleting(true)
    try {
      await lapFetch(`/api/v1/laporan/${def.jenis}/${del.id}`, { method: 'DELETE' })
      toast.success(`Draf ${del.no_laporan} dihapus`)
      setDel(null); if (rows.length === 1 && page > 1) setPage(page - 1); else load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setDeleting(false) }
  }
  const input = can('pe_input')

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow={def.eyebrow} title={def.listTitle} subtitle={subtitle} actions={<>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
        </button>
        {input && (
          <Link href={`${def.listHref}/baru`} data-testid="lap-add" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark">
            <FilePlus2 className="h-4 w-4" /> {def.addLabel}
          </Link>
        )}
      </>} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder={def.searchPlaceholder} />
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
              <th className={thCls}>Nomor</th>
              {ebs ? <><th className={thCls}>Tgl Laporan</th><th className={thCls}>Penyakit Rumor / Terverifikasi</th><th className={thCls}>Tgl Rumor</th><th className={thCls}>Kasus / Mati</th></>
                : ind ? <><th className={thCls}>Pasien</th><th className={thCls}>Penyakit Agregat</th><th className={thCls}>Tgl Periksa</th><th className={thCls}>Periode</th></>
                : <><th className={thCls}>Periode</th><th className={thCls}>Kasus / Mati</th><th className={thCls}>Kunjungan</th></>}
              <th className={thCls}>Unit · Wilayah</th>
              {ebs && <><th className={thCls}>Status Kejadian</th><th className={thCls}>KLB</th></>}<th className={thCls}>Status</th><th className={thCls}>Kelengkapan</th><th className={thCls}>Diperbarui</th>
              <th className={`${thCls} text-right`}>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const draft = r.status === 'draf'
                const wk = !ebs && r.tahun && r.minggu ? weeksOf(r.tahun)[r.minggu - 1] : null
                const periode = r.minggu ? <>Minggu {r.minggu}/{r.tahun}{wk && <span className="block text-[10px] text-slate-400">{wk.label}</span>}</> : '—'
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5"><Link href={`${def.listHref}/${r.id}${draft && input ? '' : '?mode=lihat'}`} className="font-mono font-semibold text-primary hover:underline">{r.no_laporan}</Link></td>
                    {ebs ? <>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_laporan || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.penyakit || '—'}
                        {r.penyakit_terverifikasi && r.penyakit_terverifikasi !== r.penyakit && <span className="block text-[10px] text-sky-700">Terverifikasi: {r.penyakit_terverifikasi}</span>}
                        {r.penyakit_terverifikasi && r.penyakit_terverifikasi === r.penyakit && <span className="block text-[10px] text-sky-700">✓ terverifikasi sama</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_rumor || '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.kasus ?? '—'} / <span className={(r.kematian ?? 0) > 0 ? 'font-semibold text-red-600' : ''}>{r.kematian ?? 0}</span></td>
                    </> : ind ? <>
                      <td className="px-4 py-2.5 text-slate-700"><span className="font-medium">{r.nama_pasien || '—'}</span>
                        {(r.kelamin || r.umur) && <span className="block text-[10px] text-slate-400">{[r.kelamin ? LP[r.kelamin] || r.kelamin : null, r.umur].filter(Boolean).join(' · ')}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{r.penyakit_label || r.penyakit || '—'}
                        {r.status_akhir === 'Meninggal' && <span className="block text-[10px] font-semibold text-red-600">Meninggal</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_periksa || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700">{periode}</td>
                    </> : <>
                      <td className="px-4 py-2.5 text-slate-700">{periode}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.kasus ?? 0} / {r.kematian ?? 0}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.kunjungan ?? '—'}</td>
                    </>}
                    <td className="px-4 py-2.5 text-slate-600">{r.unit || '—'}{r.kabkota ? <span className="block text-[10px] text-slate-400">{r.kabkota}</span> : ''}
                      {!ebs && r.petugas && <span className="block text-[10px] text-slate-400">Petugas: {r.petugas}</span>}
                      {ebs && r.jenis_unit && <span className="block text-[10px] text-slate-400">{r.jenis_unit}</span>}
                    </td>
                    {ebs && <>
                      <td className="px-4 py-2.5">{r.status_kejadian ? <span className={badge(KEJADIAN_CLS(r.status_kejadian))} title={r.status_kejadian}>{r.status_kejadian.length > 28 ? `${r.status_kejadian.slice(0, 26)}…` : r.status_kejadian}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5">{r.klb === 'Ya' ? <span className={badge('border-red-200 bg-red-50 text-red-700')}>KLB{r.klb_status ? ` · ${r.klb_status}` : ''}</span> : r.klb === 'Tidak' ? <span className="text-slate-500">Tidak</span> : <span className="text-slate-400">—</span>}</td>
                    </>}
                    <td className="px-4 py-2.5"><span className={badge(STATUS_CLS[r.status] || '')}>{STATUS_LABEL[r.status] || r.status}</span></td>
                    <td className="px-4 py-2.5">{r.error_count === 0 ? <span className="font-semibold text-emerald-600">Lengkap</span> : <span className="text-amber-600">{r.error_count} isian belum valid</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.updated_at ? `${r.updated_at} WIB` : '—'}{r.created_by_name && <span className="block font-sans text-[10px] text-slate-400">{r.created_by_name}</span>}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`${def.listHref}/${r.id}?mode=lihat`} title="Lihat (hanya baca)" aria-label={`Lihat ${r.no_laporan}`} className={`${actBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /></Link>
                        {draft && input && <Link href={`${def.listHref}/${r.id}`} title="Lanjutkan pengisian" aria-label={`Lanjutkan ${r.no_laporan}`} className={`${actBtn} border-primary/30 text-primary hover:bg-primary/5`}><Pencil className="h-3.5 w-3.5" /></Link>}
                        {draft && input && <button type="button" onClick={() => setDel(r)} title="Hapus draf" aria-label={`Hapus ${r.no_laporan}`} className={`${actBtn} border-red-200 text-red-600 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" /></button>}
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
      <p className="text-[11px] text-slate-400">Laporan disimpan di database SKDR Indonesia (lokal) — belum dikirim ke skdr.kemkes.go.id.</p>

      <Modal open={!!del} title="Hapus draf" onClose={() => !deleting && setDel(null)}>
        {del && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-semibold">Hapus draf {del.no_laporan}?</p><p className="mt-1 text-xs">Draf disembunyikan dari daftar (soft delete) dan tercatat di riwayat.</p></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDel(null)} disabled={deleting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" onClick={doDelete} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

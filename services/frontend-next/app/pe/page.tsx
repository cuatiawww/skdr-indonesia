'use client'
// PR 017: "Daftar PE" — seluruh laporan PE lintas penyakit (registri pe_form_definitions), dengan filter penyakit,
// status, pencarian, lihat/ubah/hapus (soft delete, hanya Draf) dan tambah PE per formulir.
import PageHeader from '@/components/PageHeader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Eye, FilePlus2, Pencil, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import SearchInput from '@/components/SearchInput'
import { tableHeadCls, thCls, TableState } from '@/components/master/MasterUi'
import { CLASS_STYLE, peFetch, STATUS_STYLE } from '@/lib/pe-api'
import { peFormLabel } from '@/lib/nav'

interface Row {
  id: number; no_pe: string; status: string; classification: string | null; overridden: boolean; patient_initials: string | null
  tgl_laporan: string | null; province: string | null; kabkota: string | null; updated_at: string | null; form_key: string | null
}
interface FormRow { form_key: string; title: string; cases: number }
interface FormInfo { schema: { classification?: { rules: { code: string; label: string }[]; fallback?: { code: string; label: string } } }; workflow: { status_labels: Record<string, string>; editable_status?: string[] } }

const STATUSES = ['all', 'draf', 'dikirim', 'dikembalikan', 'terverifikasi', 'final']
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const actBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition'

export default function DaftarPePage() {
  const [forms, setForms] = useState<FormRow[]>([])
  const [infos, setInfos] = useState<Record<string, FormInfo>>({})
  const [form, setForm] = useState('')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    peFetch<{ data: FormRow[] }>('/api/v1/pe/forms').then(async (j) => {
      setForms(j.data)
      const entries = await Promise.all(j.data.map((f) => peFetch<{ data: FormInfo }>(`/api/v1/pe/forms/${f.form_key}`).then((x) => [f.form_key, x.data] as const).catch(() => null)))
      setInfos(Object.fromEntries(entries.filter(Boolean) as [string, FormInfo][]))
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => {
    if (!addOpen) return
    const h = (e: MouseEvent) => { if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ status, page: String(page), per_page: String(perPage) })
      if (form) qs.set('form', form)
      if (search.trim()) qs.set('search', search.trim())
      const j = await peFetch<{ data: Row[]; total: number; total_pages: number; by_status: Record<string, number> }>(`/api/v1/pe/cases?${qs}`)
      setRows(j.data); setTotal(j.total); setTotalPages(j.total_pages); setByStatus(j.by_status)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } finally { setLoading(false) }
  }, [form, status, search, page, perPage])
  useEffect(() => { load() }, [load])

  const formName = useMemo(() => Object.fromEntries(forms.map((f) => [f.form_key, peFormLabel(f.title)])), [forms])
  const anyInfo = Object.values(infos)[0]
  const statusLabel = (s: string) => (s === 'all' ? 'Semua status' : anyInfo?.workflow.status_labels?.[s] || s)
  const classLabel = (fk: string | null, c: string) => {
    const cl = fk ? infos[fk]?.schema.classification : undefined
    return [...(cl?.rules || []), ...(cl?.fallback ? [cl.fallback] : [])].find((x) => x.code === c)?.label || c
  }
  const editable = (r: Row) => (r.form_key && infos[r.form_key]?.workflow.editable_status) || ['draf', 'dikembalikan']
  const allCount = Object.values(byStatus).reduce((a, b) => a + b, 0)

  const doDelete = async () => {
    if (!del) return
    setDeleting(true)
    try {
      await peFetch(`/api/v1/pe/cases/${del.id}`, { method: 'DELETE' })
      toast.success(`PE ${del.no_pe} berhasil dihapus`)
      setDel(null); if (rows.length === 1 && page > 1) setPage(page - 1); else load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setDeleting(false) }
  }

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="pe-daftar">
      <PageHeader eyebrow="Penyelidikan Epidemiologi" title="Daftar Penyelidikan Epidemiologi" subtitle="Seluruh laporan PE dari semua formulir penyakit yang terdaftar." actions={<>

          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <div ref={addRef} className="relative">
            <button type="button" aria-haspopup="true" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)} onKeyDown={(e) => e.key === 'Escape' && setAddOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-primary-dark">
              <FilePlus2 className="h-4 w-4" /> Tambah PE <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {addOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 skdr-card p-1.5 shadow-xs" onKeyDown={(e) => e.key === 'Escape' && setAddOpen(false)}>
                {forms.map((f) => <Link key={f.form_key} href={`/pe/${f.form_key}/baru`} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">{peFormLabel(f.title)}</Link>)}
              </div>
            )}
          </div>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {forms.map((f) => (
          <button key={f.form_key} type="button" onClick={() => { setForm(form === f.form_key ? '' : f.form_key); setPage(1) }} aria-pressed={form === f.form_key}
            className={`rounded-2xl border bg-white px-4 py-3 text-left transition ${form === f.form_key ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 hover:border-primary/40'}`}>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{peFormLabel(f.title)}</span>
            <span className="mt-1 block text-2xl font-extrabold text-slate-900">{f.cases.toLocaleString('id-ID')}</span>
            <span className="block text-[11px] text-slate-400">laporan PE</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b skdr-rule pb-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari No. PE, nama pasien, atau kab/kota" />
        </div>
        <select aria-label="Filter penyakit" value={form} onChange={(e) => { setForm(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700">
          <option value="">Semua penyakit</option>
          {forms.map((f) => <option key={f.form_key} value={f.form_key}>{peFormLabel(f.title)}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1) }}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${status === s ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {statusLabel(s)} {s === 'all' ? allCount : byStatus[s] || 0}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs font-medium text-slate-500">Total: <span className="font-bold text-slate-800">{total.toLocaleString('id-ID')}</span></div>
      </div>

      <div>
        <div className="skdr-table-card">
          <table className="skdr-table text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>No. PE</th><th className={thCls}>Penyakit</th><th className={thCls}>Pasien</th><th className={thCls}>Wilayah</th>
              <th className={thCls}>Tgl. Laporan</th><th className={thCls}>Klasifikasi</th><th className={thCls}>Status</th><th className={thCls}>Diperbarui</th>
              <th className={`${thCls} text-right`}>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const fk = r.form_key || ''
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5"><Link href={`/pe/${fk}/${r.id}?mode=lihat`} className="font-mono font-semibold text-primary hover:underline">{r.no_pe}</Link></td>
                    <td className="px-4 py-2.5 text-slate-700">{formName[fk] || fk || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.patient_initials || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.kabkota || '—'}{r.province ? <span className="text-slate-400"> · {r.province}</span> : ''}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_laporan || '—'}</td>
                    <td className="px-4 py-2.5">{r.classification ? <span className={badge(CLASS_STYLE[r.classification] || '')}>{classLabel(r.form_key, r.classification)}{r.overridden ? ' *' : ''}</span> : <span className="text-slate-400">Belum diklasifikasi</span>}</td>
                    <td className="px-4 py-2.5"><span className={badge(STATUS_STYLE[r.status] || '')}>{statusLabel(r.status)}</span></td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.updated_at ? `${r.updated_at} WIB` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/pe/${fk}/${r.id}?mode=lihat`} title="Lihat (hanya baca)" aria-label={`Lihat ${r.no_pe}`} className={`${actBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /></Link>
                        {editable(r).includes(r.status)
                          ? <Link href={`/pe/${fk}/${r.id}`} title="Ubah" aria-label={`Ubah ${r.no_pe}`} className={`${actBtn} border-primary/30 text-primary hover:bg-primary/5`}><Pencil className="h-3.5 w-3.5" /></Link>
                          : <span title={`Tidak dapat diubah: status ${statusLabel(r.status)}`} aria-disabled="true" className={`${actBtn} cursor-not-allowed border-slate-100 text-slate-300`}><Pencil className="h-3.5 w-3.5" /></span>}
                        {r.status === 'draf'
                          ? <button type="button" onClick={() => setDel(r)} title="Hapus" aria-label={`Hapus ${r.no_pe}`} className={`${actBtn} border-red-200 text-red-600 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" /></button>
                          : <span title="Hanya PE berstatus Draf yang dapat dihapus" aria-disabled="true" className={`${actBtn} cursor-not-allowed border-slate-100 text-slate-300`}><Trash2 className="h-3.5 w-3.5" /></span>}
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
      <p className="text-[11px] text-slate-400">Nama pasien ditampilkan sebagai inisial. Data lengkap hanya tersedia pada halaman detail.</p>
      <Modal open={!!del} title="Hapus PE" onClose={() => !deleting && setDel(null)}>
        {del && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Yakin menghapus PE ini?</p>
                <p className="mt-1 text-xs">No. PE <span className="font-mono font-bold">{del.no_pe}</span> · {formName[del.form_key || ''] || ''} · {del.kabkota || '—'}</p>
                <p className="mt-1 text-xs">Data disembunyikan dari daftar (soft delete) dan tercatat di riwayat audit.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDel(null)} disabled={deleting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" onClick={doDelete} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

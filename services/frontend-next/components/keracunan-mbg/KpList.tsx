'use client'
// PR 034: daftar kejadian Keracunan Pangan MBG — kartu ringkasan, tab status (Draf → Dilaporkan → Menunggu Lab → Hasil Lab → Ditutup),
// filter wilayah & tanggal, cari, ekspor CSV, paginasi, hapus draf.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, TriangleAlert, Eye, FilePlus2, FlaskConical, HeartPulse, Pencil, RefreshCw, Search, Skull, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import SearchInput from '@/components/SearchInput'
import SearchSelect from '@/components/ui/SearchSelect'
import { inputCls, tableHeadCls, thCls, TableState } from '@/components/master/MasterUi'
import { useAuth } from '@/lib/skdr-auth'
import { useGeo } from '@/lib/laporan/api'
import { exportUrl, KP_API, KP_HREF, kpFetch, STATUS_CLS, STATUS_LABEL, viewStatus, type KpListRow, type KpSummary } from '@/lib/keracunan-mbg/api'

const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`
const actBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition'
const TABS = ['all', 'aktif', 'draf', 'dilaporkan', 'menunggu_lab', 'hasil_lab', 'ditutup'] as const
const TAB_LABEL: Record<string, string> = { all: 'Semua', aktif: 'Aktif', ...STATUS_LABEL }

export default function KpList() {
  const { can } = useAuth()
  const geo = useGeo()
  const [rows, setRows] = useState<KpListRow[]>([])
  const [sum, setSum] = useState<KpSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [prov, setProv] = useState<string | null>(null)
  const [kab, setKab] = useState<string | null>(null)
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [del, setDel] = useState<KpListRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { geo.loadProvinces() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prov) geo.loadKab(prov) }, [prov]) // eslint-disable-line react-hooks/exhaustive-deps
  const filterQs = useCallback(() => {
    const qs = new URLSearchParams()
    if (status !== 'all') qs.set('status', status)
    if (search.trim()) qs.set('search', search.trim())
    if (prov) qs.set('provinsi_id', prov)
    if (kab) qs.set('kabkota_id', kab)
    if (dari) qs.set('dari', dari)
    if (sampai) qs.set('sampai', sampai)
    return qs
  }, [status, search, prov, kab, dari, sampai])
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = filterQs(); qs.set('page', String(page)); qs.set('per_page', String(perPage))
      const j = await kpFetch<{ data: KpListRow[]; total: number; total_pages: number; summary: KpSummary }>(`${KP_API}?${qs}`)
      setRows(j.data); setTotal(j.total); setTotalPages(j.total_pages); setSum(j.summary)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } finally { setLoading(false) }
  }, [filterQs, page, perPage])
  useEffect(() => { load() }, [load])
  const doDelete = async () => {
    if (!del) return
    setDeleting(true)
    try {
      await kpFetch(`${KP_API}/${del.id}`, { method: 'DELETE' })
      toast.success(`Draf ${del.no_laporan} dihapus`)
      setDel(null); if (rows.length === 1 && page > 1) setPage(page - 1); else load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setDeleting(false) }
  }
  const input = can('pe_input')
  const tabCount = (s: string) => (!sum ? 0 : s === 'all' ? sum.draf + sum.kejadian : (sum as any)[s] ?? 0)
  const card = (label: string, val: number | undefined, sub: string, Icon: any, tone: string, tab?: string) => (
    <button type="button" onClick={() => { if (tab) { setStatus(tab); setPage(1) } }} className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-2xs transition ${tab && status === tab ? 'border-primary ring-1 ring-primary/20' : 'border-slate-200 hover:border-slate-300'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span><span className="block text-xl font-bold tabular-nums text-slate-800">{(val ?? 0).toLocaleString('id-ID')}</span><span className="block truncate text-[10px] text-slate-400">{sub}</span></span>
    </button>
  )

  return (
    <div className="skdr-page w-full bg-page px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Program MBG" title="Keracunan Pangan MBG" subtitle="Laporan kejadian keracunan pangan Makan Bergizi Gratis — laporan cepat, update kasus harian, hasil laboratorium hingga kejadian ditutup." actions={<>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
        </button>
        <a href={exportUrl(filterQs())} download className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50" data-testid="kp-export">
          <Download className="h-3.5 w-3.5" /> Ekspor CSV
        </a>
        {input && (
          <Link href={`${KP_HREF}/baru`} data-testid="kp-add" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark">
            <FilePlus2 className="h-4 w-4" /> Lapor Kejadian
          </Link>
        )}
      </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {card('Kejadian', sum?.kejadian, 'dilaporkan (tanpa draf)', AlertTriangle, 'bg-amber-50 text-amber-600')}
        {card('Kasus', sum?.kasus, 'total orang sakit', Users, 'bg-primary/10 text-primary')}
        {card('Meninggal', sum?.meninggal, 'total kematian', Skull, 'bg-red-50 text-red-600')}
        {card('Aktif', sum?.aktif, 'belum ditutup', HeartPulse, 'bg-sky-50 text-sky-600', 'aktif')}
        {card('Menunggu Lab', sum?.menunggu_lab, `${sum?.hasil_lab ?? 0} sudah ada hasil`, FlaskConical, 'bg-violet-50 text-violet-600', 'menunggu_lab')}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Cari nomor, SPPG, yayasan, sekolah, kecamatan, desa…" />
        </div>
        <div className="w-48"><SearchSelect options={geo.provinces || []} value={prov} placeholder="Semua provinsi" ariaLabel="Filter provinsi" onOpen={geo.loadProvinces} onChange={(x) => { setProv(x); setKab(null); setPage(1) }} /></div>
        <div className="w-48"><SearchSelect options={prov ? geo.kab[prov] || [] : []} value={kab} disabled={!prov} disabledHint="Pilih provinsi dulu" placeholder="Semua kab/kota" ariaLabel="Filter kab/kota" onChange={(x) => { setKab(x); setPage(1) }} /></div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">Kejadian
          <input type="date" aria-label="Dari tanggal" className={`${inputCls} w-[140px] py-1.5`} value={dari} onChange={(e) => { setDari(e.target.value); setPage(1) }} />–
          <input type="date" aria-label="Sampai tanggal" className={`${inputCls} w-[140px] py-1.5`} value={sampai} onChange={(e) => { setSampai(e.target.value); setPage(1) }} />
        </label>
        <div className="flex w-full flex-wrap gap-1">
          {TABS.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1) }}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${status === s ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {TAB_LABEL[s]} {tabCount(s)}
            </button>
          ))}
          <span className="ml-auto self-center text-xs font-medium text-slate-500">Total: <span className="font-bold text-slate-800">{total.toLocaleString('id-ID')}</span></span>
        </div>
      </div>

      <div>
        <div className="skdr-table-card overflow-x-auto">
          <table className="skdr-table text-left text-xs">
            <thead><tr className={tableHeadCls}>
              <th className={thCls}>Nomor</th><th className={thCls}>Kejadian</th><th className={thCls}>SPPG · Sekolah</th><th className={thCls}>Wilayah</th>
              <th className={`${thCls} text-right`}>Kasus</th><th className={`${thCls} text-right`}>Meninggal</th><th className={`${thCls} text-right`}>AR</th>
              <th className={thCls}>Status</th><th className={thCls}>Update terakhir</th><th className={`${thCls} text-right`}>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const vs = viewStatus(r.status, r.lab_status)
                const draft = r.status === 'draf'
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5"><Link href={draft && input ? `${KP_HREF}/${r.id}/s1` : `${KP_HREF}/${r.id}`} className="font-mono font-semibold text-primary hover:underline">{r.no_laporan}</Link></td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_kejadian || '—'}{r.tgl_lapor && <span className="block font-sans text-[10px] text-slate-400">dilaporkan {r.tgl_lapor}</span>}</td>
                    <td className="max-w-[260px] px-4 py-2.5 text-slate-700"><span className="font-medium">{r.nama_sppg || '—'}</span>{r.sekolah && <span className="block truncate text-[10px] text-slate-400" title={r.sekolah}>{r.sekolah}</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.kabkota || r.provinsi || '—'}<span className="block text-[10px] text-slate-400">{[r.kecamatan, r.desa].filter(Boolean).join(' · ') || (r.kabkota ? r.provinsi : '')}</span></td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">{r.kasus ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.meninggal ? 'font-bold text-red-600' : 'text-slate-500'}`}>{r.meninggal ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.ar !== null ? `${String(r.ar).replace('.', ',')}%` : '—'}</td>
                    <td className="px-4 py-2.5"><span className={badge(STATUS_CLS[vs] || '')}>{STATUS_LABEL[vs] || vs}</span>{r.error_count > 0 && <span className="block text-[10px] text-amber-600">{r.error_count} isian belum valid</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.update_terakhir || '—'}{r.created_by_name && <span className="block font-sans text-[10px] text-slate-400">{r.created_by_name}</span>}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Link href={`${KP_HREF}/${r.id}`} title="Ringkasan kejadian" aria-label={`Lihat ${r.no_laporan}`} className={`${actBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /></Link>
                        {input && r.status !== 'ditutup' && <Link href={`${KP_HREF}/${r.id}/s1`} title={draft ? 'Lanjutkan pengisian' : 'Lengkapi laporan'} aria-label={`Ubah ${r.no_laporan}`} className={`${actBtn} border-primary/30 text-primary hover:bg-primary/5`}><Pencil className="h-3.5 w-3.5" /></Link>}
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

      <Modal open={!!del} title="Hapus draf laporan" onClose={() => !deleting && setDel(null)}>
        {del && <DeleteBody no={del.no_laporan} deleting={deleting} onCancel={() => setDel(null)} onConfirm={doDelete} />}
      </Modal>
    </div>
  )
}

function DeleteBody({ no, deleting, onCancel, onConfirm }: { no: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-semibold">Hapus draf {no}?</p><p className="mt-1 text-xs">Draf laporan disembunyikan dari daftar (soft delete) dan tercatat di riwayat. Laporan yang sudah dikirim tidak dapat dihapus.</p></div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={deleting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
        <button type="button" onClick={onConfirm} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}</button>
      </div>
    </div>
  )
}

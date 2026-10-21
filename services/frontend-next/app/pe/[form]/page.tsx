'use client'
// PR 006: list page per PE form (Lepto, Rabies, Antraks, AI): status tabs, classification filter, search, pagination;
// tab "Klaster/KLB" lists clusters with case counts and monitoring status.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Eye, FilePlus2, Pencil, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import SearchInput from '@/components/SearchInput'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { tableHeadCls, thCls, TableState } from '@/components/master/MasterUi'
import { CLASS_STYLE, peFetch, STATUS_STYLE } from '@/lib/pe-api'

interface Row {
  id: number; no_pe: string; status: string; classification: string | null; overridden: boolean; patient_initials: string | null
  tgl_laporan: string | null; tgl_pe: string | null; onset_date: string | null; province: string | null; kabkota: string | null
  outcome: string | null; updated_at: string | null; error_count: number; form_version: number; cluster_code: string | null
}
interface FormInfo { title: string; version: number; schema: { classification?: { rules: { code: string; label: string }[]; fallback?: { code: string; label: string } } }; workflow: { status_labels: Record<string, string>; editable_status?: string[] } }
interface Cluster { id: number; code: string; name: string; province: string | null; kabkota: string | null; tgl_rumor: string | null; status: string; monitoring: Record<string, any>; cases: number; updated_at: string | null }

const STATUSES = ['all', 'draf', 'dikirim', 'dikembalikan', 'terverifikasi', 'final']
const badge = (cls: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`

export default function PeListPage() {
  const { t } = useTranslation()
  const { form } = useParams<{ form: string }>()
  const [info, setInfo] = useState<FormInfo | null>(null)
  const [infoErr, setInfoErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'pe' | 'klaster'>('pe')
  const [rows, setRows] = useState<Row[]>([])
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('all')
  const [klass, setKlass] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [clusters, setClusters] = useState<Cluster[]>([])
  // PR 011: district filter + soft delete
  const [prov, setProv] = useState('')
  const [kab, setKab] = useState('')
  const [provinces, setProvinces] = useState<{ id: number; name: string }[]>([])
  const [kabs, setKabs] = useState<{ id: number; name: string }[]>([])
  const [del, setDel] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { peFetch<{ data: { id: number; name: string }[] }>('/api/v1/master/provinces').then((j) => setProvinces(j.data)).catch(() => {}) }, [])
  useEffect(() => {
    setKabs([]); if (!prov) return
    peFetch<{ data: { id: number; name: string }[] }>(`/api/v1/master/kabkota?province_id=${prov}`).then((j) => setKabs(j.data)).catch(() => {})
  }, [prov])

  useEffect(() => { peFetch<{ data: FormInfo }>(`/api/v1/pe/forms/${form}`).then((j) => setInfo({ ...j.data, title: (j.data as any).schema.title })).catch((e) => setInfoErr(e.message)) }, [form])
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ form, status, classification: klass, page: String(page), per_page: String(perPage) })
      if (search.trim()) qs.set('search', search.trim())
      if (prov) qs.set('province_id', prov)
      if (kab) qs.set('kabkota_id', kab)
      const j = await peFetch<{ data: Row[]; total: number; total_pages: number; by_status: Record<string, number> }>(`/api/v1/pe/cases?${qs}`)
      setRows(j.data); setTotal(j.total); setTotalPages(j.total_pages); setByStatus(j.by_status)
      const c = await peFetch<{ data: Cluster[] }>(`/api/v1/pe/clusters?form=${form}`)
      setClusters(c.data)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } finally { setLoading(false) }
  }, [form, status, klass, search, page, perPage, prov, kab])
  useEffect(() => { load() }, [load])

  if (infoErr) return <div className="w-full p-8 text-sm text-red-600">{t('skdr.master.loadFailed')}: {infoErr}</div>
  const classes = info?.schema.classification ? [...info.schema.classification.rules, ...(info.schema.classification.fallback ? [info.schema.classification.fallback] : [])] : []
  const classLabel = (c: string | null) => classes.find((x) => x.code === c)?.label || t('skdr.pe.classPending')
  const statusLabel = (s: string) => (s === 'all' ? t('skdr.pe.allStatus') : info?.workflow.status_labels?.[s] || s)
  const allCount = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const editableSt = info?.workflow.editable_status || ['draf', 'dikembalikan']
  const doDelete = async () => {
    if (!del) return
    setDeleting(true)
    try {
      await peFetch(`/api/v1/pe/cases/${del.id}`, { method: 'DELETE' })
      toast.success(`PE ${del.no_pe} berhasil dihapus`)
      setDel(null); if (rows.length === 1 && page > 1) setPage(page - 1); else load()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setDeleting(false) }
  }
  const actBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition'

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{info?.title || t('skdr.pe.formPe')}</h1>
            <p className="text-xs text-slate-500">{t('skdr.pe.listSubtitle', { v: info?.version ?? '—' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('skdr.master.refresh')}
          </button>
          <Link href={`/pe/${form}/baru`} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-[#004b85]">
            <FilePlus2 className="h-4 w-4" /> {t('skdr.pe.addPe')}
          </Link>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['pe', 'klaster'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-xs font-bold uppercase tracking-wider ${tab === k ? 'border-[#0060A9] text-[#0060A9]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {k === 'pe' ? t('skdr.pe.tabPe', { n: allCount }) : t('skdr.pe.tabCluster', { n: clusters.length })}
          </button>
        ))}
      </div>

      {tab === 'pe' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder={t('skdr.pe.searchPh')} />
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => { setStatus(s); setPage(1) }}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${status === s ? 'border-[#0060A9] bg-[#0060A9] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {statusLabel(s)} {s === 'all' ? allCount : byStatus[s] || 0}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>{t('skdr.pe.classification')}</span>
              <select value={klass} onChange={(e) => { setKlass(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold normal-case text-slate-700">
                <option value="all">{t('skdr.pe.allClass')}</option>
                {classes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                <option value="belum">{t('skdr.pe.classPending')}</option>
              </select>
            </label>
            <select aria-label="Filter provinsi" value={prov} onChange={(e) => { setProv(e.target.value); setKab(''); setPage(1) }} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700">
              <option value="">Semua provinsi</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select aria-label="Filter kabupaten/kota" value={kab} disabled={!prov} onChange={(e) => { setKab(e.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50">
              <option value="">{prov ? 'Semua kab/kota' : 'Pilih provinsi dulu'}</option>
              {kabs.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <div className="ml-auto text-xs font-medium text-slate-500">{t('skdr.pe.total')}: <span className="font-bold text-slate-800">{total.toLocaleString('id-ID')}</span></div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className={tableHeadCls}>
                  <th className={thCls}>{t('skdr.pe.noPe')}</th><th className={thCls}>{t('skdr.pe.patient')}</th><th className={thCls}>{t('skdr.pe.region')}</th>
                  <th className={thCls}>{t('skdr.pe.tglLaporan')}</th><th className={thCls}>{t('skdr.pe.onset')}</th><th className={thCls}>{t('skdr.pe.classification')}</th>
                  <th className={thCls}>{t('skdr.pe.cluster')}</th><th className={thCls}>{t('skdr.pe.outcome')}</th><th className={thCls}>{t('skdr.master.status')}</th>
                  <th className={thCls}>{t('skdr.pe.completeness')}</th><th className={thCls}>{t('skdr.pe.updated')}</th>
                  <th className={`${thCls} text-right`}>Aksi</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/30">
                      <td className="px-4 py-2.5"><Link href={`/pe/${form}/${r.id}`} className="font-mono font-semibold text-[#0060A9] hover:underline">{r.no_pe}</Link></td>
                      <td className="px-4 py-2.5 text-slate-700">{r.patient_initials || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.kabkota || '—'}{r.province ? <span className="text-slate-400"> · {r.province}</span> : ''}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.tgl_laporan || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.onset_date || '—'}</td>
                      <td className="px-4 py-2.5">{r.classification ? <span className={badge(CLASS_STYLE[r.classification] || '')}>{classLabel(r.classification)}{r.overridden ? ' *' : ''}</span> : <span className="text-slate-400">{t('skdr.pe.classPending')}</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{r.cluster_code || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.outcome || '—'}</td>
                      <td className="px-4 py-2.5"><span className={badge(STATUS_STYLE[r.status] || '')}>{statusLabel(r.status)}</span></td>
                      <td className="px-4 py-2.5">{r.error_count === 0 ? <span className="font-semibold text-emerald-600">{t('skdr.pe.complete')}</span> : <span className="text-amber-600">{t('skdr.pe.stepIssues', { n: r.error_count })}</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{r.updated_at ? `${r.updated_at} WIB` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Link href={`/pe/${form}/${r.id}?mode=lihat`} title="Lihat (hanya baca)" aria-label={`Lihat ${r.no_pe}`} className={`${actBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Eye className="h-3.5 w-3.5" /></Link>
                          {editableSt.includes(r.status) ? (
                            <Link href={`/pe/${form}/${r.id}`} title="Edit" aria-label={`Edit ${r.no_pe}`} className={`${actBtn} border-[#0060A9]/30 text-[#0060A9] hover:bg-[#0060A9]/5`}><Pencil className="h-3.5 w-3.5" /></Link>
                          ) : (
                            <span title={`Tidak dapat diedit: status ${statusLabel(r.status)}. Minta verifikator mengembalikan PE untuk revisi.`} aria-label={`Edit ${r.no_pe} tidak tersedia`} aria-disabled="true"
                              className={`${actBtn} cursor-not-allowed border-slate-100 text-slate-300`}><Pencil className="h-3.5 w-3.5" /></span>
                          )}
                          {r.status === 'draf' ? (
                            <button type="button" onClick={() => setDel(r)} title="Hapus" aria-label={`Hapus ${r.no_pe}`} className={`${actBtn} border-red-200 text-red-600 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" /></button>
                          ) : (
                            <span title="Hanya PE berstatus Draf yang dapat dihapus" aria-disabled="true" className={`${actBtn} cursor-not-allowed border-slate-100 text-slate-300`}><Trash2 className="h-3.5 w-3.5" /></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TableState loading={loading} error={error} empty={rows.length === 0} />
            {rows.length > 0 && <Pagination page={page} totalPages={totalPages} total={total} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} onGoTo={setPage} pageSize={perPage} onPageSizeChange={(n: number) => { setPerPage(n); setPage(1) }} />}
          </div>
          <p className="text-[11px] text-slate-400">{t('skdr.pe.privacyNote')}</p>
          <Modal open={!!del} title="Hapus PE" onClose={() => !deleting && setDel(null)}>
            {del && (
              <div className="space-y-4" data-testid="pe-delete-modal">
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Yakin menghapus PE ini?</p>
                    <p className="mt-1 text-xs">No. PE <span className="font-mono font-bold">{del.no_pe}</span> · Pasien <span className="font-bold">{del.patient_initials || '—'}</span> · {del.kabkota || '—'}</p>
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
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className={tableHeadCls}>
                <th className={thCls}>{t('skdr.pe.clusterCode')}</th><th className={thCls}>{t('skdr.pe.clusterName')}</th><th className={thCls}>{t('skdr.pe.region')}</th>
                <th className={thCls}>{t('skdr.pe.tglRumor')}</th><th className={`${thCls} text-right`}>{t('skdr.pe.casesLinked')}</th><th className={thCls}>{t('skdr.pe.monitoring')}</th>
                <th className={thCls}>{t('skdr.master.status')}</th><th className={thCls}>{t('skdr.pe.updated')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {clusters.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">{t('skdr.pe.noClusters')}</td></tr>}
                {clusters.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/30">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{c.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.kabkota || '—'}{c.province ? <span className="text-slate-400"> · {c.province}</span> : ''}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{c.tgl_rumor || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{c.cases}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.monitoring && c.monitoring.n1 != null ? t('skdr.pe.monitoringN', { n1: c.monitoring.n1 }) : '—'}</td>
                    <td className="px-4 py-2.5">{c.status === 'aktif' ? t('skdr.pe.clusterActive') : t('skdr.pe.clusterDone')}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{c.updated_at ? `${c.updated_at} WIB` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

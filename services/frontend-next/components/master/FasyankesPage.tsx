'use client'
// PR 019: Master Puskesmas / Rumah Sakit — SATUSEHAT Master Sarana Index, synced into master_fasyankes.
// Jenis slugs/labels come from app_settings.fasyankes_sync; filters: cari, Provinsi, Kab/Kota; shared table-card style.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import MultiSelect from '@/components/filters/MultiSelect'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { fetchFrom, postTo } from '@/lib/api'
import { fetchProvinces, type MasterKabkota, type MasterProvince } from '@/lib/skdr-api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { inputCls } from '@/components/master/MasterUi'

type Row = { kode_satusehat: string; kode_sarana: string | null; nama: string; jenis: string | null; subjenis: string | null; kelas: string | null
  provinsi: string | null; kabkota: string | null; kecamatan: string | null; alamat: string | null; latitude: number | null; longitude: number | null
  status_aktif: boolean | null; operasional: boolean | null; status_sarana: string | null; synced_at: string }
type Status = { running: boolean; environment: string; credentials_set: boolean; jenis: { kode: string; label: string; slug: string }[]
  counts: { jenis_kode: string | null; total: number; last_synced: string | null }[]; logs: { id: number; status: string; started_at: string; finished_at: string | null; pages: number; upserted: number; message: string | null }[] }

const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export default function FasyankesPage({ jenis }: { jenis: string }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [prov, setProv] = useState<string[]>([])
  const [kab, setKab] = useState<string[]>([])
  const [provinces, setProvinces] = useState<MasterProvince[]>([])
  const [kabkota, setKabkota] = useState<MasterKabkota[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    fetchProvinces().then(setProvinces).catch(() => setProvinces([]))
    fetchFrom<MasterKabkota[]>('/api/v1/master/kabkota').then(setKabkota).catch(() => setKabkota([]))
  }, [])
  useEffect(() => { const h = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(h) }, [q])
  useEffect(() => {
    let alive = true
    fetchFrom<Status>('/api/v1/admin/fasyankes/status').then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null))
    return () => { alive = false }
  }, [tick])
  useEffect(() => {
    let alive = true
    setErr('')
    const qs = new URLSearchParams({ jenis, page: String(page), limit: String(limit) })
    if (term) qs.set('q', term)
    if (prov.length) qs.set('province_id', prov.join(','))
    if (kab.length) qs.set('kabkota_id', kab.join(','))
    fetch(`${PUBLIC_BASE_PATH}/api/v1/master/fasyankes?${qs}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!alive) return
      if (!j?.success) { setErr(j?.error || t('skdr.state.error')); setRows([]); return }
      setRows(j.data); setTotal(j.meta?.total ?? 0)
    }).catch(() => alive && (setErr(t('skdr.state.error')), setRows([])))
    return () => { alive = false }
  }, [jenis, page, limit, term, prov, kab, tick, t])

  const cfgJenis = status?.jenis.find((j) => j.slug === jenis)
  const count = status?.counts.find((c) => c.jenis_kode === cfgJenis?.kode)
  const last = status?.logs[0]
  const kabOptions = useMemo(() => {
    const ps = new Set(prov.map(Number))
    return kabkota.filter((k) => ps.size === 0 || ps.has(k.province_id)).map((k) => ({ value: String(k.id), label: k.name, group: k.province_name }))
  }, [kabkota, prov])
  const ms = { searchPlaceholder: t('skdr.filter.search'), selectAllLabel: t('skdr.filter.selectAll'), clearLabel: t('skdr.filter.clear'), emptyLabel: t('skdr.filter.noOptions') }
  const sync = async () => {
    try {
      await postTo('/api/v1/admin/fasyankes/sync', { jenis: [jenis] })
      toast.success(t('skdr.fasyankes.syncStarted'))
      setTimeout(() => setTick((x) => x + 1), 1500)
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }
  const title = t(jenis === 'puskesmas' ? 'skdr.fasyankes.titlePkm' : 'skdr.fasyankes.titleRs')
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid={`fasyankes-${jenis}`}>
      <PageHeader eyebrow={t('skdr.fasyankes.eyebrow')} title={title}
        subtitle={t(jenis === 'puskesmas' ? 'skdr.fasyankes.subtitlePkm' : 'skdr.fasyankes.subtitleRs')}
        actions={<button type="button" onClick={sync} disabled={!status?.credentials_set || status?.running}
          title={status && !status.credentials_set ? t('skdr.fasyankes.noCreds') : undefined}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-xs font-bold text-brand-800 hover:bg-brand-50 disabled:opacity-50" data-testid="fasyankes-sync">
          <RefreshCw className={`h-4 w-4 ${status?.running ? 'animate-spin' : ''}`} />{status?.running ? t('skdr.fasyankes.syncing') : t('skdr.fasyankes.sync')}</button>} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600" data-testid="fasyankes-meta">
        <span>{t('skdr.fasyankes.stored', { n: (count?.total ?? 0).toLocaleString('id-ID') })}</span>
        <span>{t('skdr.fasyankes.lastSync', { d: dt(count?.last_synced) })}</span>
        {last ? <span>{t('skdr.fasyankes.lastRun', { status: last.status, n: last.upserted.toLocaleString('id-ID') })}{last.message ? ` — ${last.message}` : ''}</span> : null}
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700">{t('skdr.fasyankes.search')}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('skdr.fasyankes.searchPh')} className={inputCls} data-testid="fasyankes-search" /></label>
        <div className="flex flex-col gap-1.5"><span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700">{t('skdr.filter.province')}</span>
          <MultiSelect id="fk-prov" options={provinces.map((p) => ({ value: String(p.id), label: p.name }))} value={prov} {...ms}
            onChange={(v) => { setProv(v); setKab([]); setPage(1) }} allLabel={t('skdr.filter.allProvincesMs')} countLabel={(n) => t('skdr.filter.nProvinces', { n })} /></div>
        <div className="flex flex-col gap-1.5"><span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700">{t('skdr.filter.kabkota')}</span>
          <MultiSelect id="fk-kab" options={kabOptions} value={kab} {...ms} onChange={(v) => { setKab(v); setPage(1) }}
            allLabel={t('skdr.filter.allKabkotaMs')} countLabel={(n) => t('skdr.filter.nKabkota', { n })} /></div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div> : null}
      {rows === null ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-page px-4 py-8 text-center text-xs text-slate-500" data-testid="fasyankes-empty">
          {count?.total ? t('skdr.fasyankes.noMatch') : t('skdr.fasyankes.empty')}</div>
      ) : (
        <div className="skdr-table-card">
          <table className="skdr-table min-w-[900px] text-left text-xs" data-testid="fasyankes-table">
            <thead className="text-[10.5px] uppercase tracking-wide"><tr>
              <th>{t('skdr.fasyankes.colKode')}</th><th>{t('skdr.fasyankes.colNama')}</th><th>{t('skdr.fasyankes.colKelas')}</th>
              <th>{t('skdr.filter.province')}</th><th>{t('skdr.filter.kabkota')}</th><th>{t('skdr.fasyankes.colKec')}</th>
              <th>{t('skdr.fasyankes.colAlamat')}</th><th className="text-center">{t('skdr.fasyankes.colStatus')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kode_satusehat}>
                  <td className="font-mono text-[11px] text-slate-600">{r.kode_sarana || '—'}<div className="text-[10px] text-slate-400">{r.kode_satusehat}</div></td>
                  <td className="font-semibold text-slate-800">{r.nama}</td>
                  <td className="text-slate-600">{r.kelas || r.subjenis || '—'}</td>
                  <td className="text-slate-600">{r.provinsi || '—'}</td>
                  <td className="text-slate-600">{r.kabkota || '—'}</td>
                  <td className="text-slate-600">{r.kecamatan || '—'}</td>
                  <td className="max-w-[320px] truncate text-slate-500" title={r.alamat || ''}>{r.alamat || '—'}</td>
                  <td className="text-center"><span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${r.status_aktif ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    {r.status_aktif ? t('skdr.master.active') : t('skdr.master.inactive')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} total={total} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        onGoTo={setPage} pageSize={limit} onPageSizeChange={(n) => { setLimit(n); setPage(1) }} pageSizeOptions={[25, 50, 100]} />
      <p className="text-[11px] text-slate-400">{t('skdr.fasyankes.source')}</p>
    </div>
  )
}

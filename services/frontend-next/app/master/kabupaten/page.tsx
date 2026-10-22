'use client'
// PR 004: Data Kabupaten/Kota (layout/behaviour after NLP master-countries; filter per provinsi).
import { useEffect, useState, type FormEvent } from 'react'
import { MapPin } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { MASTER_PATHS, masterSend, setMasterStatus, useMasterList, type AdminKabkota, type AdminProvince } from '@/lib/skdr-master-api'
import { EditButton, Field, FormActions, inputCls, MasterHeader, MasterToolbar, StatusBadge, StatusToggle, TableState, tableHeadCls, thCls } from '@/components/master/MasterUi'

const P = MASTER_PATHS.kabkota

function useProvinces() {
  const [rows, setRows] = useState<AdminProvince[]>([])
  useEffect(() => {
    fetch(`${PUBLIC_BASE_PATH}${MASTER_PATHS.provinces}?per_page=100&status=all`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => setRows((j.data || []).sort((a: AdminProvince, b: AdminProvince) => a.name.localeCompare(b.name, 'id'))))
      .catch(() => setRows([]))
  }, [])
  return rows
}

export default function MasterKabupatenPage() {
  const { t } = useTranslation()
  const provinces = useProvinces()
  const [provinceId, setProvinceId] = useState('')
  const [kind, setKind] = useState('')
  const list = useMasterList<AdminKabkota>(P, { province_id: provinceId || undefined, kind: kind || undefined })
  const [editing, setEditing] = useState<AdminKabkota | null>(null)
  const [open, setOpen] = useState(false)

  const toggle = async (r: AdminKabkota) => {
    const msg = r.is_active ? t('skdr.master.confirmDeactivate', { name: r.name }) : t('skdr.master.confirmActivate', { name: r.name })
    if (!confirm(msg)) return
    try {
      await setMasterStatus(P, r.id, !r.is_active)
      toast.success(r.is_active ? t('skdr.master.deactivated', { name: r.name }) : t('skdr.master.activated', { name: r.name }))
      list.reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  const selCls = 'rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold normal-case text-slate-700 focus:border-primary focus:outline-none'
  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8">
      <MasterHeader icon={<MapPin className="h-5 w-5" />} title={t('skdr.master.kab.title')} subtitle={t('skdr.master.kab.subtitle')}
        loading={list.loading} onRefresh={list.reload} onAdd={() => { setEditing(null); setOpen(true) }} addLabel={t('skdr.master.kab.add')} />
      <MasterToolbar search={list.search} setSearch={list.setSearch} placeholder={t('skdr.master.kab.search')}
        status={list.status} setStatus={list.setStatus} total={list.total} totalLabel={t('skdr.master.kab.total')}>
        <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>{t('skdr.master.province')}</span>
          <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)} className={selCls}>
            <option value="">{t('skdr.master.allProvinces', { count: provinces.length })}</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>{t('skdr.master.kab.kind')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selCls}>
            <option value="">{t('skdr.master.kab.kindAll')}</option>
            <option value="kabupaten">{t('skdr.master.kab.kabupaten')}</option>
            <option value="kota">{t('skdr.master.kab.kota')}</option>
          </select>
        </label>
      </MasterToolbar>
      <div>
        <TableState loading={list.loading} error={list.error} empty={list.data.length === 0} />
        {list.data.length > 0 && !list.error && (
          <div className="skdr-table-card">
            <table className="skdr-table text-left text-xs">
              <thead><tr className={tableHeadCls}>
                <th className={thCls}>{t('skdr.master.kab.kemendagri')}</th>
                <th className={thCls}>{t('skdr.master.kab.bps')}</th>
                <th className={thCls}>{t('skdr.master.kab.name')}</th>
                <th className={thCls}>{t('skdr.master.kab.kind')}</th>
                <th className={thCls}>{t('skdr.master.province')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.lat')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.lng')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.status')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.actions')}</th>
              </tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id} className={`transition ${r.is_active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 font-mono"><span className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-primary">{r.kemendagri_code}</span></td>
                    <td className="px-4 py-3 font-mono"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{r.code}</span></td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {r.kind === 'kota' ? t('skdr.master.kab.kota') : t('skdr.master.kab.kabupaten')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.province_name}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{r.latitude.toFixed(6)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{r.longitude.toFixed(6)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge active={r.is_active} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => { setEditing(r); setOpen(true) }} label={t('skdr.master.editName', { name: r.name })} />
                        <StatusToggle active={r.is_active} onToggle={() => toggle(r)} name={r.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={list.page} totalPages={list.totalPages} total={list.total}
          onPrev={() => list.setPage(Math.max(1, list.page - 1))} onNext={() => list.setPage(Math.min(list.totalPages, list.page + 1))}
          onGoTo={list.setPage} pageSize={list.perPage} onPageSizeChange={list.setPerPage} />
      </div>
      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-2xl"
        title={editing ? t('skdr.master.kab.editTitle', { name: editing.name }) : t('skdr.master.kab.addTitle')}>
        <KabForm key={editing?.id ?? 'new'} item={editing} provinces={provinces} defaultProvinceId={provinceId}
          onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload() }} />
      </Modal>
    </div>
  )
}

function KabForm({ item, provinces, defaultProvinceId, onCancel, onSaved }: {
  item: AdminKabkota | null; provinces: AdminProvince[]; defaultProvinceId: string; onCancel: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    province_id: item ? String(item.province_id) : defaultProvinceId, kemendagri_code: item?.kemendagri_code ?? '', code: item?.code ?? '',
    name: item?.name ?? '', kind: item?.kind ?? 'kabupaten', latitude: item?.latitude?.toString() ?? '', longitude: item?.longitude?.toString() ?? '',
    is_active: item?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const prov = provinces.find((p) => String(p.id) === f.province_id)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!prov) return toast.error(t('skdr.master.provinceRequired'))
    const kc = f.kemendagri_code.trim()
    if (!/^\d{2}\.\d{2}$/.test(kc)) return toast.error(t('skdr.master.kab.kemendagriInvalid'))
    if (!kc.startsWith(prov.code + '.')) return toast.error(t('skdr.master.kab.kemendagriPrefix', { code: prov.code }))
    if (!/^\d{4}$/.test(f.code.trim())) return toast.error(t('skdr.master.kab.bpsInvalid'))
    if (!f.name.trim()) return toast.error(t('skdr.master.nameRequired'))
    const lat = Number(f.latitude), lng = Number(f.longitude)
    if (f.latitude === '' || f.longitude === '' || Number.isNaN(lat) || Number.isNaN(lng)) return toast.error(t('skdr.master.coordsRequired'))
    setSaving(true)
    try {
      const body = { province_id: prov.id, kemendagri_code: kc, code: f.code.trim(), name: f.name.trim(), kind: f.kind, latitude: lat, longitude: lng, is_active: f.is_active }
      if (item) await masterSend('PUT', `${P}/${item.id}`, body)
      else await masterSend('POST', P, body)
      toast.success(t('skdr.master.saved', { name: body.name }))
      onSaved()
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('skdr.master.province')} required>
          <select className={inputCls} value={f.province_id} onChange={(e) => setF({ ...f, province_id: e.target.value })}>
            <option value="">{t('skdr.master.chooseProvince')}</option>
            {provinces.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </Field>
        <Field label={t('skdr.master.kab.kind')} required>
          <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'kabupaten' | 'kota' })}>
            <option value="kabupaten">{t('skdr.master.kab.kabupaten')}</option>
            <option value="kota">{t('skdr.master.kab.kota')}</option>
          </select>
        </Field>
        <Field label={t('skdr.master.kab.kemendagri')} required hint={t('skdr.master.kab.kemendagriHint')}>
          <input className={inputCls} value={f.kemendagri_code} maxLength={5} placeholder={prov ? `${prov.code}.01` : ''} onChange={(e) => setF({ ...f, kemendagri_code: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.kab.bps')} required hint={t('skdr.master.kab.bpsHint')}>
          <input className={inputCls} value={f.code} maxLength={4} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.kab.name')} required>
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <Field label={t('skdr.master.lat')} required>
          <input className={inputCls} type="number" step="any" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.lng')} required>
          <input className={inputCls} type="number" step="any" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.status')}>
          <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> {t('skdr.master.active')}
          </label>
        </Field>
      </div>
      <p className="text-[11px] text-slate-400">{t('skdr.master.coordsHint')}</p>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

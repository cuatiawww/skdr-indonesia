'use client'
// PR 004: Data Provinsi (layout/behaviour after NLP master-countries).
import { useState, type FormEvent } from 'react'
import { Globe2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { MASTER_PATHS, masterSend, setMasterStatus, useMasterList, type AdminProvince } from '@/lib/skdr-master-api'
import { EditButton, Field, FormActions, inputCls, MasterHeader, MasterToolbar, StatusBadge, StatusToggle, TableState, tableHeadCls, thCls } from '@/components/master/MasterUi'

const P = MASTER_PATHS.provinces
const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(6))

export default function MasterProvinsiPage() {
  const { t } = useTranslation()
  const list = useMasterList<AdminProvince>(P)
  const [editing, setEditing] = useState<AdminProvince | null>(null)
  const [open, setOpen] = useState(false)

  const toggle = async (r: AdminProvince) => {
    const msg = r.is_active ? t('skdr.master.confirmDeactivate', { name: r.name }) : t('skdr.master.confirmActivate', { name: r.name })
    if (!confirm(msg)) return
    try {
      await setMasterStatus(P, r.id, !r.is_active)
      toast.success(r.is_active ? t('skdr.master.deactivated', { name: r.name }) : t('skdr.master.activated', { name: r.name }))
      list.reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8">
      <MasterHeader icon={<Globe2 className="h-5 w-5" />} title={t('skdr.master.prov.title')} subtitle={t('skdr.master.prov.subtitle')}
        loading={list.loading} onRefresh={list.reload} onAdd={() => { setEditing(null); setOpen(true) }} addLabel={t('skdr.master.prov.add')} />
      <MasterToolbar search={list.search} setSearch={list.setSearch} placeholder={t('skdr.master.prov.search')}
        status={list.status} setStatus={list.setStatus} total={list.total} totalLabel={t('skdr.master.prov.total')} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <TableState loading={list.loading} error={list.error} empty={list.data.length === 0} />
        {list.data.length > 0 && !list.error && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className={tableHeadCls}>
                <th className={thCls}>{t('skdr.master.code')}</th>
                <th className={thCls}>{t('skdr.master.prov.name')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.lat')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.lng')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.prov.kabCount')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.status')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.actions')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.map((r) => (
                  <tr key={r.id} className={`transition hover:bg-blue-50/30 ${r.is_active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 font-mono"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{r.code}</span></td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(r.latitude)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(r.longitude)}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600">{r.kabkota_count}</td>
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
      <Modal open={open} onClose={() => setOpen(false)}
        title={editing ? t('skdr.master.prov.editTitle', { name: editing.name }) : t('skdr.master.prov.addTitle')}>
        <ProvinceForm key={editing?.id ?? 'new'} item={editing} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload() }} />
      </Modal>
    </div>
  )
}

function ProvinceForm({ item, onCancel, onSaved }: { item: AdminProvince | null; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    code: item?.code ?? '', name: item?.name ?? '',
    latitude: item?.latitude?.toString() ?? '', longitude: item?.longitude?.toString() ?? '', is_active: item?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{2}$/.test(f.code.trim())) return toast.error(t('skdr.master.prov.codeInvalid'))
    if (!f.name.trim()) return toast.error(t('skdr.master.nameRequired'))
    const lat = Number(f.latitude), lng = Number(f.longitude)
    if (f.latitude === '' || f.longitude === '' || Number.isNaN(lat) || Number.isNaN(lng)) return toast.error(t('skdr.master.coordsRequired'))
    setSaving(true)
    try {
      const body = { code: f.code.trim(), name: f.name.trim(), latitude: lat, longitude: lng, is_active: f.is_active }
      if (item) await masterSend('PUT', `${P}/${item.id}`, body)
      else await masterSend('POST', P, body)
      toast.success(t('skdr.master.saved', { name: body.name }))
      onSaved()
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('skdr.master.prov.code')} required hint={t('skdr.master.prov.codeHint')}>
          <input className={inputCls} value={f.code} maxLength={2} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.prov.name')} required>
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

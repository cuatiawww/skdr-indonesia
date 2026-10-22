'use client'
// PR 004: Data Penyakit (layout/behaviour after NLP disease-master).
import { useState, type FormEvent } from 'react'
import { Database, ShieldAlert, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { MASTER_PATHS, masterSend, setMasterStatus, useMasterList, type AdminDisease } from '@/lib/skdr-master-api'
import { useCategories } from '@/lib/kategori'

type KategoriChip = { code: string; short_name: string; color?: string | null; is_primary: boolean }
const kats = (r: AdminDisease | null): KategoriChip[] => ((r as unknown as { kategori?: KategoriChip[] })?.kategori || [])
import { EditButton, Field, FormActions, inputCls, MasterHeader, MasterToolbar, StatusBadge, StatusToggle, TableState, tableHeadCls, thCls } from '@/components/master/MasterUi'

const P = MASTER_PATHS.diseases

export default function MasterPenyakitPage() {
  const { t } = useTranslation()
  const list = useMasterList<AdminDisease>(P)
  const [editing, setEditing] = useState<AdminDisease | null>(null)
  const [open, setOpen] = useState(false)

  const toggle = async (r: AdminDisease) => {
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
      <MasterHeader icon={<Stethoscope className="h-5 w-5" />} title={t('skdr.master.dis.title')} subtitle={t('skdr.master.dis.subtitle')}
        loading={list.loading} onRefresh={list.reload} onAdd={() => { setEditing(null); setOpen(true) }} addLabel={t('skdr.master.dis.add')} />
      <MasterToolbar search={list.search} setSearch={list.setSearch} placeholder={t('skdr.master.dis.search')}
        status={list.status} setStatus={list.setStatus} total={list.total} totalLabel={t('skdr.master.dis.total')}>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-primary">
          <Database className="h-3 w-3" /> {t('skdr.master.dis.standard')}
        </span>
      </MasterToolbar>
      <div>
        <TableState loading={list.loading} error={list.error} empty={list.data.length === 0} />
        {list.data.length > 0 && !list.error && (
          <div className="skdr-table-card">
            <table className="skdr-table text-left text-xs">
              <thead><tr className={tableHeadCls}>
                <th className={thCls}>{t('skdr.master.dis.code')}</th>
                <th className={thCls}>{t('skdr.master.dis.name')}</th>
                <th className={thCls}>Kategori Surveilans</th>
                <th className={thCls}>{t('skdr.master.dis.category')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.dis.zoonotic')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.dis.aliases')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.dis.reports')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.status')}</th>
                <th className={`${thCls} text-right`}>{t('skdr.master.actions')}</th>
              </tr></thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id} className={`transition ${r.is_active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary"><span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5">{r.code}</span></td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.name}</div>
                      {r.english_name && <div className="max-w-xs truncate text-[11px] text-slate-400">{r.english_name}</div>}
                    </td>
                    <td className="px-4 py-3" data-testid="kategori-cell">
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {kats(r).length ? kats(r).map((k) => (
                          <span key={k.code} title={k.is_primary ? 'Kategori utama' : 'Kategori tambahan'}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${k.is_primary ? 'text-white' : 'bg-white'}`}
                            style={k.is_primary ? { background: k.color || '#475569', borderColor: k.color || '#475569' } : { color: k.color || '#475569', borderColor: k.color || '#cbd5e1' }}>{k.short_name}</span>
                        )) : <span className="text-xs text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.category ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{r.category}</span>
                        : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.is_zoonotic ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          <ShieldAlert className="h-3 w-3" /> {t('skdr.master.dis.zoonoticYes')}
                        </span>
                      ) : <span className="text-xs text-slate-400">{t('skdr.master.no')}</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600" title={(r.aliases_id || []).join(', ')}>{(r.aliases_id || []).length}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-600">{r.report_count}</td>
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
        title={editing ? t('skdr.master.dis.editTitle', { name: editing.name }) : t('skdr.master.dis.addTitle')}>
        <DiseaseForm key={editing?.id ?? 'new'} item={editing} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload() }} />
      </Modal>
    </div>
  )
}

function DiseaseForm({ item, onCancel, onSaved }: { item: AdminDisease | null; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    code: item?.code ?? '', name: item?.name ?? '', english_name: item?.english_name ?? '', category: item?.category ?? '',
    is_zoonotic: item?.is_zoonotic ?? false, description: item?.description ?? '', aliases: (item?.aliases_id || []).join(', '),
    is_active: item?.is_active ?? true,
    icd10: (item as any)?.icd10 ?? '', symptoms: (item as any)?.symptoms ?? '', transmission: (item as any)?.transmission ?? '',
  })
  const [saving, setSaving] = useState(false)
  // PR 021: kategori surveilans (DB); urutan pertama = kategori utama
  const categories = useCategories()
  const [kat, setKat] = useState<string[]>(kats(item).map((k) => k.code))
  const toggleKat = (code: string) => setKat((v) => (v.includes(code) ? v.filter((x) => x !== code) : [...v, code]))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const code = f.code.trim().toUpperCase()
    if (!/^[A-Z0-9_]{1,40}$/.test(code) || code.startsWith('OLD_')) return toast.error(t('skdr.master.dis.codeInvalid'))
    if (!f.name.trim()) return toast.error(t('skdr.master.nameRequired'))
    setSaving(true)
    try {
      const body = {
        code, name: f.name.trim(), english_name: f.english_name, category: f.category, is_zoonotic: f.is_zoonotic, description: f.description,
        aliases_id: f.aliases.split(',').map((s) => s.trim()).filter(Boolean), is_active: f.is_active,
        icd10: f.icd10, symptoms: f.symptoms, transmission: f.transmission,
        kategori: kat,
      }
      if (item) await masterSend('PUT', `${P}/${item.id}`, body)
      else await masterSend('POST', P, body)
      toast.success(t('skdr.master.saved', { name: body.name }))
      onSaved()
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('skdr.master.dis.code')} required hint={t('skdr.master.dis.codeHint')}>
          <input className={`${inputCls} font-mono uppercase`} value={f.code} maxLength={40} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.dis.name')} required>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.dis.englishName')}>
          <input className={inputCls} value={f.english_name} onChange={(e) => setF({ ...f, english_name: e.target.value })} />
        </Field>
        <Field label={t('skdr.master.dis.category')}>
          <input className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Kategori Surveilans" hint="Bisa lebih dari satu. Yang dipilih pertama menjadi kategori utama.">
            <div className="flex flex-wrap gap-2" data-testid="kategori-picker">
              {categories.map((c) => {
                const i = kat.indexOf(c.code)
                return (
                  <button type="button" key={c.code} onClick={() => toggleKat(c.code)} title={c.name}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition ${i >= 0 ? 'text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    style={i >= 0 ? { background: c.color || '#475569', borderColor: c.color || '#475569' } : undefined}>
                    {c.short_name}{i === 0 ? ' (utama)' : ''}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.dis.aliases')} hint={t('skdr.master.dis.aliasesHint')}>
            <input className={inputCls} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.dis.description')}>
            <textarea className={inputCls} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
        {/* PR 012: info halaman Penyakit */}
        <Field label={t('skdr.master.dis.icd10')} hint={t('skdr.master.dis.icd10Hint')}>
          <input className={`${inputCls} font-mono`} value={f.icd10} maxLength={20} onChange={(e) => setF({ ...f, icd10: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.dis.symptoms')}>
            <textarea className={inputCls} rows={3} value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('skdr.master.dis.transmission')}>
            <textarea className={inputCls} rows={2} value={f.transmission} onChange={(e) => setF({ ...f, transmission: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.is_zoonotic} onChange={(e) => setF({ ...f, is_zoonotic: e.target.checked })} /> {t('skdr.master.dis.zoonoticYes')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> {t('skdr.master.active')}
        </label>
      </div>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

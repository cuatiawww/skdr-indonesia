'use client'
// PR 029: Manajemen Akses → Peran & Hak Akses. Built-in roles (is_system) cannot be deleted; Administrator is locked.
import { useState, type FormEvent } from 'react'
import { Lock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { accessSend, ROLES_PATH, useRoles, type AccessRole, type PermissionDef } from '@/lib/access-api'
import { Field, FormActions, inputCls, TableState } from '@/components/master/MasterUi'

export default function PeranPage() {
  const { t } = useTranslation()
  const { roles, permissions, loading, error, reload } = useRoles()
  const [editing, setEditing] = useState<AccessRole | null>(null)
  const [open, setOpen] = useState(false)
  const label = (k: string) => (k === '*' ? t('skdr.access.roles.all') : permissions.find((p) => p.key === k)?.label || k)

  const remove = async (r: AccessRole) => {
    if (!confirm(t('common.confirmDelete', { name: r.name }))) return
    try { await accessSend('DELETE', `${ROLES_PATH}/${r.id}`); toast.success(t('common.deletedSuccess', { item: r.name })); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="roles-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{t('skdr.access.roles.title')}</h1>
          <p className="text-xs text-slate-500">{t('skdr.access.roles.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reload} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('skdr.master.refresh')}
          </button>
          <button onClick={() => { setEditing(null); setOpen(true) }} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-primary-dark">
            <Plus className="h-4 w-4 stroke-[2.5]" /> {t('skdr.access.roles.add')}
          </button>
        </div>
      </div>
      <TableState loading={loading} error={error} empty={roles.length === 0} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-card p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-slate-900">{r.name}</h2>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{r.id}</span>
                  {r.is_system && <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800"><Lock className="h-3 w-3" />{t('skdr.access.roles.system')}</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.description || '—'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {r.id !== 'admin' && (
                  <button onClick={() => { setEditing(r); setOpen(true) }} title={t('common.edit')} aria-label={t('skdr.master.editName', { name: r.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-50 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                )}
                {!r.is_system && (
                  <button onClick={() => remove(r)} title={t('common.delete')} aria-label={t('common.delete')} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.map((p) => <span key={p} className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-800">{label(p)}</span>)}
              {r.permissions.length === 0 && <span className="text-[11px] text-slate-400">{t('skdr.access.roles.none')}</span>}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{t('skdr.access.roles.userCount', { n: r.user_count })}</p>
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-2xl" title={editing ? t('skdr.access.roles.editTitle', { name: editing.name }) : t('skdr.access.roles.addTitle')}>
        <RoleForm key={editing?.id ?? 'new'} item={editing} permissions={permissions} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); reload() }} />
      </Modal>
    </div>
  )
}

function RoleForm({ item, permissions, onCancel, onSaved }: { item: AccessRole | null; permissions: PermissionDef[]; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({ id: item?.id ?? '', name: item?.name ?? '', description: item?.description ?? '', permissions: item?.permissions ?? ['dashboard_limited'] })
  const [saving, setSaving] = useState(false)
  const toggle = (k: string) => setF({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x) => x !== k) : [...f.permissions, k] })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { id: f.id.trim(), name: f.name.trim(), description: f.description.trim(), permissions: f.permissions }
      if (item) await accessSend('PUT', `${ROLES_PATH}/${item.id}`, body)
      else await accessSend('POST', ROLES_PATH, body)
      toast.success(t('skdr.master.saved', { name: body.name }))
      onSaved()
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setSaving(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('skdr.access.roles.code')} required hint={item ? undefined : t('skdr.access.roles.codeHint')}>
          <input className={inputCls} value={f.id} disabled={!!item} onChange={(e) => setF({ ...f, id: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('skdr.access.roles.name')} required>
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
      </div>
      <Field label={t('skdr.access.roles.description')}>
        <input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('skdr.access.roles.permissions')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {permissions.map((p) => (
            <label key={p.key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${f.permissions.includes(p.key) ? 'border-primary/50 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="checkbox" className="mt-0.5" checked={f.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
              <span><span className="block text-xs font-bold text-slate-800">{p.label}</span><span className="block text-[11px] text-slate-500">{p.description}</span></span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('skdr.access.roles.implies')}</p>
      </div>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

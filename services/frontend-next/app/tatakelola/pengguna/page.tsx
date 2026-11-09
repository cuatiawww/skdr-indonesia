'use client'
// PR 029: Manajemen Akses → Pengguna (CRUD, peran, aktif/nonaktif). Layout follows the SKDR master data pages.
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/Modal'
import Pagination from '@/components/Pagination'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useMasterList } from '@/lib/skdr-master-api'
import { accessSend, fmtDateTime, useRoles, USERS_PATH, type AccessRole, type AccessUser } from '@/lib/access-api'
import { useAuth } from '@/lib/skdr-auth'
import { EditButton, Field, FormActions, inputCls, MasterHeader, MasterToolbar, StatusBadge, StatusToggle, TableState, tableHeadCls, thCls } from '@/components/master/MasterUi'

export default function PenggunaPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [role, setRole] = useState('')
  const list = useMasterList<AccessUser>(USERS_PATH, { role: role || undefined })
  const { roles } = useRoles()
  const [editing, setEditing] = useState<AccessUser | null>(null)
  const [open, setOpen] = useState(false)

  const toggle = async (u: AccessUser) => {
    const msg = u.is_active ? t('skdr.master.confirmDeactivate', { name: u.username }) : t('skdr.master.confirmActivate', { name: u.username })
    if (!confirm(msg)) return
    try {
      await accessSend('PATCH', `${USERS_PATH}/${u.id}/status`, { is_active: !u.is_active })
      toast.success(u.is_active ? t('skdr.master.deactivated', { name: u.username }) : t('skdr.master.activated', { name: u.username }))
      list.reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="users-page">
      <MasterHeader title={t('skdr.access.users.title')} subtitle={t('skdr.access.users.subtitle')} loading={list.loading}
        onRefresh={list.reload} onAdd={() => { setEditing(null); setOpen(true) }} addLabel={t('skdr.access.users.add')} />
      <MasterToolbar search={list.search} setSearch={list.setSearch} placeholder={t('skdr.access.users.search')}
        status={list.status} setStatus={list.setStatus} total={list.total} totalLabel={t('skdr.access.users.total')}>
        <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>{t('skdr.access.role')}</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold normal-case text-slate-700 focus:border-primary focus:outline-none">
            <option value="">{t('skdr.master.statusAll')}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      </MasterToolbar>
      <div>
        <TableState loading={list.loading} error={list.error} empty={list.data.length === 0} />
        {list.data.length > 0 && !list.error && (
          <div className="skdr-table-card">
            <table className="skdr-table text-left text-xs">
              <thead><tr className={tableHeadCls}>
                <th className={thCls}>{t('skdr.access.users.username')}</th>
                <th className={thCls}>{t('skdr.access.users.fullName')}</th>
                <th className={thCls}>{t('skdr.access.users.email')}</th>
                <th className={thCls}>{t('skdr.access.role')}</th>
                <th className={thCls}>{t('skdr.access.users.lastLogin')}</th>
                <th className={`${thCls} text-center`}>{t('skdr.master.status')}</th>
                <th className={`${thCls} text-right`}>{t('common.actions')}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{u.username}{me?.id === u.id && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 font-sans text-[10px] font-bold text-brand-800">{t('skdr.access.users.you')}</span>}</td>
                    <td className="px-4 py-3 text-slate-700">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email || '—'}</td>
                    <td className="px-4 py-3"><span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800">{u.role_name}</span></td>
                    <td className="px-4 py-3 text-slate-600">{fmtDateTime(u.last_login_at)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge active={u.is_active} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <EditButton onClick={() => { setEditing(u); setOpen(true) }} label={t('skdr.master.editName', { name: u.username })} />
                        {me?.id !== u.id && <StatusToggle active={u.is_active} onToggle={() => toggle(u)} name={u.username} />}
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
        title={editing ? t('skdr.access.users.editTitle', { name: editing.username }) : t('skdr.access.users.addTitle')}>
        <UserForm key={editing?.id ?? 'new'} item={editing} roles={roles} self={me?.id === editing?.id}
          onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload() }} />
      </Modal>
    </div>
  )
}

function UserForm({ item, roles, self, onCancel, onSaved }: { item: AccessUser | null; roles: AccessRole[]; self: boolean; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    username: item?.username ?? '', full_name: item?.full_name ?? '', email: item?.email ?? '',
    role: item?.role ?? (roles.find((r) => r.id === 'viewer')?.id || roles[0]?.id || ''), password: '', confirm: '', is_active: item?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!item && !f.password) return toast.error(t('skdr.access.users.passwordRequired'))
    if (f.password && f.password !== f.confirm) return toast.error(t('skdr.auth.passwordMismatch'))
    setSaving(true)
    try {
      const body = { username: f.username.trim(), full_name: f.full_name.trim(), email: f.email.trim(), role: f.role, is_active: f.is_active, password: f.password || undefined }
      if (item) await accessSend('PUT', `${USERS_PATH}/${item.id}`, body)
      else await accessSend('POST', USERS_PATH, body)
      toast.success(t('skdr.master.saved', { name: body.username || item?.username || '' }))
      onSaved()
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setSaving(false) }
  }
  const selected = roles.find((r) => r.id === f.role)
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="user-form">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('skdr.access.users.username')} required hint={item ? t('skdr.access.users.usernameFixed') : t('skdr.access.users.usernameHint')}>
          <input name="username" className={inputCls} value={f.username} disabled={!!item} autoComplete="off" onChange={(e) => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label={t('skdr.access.users.fullName')}>
          <input name="full_name" className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </Field>
        <Field label={t('skdr.access.users.email')}>
          <input name="email" type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={t('skdr.access.role')} required hint={selected?.description || undefined}>
          <select name="role" className={inputCls} value={f.role} disabled={self} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label={item ? t('skdr.access.users.newPassword') : t('skdr.auth.password')} required={!item} hint={item ? t('skdr.access.users.passwordKeep') : t('skdr.access.passwordHint')}>
          <input name="password" type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label={t('skdr.auth.confirmPassword')} required={!item}>
          <input name="confirm" type="password" autoComplete="new-password" className={inputCls} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        {!self && (
          <Field label={t('skdr.master.status')}>
            <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> {t('skdr.master.active')}
            </label>
          </Field>
        )}
      </div>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

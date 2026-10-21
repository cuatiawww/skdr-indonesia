'use client'
// PR 004: shared Master Data UI, styled after NLP master-countries / disease-master pages.
import type { ReactNode } from 'react'
import { CheckCircle2, Plus, RefreshCw, Search, XCircle, Pencil } from 'lucide-react'
import SearchInput from '@/components/SearchInput'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { StatusFilter } from '@/lib/skdr-master-api'

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-2xs focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-blue-100'

export function MasterHeader({ icon, title, subtitle, loading, onRefresh, onAdd, addLabel }: {
  icon: ReactNode; title: string; subtitle: string; loading: boolean; onRefresh: () => void; onAdd: () => void; addLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0060A9]/10 text-[#0060A9]">{icon}</div>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onRefresh} disabled={loading} title={t('skdr.master.refresh')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('skdr.master.refresh')}</span>
        </button>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition hover:bg-[#004b85]">
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>{addLabel}</span>
        </button>
      </div>
    </div>
  )
}

export function MasterToolbar({ search, setSearch, placeholder, status, setStatus, total, totalLabel, children }: {
  search: string; setSearch: (v: string) => void; placeholder: string; status: StatusFilter; setStatus: (v: StatusFilter) => void
  total: number; totalLabel: string; children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <SearchInput value={search} onChange={setSearch} placeholder={placeholder} />
      </div>
      {children}
      <label className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>{t('skdr.master.status')}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold normal-case text-slate-700 focus:border-[#0060A9] focus:outline-none">
          <option value="all">{t('skdr.master.statusAll')}</option>
          <option value="active">{t('skdr.master.statusActive')}</option>
          <option value="inactive">{t('skdr.master.statusInactive')}</option>
        </select>
      </label>
      <div className="ml-auto text-xs font-medium text-slate-500">
        {totalLabel}: <span className="font-bold text-slate-800">{total.toLocaleString('id-ID')}</span>
      </div>
    </div>
  )
}

export function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> {t('skdr.master.active')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
      <XCircle className="h-3 w-3" /> {t('skdr.master.inactive')}
    </span>
  )
}

/** Active/inactive switch (soft delete). */
export function StatusToggle({ active, onToggle, name }: { active: boolean; onToggle: () => void; name: string }) {
  const { t } = useTranslation()
  const label = active ? t('skdr.master.deactivate', { name }) : t('skdr.master.activate', { name })
  return (
    <button type="button" role="switch" aria-checked={active} onClick={onToggle} title={label} aria-label={label}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-blue-50 hover:text-[#0060A9]">
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

export function TableState({ loading, error, empty }: { loading: boolean; error: string | null; empty: boolean }) {
  const { t } = useTranslation()
  if (loading && empty)
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <RefreshCw className="mb-2 h-6 w-6 animate-spin text-[#0060A9]" />
        <p className="text-xs font-medium">{t('skdr.master.loading')}</p>
      </div>
    )
  if (error) return <div className="p-12 text-center text-xs font-medium text-red-600">{t('skdr.master.loadFailed')}: {error}</div>
  if (empty) return <div className="p-12 text-center text-xs font-medium text-slate-400">{t('skdr.master.empty')}</div>
  return null
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

export function FormActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
        {t('common.cancel')}
      </button>
      <button type="submit" disabled={saving} className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#004b85] disabled:opacity-50">
        {saving ? t('skdr.master.saving') : t('common.save')}
      </button>
    </div>
  )
}

export const thCls = 'px-4 py-3'
export const tableHeadCls = 'border-b border-slate-100 bg-slate-50/80 text-left font-bold uppercase tracking-wider text-slate-500'

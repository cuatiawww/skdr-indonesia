// PR 006: PE form API client.
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export class ApiError extends Error { constructor(msg: string, public status: number, public body: any) { super(msg) } }

export async function peFetch<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const role = typeof window !== 'undefined' ? window.localStorage.getItem('skdr_pe_role') : null
  const res = await fetch(`${PUBLIC_BASE_PATH}${path}`, {
    method: init?.method || 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(role ? { 'X-SKDR-Role': role } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.success === false) throw new ApiError(j.error || `HTTP ${res.status}`, res.status, j)
  return j as T
}

export const PE_FORMS: Record<string, { label: string }> = {
  lepto: { label: 'Leptospirosis' }, rabies: { label: 'Rabies/GHPR' }, antraks: { label: 'Antraks' }, ai: { label: 'Avian Influenza' },
}

export const STATUS_STYLE: Record<string, string> = {
  draf: 'border-slate-200 bg-slate-50 text-slate-600',
  dikirim: 'border-blue-200/60 bg-blue-50 text-[#0060A9]',
  terverifikasi: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
  final: 'border-violet-200/60 bg-violet-50 text-violet-700',
  dikembalikan: 'border-amber-200/60 bg-amber-50 text-amber-700',
}
export const CLASS_STYLE: Record<string, string> = {
  konfirmasi: 'border-red-200/60 bg-red-50 text-red-700',
  probable: 'border-orange-200/60 bg-orange-50 text-orange-700',
  suspek: 'border-amber-200/60 bg-amber-50 text-amber-700',
  tidak_memenuhi: 'border-slate-200 bg-slate-50 text-slate-500',
}

'use client'
// PR 029: user access management API client (/api/v1/users, /api/v1/roles, /api/v1/access-log).
import { useCallback, useEffect, useState } from 'react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { notifyUnauthorized } from '@/lib/skdr-auth'

export interface AccessUser {
  id: string; username: string; full_name: string | null; email: string | null; role: string; role_name: string
  is_active: boolean; last_login_at: string | null; created_at: string; created_by: string | null
}
export interface AccessRole { id: string; name: string; description: string | null; permissions: string[]; is_system: boolean; user_count: number }
export interface PermissionDef { key: string; label: string; description: string }
export interface AccessLogRow { id: number; username: string | null; action: string; detail: Record<string, unknown>; ip: string | null; created_at: string }

export const USERS_PATH = '/api/v1/users'
export const ROLES_PATH = '/api/v1/roles'

export async function accessSend<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PUBLIC_BASE_PATH}${path}`, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401) notifyUnauthorized()
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.success === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j as T
}

export function useRoles() {
  const [roles, setRoles] = useState<AccessRole[]>([])
  const [permissions, setPermissions] = useState<PermissionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const j = await accessSend<{ data: AccessRole[]; permissions: PermissionDef[] }>('GET', ROLES_PATH)
      setRoles(j.data || []); setPermissions(j.permissions || [])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { roles, permissions, loading, error, reload }
}

export const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '—'
  // Postgres ::text gives '2026-11-09 04:12:07.18+00' → ISO with a full offset
  const d = new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

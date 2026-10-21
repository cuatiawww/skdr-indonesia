// PR 004: Master Data CRUD client (provinsi, kabupaten/kota, penyakit). Soft delete via status toggle.
'use client'
import { useCallback, useEffect, useState } from 'react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export type StatusFilter = 'active' | 'inactive' | 'all'

export interface AdminProvince {
  id: number; code: string; name: string; latitude: number | null; longitude: number | null; is_active: boolean; kabkota_count: number
}
export interface AdminKabkota {
  id: number; code: string; kemendagri_code: string; name: string; kind: 'kabupaten' | 'kota'
  province_id: number; province_name: string; latitude: number; longitude: number; is_active: boolean
}
export interface AdminDisease {
  id: number; code: string; name: string; english_name: string | null; category: string | null; is_zoonotic: boolean
  description: string | null; aliases_id: string[]; is_active: boolean; report_count: number
}

export const MASTER_PATHS = {
  provinces: '/api/v1/admin/master/provinces',
  kabkota: '/api/v1/admin/master/kabkota',
  diseases: '/api/v1/admin/master/diseases',
} as const

/** Throws Error(message) with the server's Indonesian error text, or HTTP status. */
export async function masterSend(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown) {
  const res = await fetch(`${PUBLIC_BASE_PATH}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export const setMasterStatus = (path: string, id: number, is_active: boolean) =>
  masterSend('PATCH', `${path}/${id}/status`, { is_active })

/** Server-side paginated list with search, status and extra filters (same behaviour as NLP usePaginatedFetch). */
export function useMasterList<T>(path: string, extra: Record<string, string | number | undefined> = {}) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearchRaw] = useState('')
  const [status, setStatusRaw] = useState<StatusFilter>('all')
  const extraKey = JSON.stringify(extra)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), status })
      if (search.trim()) qs.set('search', search.trim())
      Object.entries(JSON.parse(extraKey) as Record<string, string | number | undefined>).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v))
      })
      const res = await fetch(`${PUBLIC_BASE_PATH}${path}?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json.data || [])
      setTotal(json.total || 0)
      setTotalPages(json.total_pages || 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [path, page, perPage, search, status, extraKey])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [extraKey])

  return {
    data, loading, error, page, setPage, perPage, total, totalPages, search, status, reload: load,
    setSearch: (v: string) => { setSearchRaw(v); setPage(1) },
    setStatus: (v: StatusFilter) => { setStatusRaw(v); setPage(1) },
    setPerPage: (v: number) => { setPerPage(v); setPage(1) },
  }
}

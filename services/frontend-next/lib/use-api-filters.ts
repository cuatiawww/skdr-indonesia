'use client'
// PR 021: filter state + fetch for pages fed by API data (Laboratorium, Klaster). Same filter bar as the main dashboard.
import { useCallback, useEffect, useState } from 'react'
import { fetchFrom } from '@/lib/api'
import { filterParams, type SkdrFilterState } from '@/components/SkdrFilterBar'
import { getCurrentEpiWeek } from '@/lib/epi-week'

export function useApiFilters<T>(path: string) {
  const cur = getCurrentEpiWeek()
  const init: SkdrFilterState = {
    diseases: [], source: 'all', provinceIds: [], kabkotaIds: [], units: [], kategori: '',
    startYear: cur.year, startWeek: 1, endYear: cur.year, endWeek: cur.week || 1,
  }
  const [filters, setFilters] = useState<SkdrFilterState>(init)
  const [applied, setApplied] = useState<SkdrFilterState>(init)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const q = { ...filterParams(applied), start_year: applied.startYear, start_week: applied.startWeek, end_year: applied.endYear, end_week: applied.endWeek }
      const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
      setData(await fetchFrom<T>(`${path}?${qs}`))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [applied, path])
  useEffect(() => { void load() }, [load])
  return { filters, setFilters, applied, setApplied, data, loading, error, load }
}

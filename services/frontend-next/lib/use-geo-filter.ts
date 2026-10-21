'use client'
// PR 018: global multi-select filter (Penyakit / Provinsi / Kab-Kota) shared by every page.
// Source of truth = URL (?penyakit=a,b&prov=11,12&kab=...); the last applied value is also kept in sessionStorage so
// moving between pages keeps the same selection. Empty lists = semua (default).
import { useCallback, useEffect, useState } from 'react'

export type GeoFilter = { diseases: string[]; provinceIds: number[]; kabkotaIds: number[] }
export const GEO_KEY = 'skdr-geo-filter'
export const EMPTY_GEO: GeoFilter = { diseases: [], provinceIds: [], kabkotaIds: [] }

const ints = (v: string | null) => (v || '').split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0)
export function geoFromUrl(sp: URLSearchParams): GeoFilter | null {
  if (!sp.has('penyakit') && !sp.has('prov') && !sp.has('kab')) return null
  return { diseases: (sp.get('penyakit') || '').split(',').map((x) => x.trim()).filter(Boolean), provinceIds: ints(sp.get('prov')), kabkotaIds: ints(sp.get('kab')) }
}
export function loadGeo(): GeoFilter {
  if (typeof window === 'undefined') return EMPTY_GEO
  const u = geoFromUrl(new URLSearchParams(window.location.search))
  if (u) return u
  try { const s = JSON.parse(sessionStorage.getItem(GEO_KEY) || 'null'); if (s && Array.isArray(s.diseases)) return s } catch { /* ignore */ }
  return EMPTY_GEO
}
export function saveGeo(g: GeoFilter) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(GEO_KEY, JSON.stringify(g)) } catch { /* ignore */ }
  const url = new URL(window.location.href)
  const set = (k: string, v: (string | number)[]) => (v.length ? url.searchParams.set(k, v.join(',')) : url.searchParams.delete(k))
  set('penyakit', g.diseases); set('prov', g.provinceIds); set('kab', g.kabkotaIds)
  for (const old of ['disease', 'province_id', 'kabkota_id']) url.searchParams.delete(old)
  window.history.replaceState(window.history.state, '', url.toString())
}
export function geoParams(g: GeoFilter, withDisease = true): Record<string, string | undefined> {
  return {
    disease: withDisease && g.diseases.length ? g.diseases.join(',') : undefined,
    province_id: g.provinceIds.length ? g.provinceIds.join(',') : undefined,
    kabkota_id: g.kabkotaIds.length ? g.kabkotaIds.join(',') : undefined,
  }
}

export function useGeoFilter() {
  const [geo, setGeoState] = useState<GeoFilter>(EMPTY_GEO)
  const [ready, setReady] = useState(false)
  useEffect(() => { setGeoState(loadGeo()); setReady(true) }, [])
  const setGeo = useCallback((g: GeoFilter) => { setGeoState(g); saveGeo(g) }, [])
  return { geo, setGeo, ready }
}

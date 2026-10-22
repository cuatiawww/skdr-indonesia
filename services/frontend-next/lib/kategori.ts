'use client'
// PR 021: kategori penyakit dari DB (master_disease_categories), dipakai filter dasbor, dasbor per kategori, dan sub-menu sidebar.
import { useEffect, useState } from 'react'
import { fetchFrom } from '@/lib/api'

export type DiseaseCategory = {
  code: string
  name: string
  short_name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  order: number
  diseases: { code: string; name: string; is_primary: boolean }[]
}

let cache: DiseaseCategory[] | null = null
let pending: Promise<DiseaseCategory[]> | null = null

export function loadCategories(): Promise<DiseaseCategory[]> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetchFrom<DiseaseCategory[]>('/api/v1/master/disease-categories')
      .then((d) => (cache = d || []))
      .catch(() => { pending = null; return [] })
  }
  return pending
}

export function useCategories(): DiseaseCategory[] {
  const [cats, setCats] = useState<DiseaseCategory[]>(cache || [])
  useEffect(() => { let on = true; loadCategories().then((c) => on && setCats(c)); return () => { on = false } }, [])
  return cats
}

/** URL slug <-> category code (ZOONOSIS <-> zoonosis, TULAR_VEKTOR <-> tular-vektor). */
export const kategoriSlug = (code: string) => code.toLowerCase().replace(/_/g, '-')
export const kategoriCode = (slug: string) => decodeURIComponent(slug).toUpperCase().replace(/-/g, '_')

'use client'
// PR 017: grouped main navigation (DB-driven app_settings.navigation_menu) + PE form registry expansion.
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FileText } from 'lucide-react'
import { convertConfigToSidebarGroups, ensureZoonosisLiteMenu, type SidebarGroup, type SidebarItem } from '@/lib/menu'
import { useSettings } from '@/lib/settings-context'
import { peFetch } from '@/lib/pe-api'
import { useCategories, kategoriSlug } from '@/lib/kategori'
import { MENU_ICON_MAP } from '@/lib/menu'
import { Layers } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type PeFormRow = { form_key: string; title: string; version: number }

const PE_TITLE_PREFIX = /^Formulir\s+Penyelidikan\s+Epidemiologi\s*\(PE\)\s*/i

let peFormsCache: PeFormRow[] | null = null
let peFormsPromise: Promise<PeFormRow[]> | null = null
function loadPeForms(): Promise<PeFormRow[]> {
  if (peFormsCache) return Promise.resolve(peFormsCache)
  if (!peFormsPromise) {
    peFormsPromise = peFetch<{ data: PeFormRow[] }>('/api/v1/pe/forms')
      .then((j) => (peFormsCache = j.data || []))
      .catch(() => { peFormsPromise = null; return [] })
  }
  return peFormsPromise
}

export function peFormLabel(title: string) {
  return title.replace(PE_TITLE_PREFIX, '').trim() || title
}

/** Menu groups with Form PE sub-items expanded from the PE form registry (no hardcoded disease list). */
export function useNavGroups(): SidebarGroup[] {
  const { settings } = useSettings()
  const [forms, setForms] = useState<PeFormRow[]>(peFormsCache || [])
  useEffect(() => { let on = true; loadPeForms().then((f) => on && setForms(f)); return () => { on = false } }, [])
  const categories = useCategories()
  const { t } = useTranslation()
  return useMemo(() => {
    const groups = convertConfigToSidebarGroups(ensureZoonosisLiteMenu(settings.navigation_menu || []))
    return groups.map((g) => ({
      ...g,
      items: g.items.map((item) => {
        // PR 027: injected Dasbor Zoonosis Lite item carries an i18n key
        if (item.id === 'mod_zoonosis_lite' && item.labelKey) return { ...item, label: t(item.labelKey) }
        // PR 021: "Dasbor Kategori" sub-menu = active categories from master_disease_categories
        if (item.source === 'disease_categories') {
          const subs: SidebarItem[] = categories.map((c) => ({
            id: `sub_kategori_${c.code.toLowerCase()}`,
            label: c.short_name,
            icon: (c.icon && MENU_ICON_MAP[c.icon]) || Layers,
            href: `/dasbor/kategori/${kategoriSlug(c.code)}`,
            description: c.name,
          }))
          return { ...item, subItems: [...subs, ...(item.subItems || [])] }
        }
        if (item.source !== 'pe_forms') return item
        const generated: SidebarItem[] = [...forms]
          .sort((a, b) => peFormLabel(a.title).localeCompare(peFormLabel(b.title), 'id'))
          .map((f) => ({
            id: `sub_pe_${f.form_key}`,
            label: peFormLabel(f.title),
            icon: FileText,
            href: `/pe/${f.form_key}`,
            description: `Daftar dan input PE ${peFormLabel(f.title)}`,
          }))
        return { ...item, subItems: [...generated, ...(item.subItems || [])] }
      }),
    }))
  }, [settings.navigation_menu, forms, categories, t])
}

const under = (p: string, h: string) => p === h || p.startsWith(h.endsWith('/') ? h : `${h}/`)

/** Returns the deepest nav match for the current path: group, item, sub. */
export function useNavMatch(groups: SidebarGroup[]) {
  const pathname = usePathname() || '/'
  return useMemo(() => {
    let best: { group: SidebarGroup; item: SidebarItem; sub?: SidebarItem; len: number } | null = null
    for (const group of groups) {
      for (const item of group.items) {
        const cands: [SidebarItem | undefined, string | undefined][] = [[undefined, item.href], ...(item.subItems || []).map((s) => [s, s.href] as [SidebarItem, string | undefined])]
        for (const [sub, href] of cands) {
          if (!href || href === '#') continue
          const ok = href === '/' ? pathname === '/' : under(pathname, href)
          if (ok && (!best || href.length > best.len)) best = { group, item, sub, len: href.length }
        }
      }
    }
    return best
  }, [groups, pathname])
}

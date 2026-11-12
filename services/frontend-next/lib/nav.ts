'use client'
// PR 017 / PR 070: DB-driven navigation (app_settings.navigation_menu) tanpa hardcoded override.
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { convertConfigToSidebarGroups, DEFAULT_NAVIGATION_CONFIG, type SidebarGroup, type SidebarItem } from '@/lib/menu'
import { useSettings } from '@/lib/settings-context'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const PE_TITLE_PREFIX = /^Formulir\s+Penyelidikan\s+Epidemiologi\s*\(PE\)\s*/i

export function peFormLabel(title: string) {
  return title.replace(PE_TITLE_PREFIX, '').trim() || title
}

/** Navigasi sidebar sepenuhnya dinamis dari database (app_settings.navigation_menu). */
export function useNavGroups(): SidebarGroup[] {
  const { settings } = useSettings()
  const { t } = useTranslation()

  return useMemo(() => {
    const rawConfig = settings.navigation_menu && settings.navigation_menu.length > 0
      ? settings.navigation_menu
      : DEFAULT_NAVIGATION_CONFIG

    const groups = convertConfigToSidebarGroups(rawConfig)

    return groups.map((g) => ({
      ...g,
      items: g.items.map((item) => {
        const itemLabel = item.labelKey ? t(item.labelKey) || item.label : item.label
        return {
          ...item,
          label: itemLabel,
          subItems: item.subItems?.map((sub) => {
            const subLabel = sub.labelKey ? t(sub.labelKey) || sub.label : sub.label
            return {
              ...sub,
              label: subLabel,
            }
          }),
        }
      }),
    }))
  }, [settings.navigation_menu, t])
}

const under = (p: string, h: string) => p === h || p.startsWith(h.endsWith('/') ? h : `${h}/`)

/** Returns the deepest nav match for the current path: group, item, sub. */
export function useNavMatch(groups: SidebarGroup[]) {
  const pathname = usePathname() || '/'
  return useMemo(() => {
    let best: { group: SidebarGroup; item: SidebarItem; sub?: SidebarItem; len: number } | null = null
    for (const group of groups) {
      for (const item of group.items) {
        const cands: [SidebarItem | undefined, string | undefined][] = [
          [undefined, item.href],
          ...(item.subItems || []).map((s) => [s, s.href] as [SidebarItem, string | undefined]),
        ]
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

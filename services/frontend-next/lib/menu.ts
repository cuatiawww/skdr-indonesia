import type { LucideIcon } from 'lucide-react'
import { ClipboardPlus, LayoutDashboard, TableProperties } from 'lucide-react'

export interface SidebarItem { label: string; href: string; icon?: LucideIcon }
export interface SidebarGroup { title: string; items: SidebarItem[] }

export const sidebarMenu: SidebarGroup[] = [
  {
    title: 'SURVEILLANCE',
    items: [
      { label: 'Main Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Case Report Form', href: '/form', icon: ClipboardPlus },
      { label: 'Case Reports', href: '/reports', icon: TableProperties },
    ],
  },
]

import {
  Hospital,
  Building2,
  Home,
  Radio,
  Database,
  Activity,
  Search,
  MapPin,
  AlertTriangle,
  Users,
  Tags,
  BookText,
  ShieldCheck,
  Languages,
  Braces,
  Cpu,
  FileText,
  FileSpreadsheet,
  Settings,
  History,
  Stethoscope,
  Globe2,
  Tv,
  LayoutDashboard,
  SlidersHorizontal,
  Layers,
  Folder,
  BarChart3,
  LineChart,
  PieChart,
  Shield,
  CheckCircle2,
  Bookmark,
  Compass,
  Bell,
  Flame,
  CloudSun,
  Eye,
  Circle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Waypoints,
} from 'lucide-react'

// Icon registry for serializable navigation configurations
export const MENU_ICON_MAP: Record<string, any> = {
  Hospital,
  Building2,
  Home,
  Radio,
  Database,
  Activity,
  Search,
  MapPin,
  AlertTriangle,
  Users,
  Tags,
  BookText,
  ShieldCheck,
  Languages,
  Braces,
  Cpu,
  FileText,
  FileSpreadsheet,
  Settings,
  History,
  Stethoscope,
  Globe2,
  Tv,
  LayoutDashboard,
  SlidersHorizontal,
  Layers,
  Folder,
  BarChart3,
  LineChart,
  PieChart,
  Shield,
  CheckCircle2,
  Bookmark,
  Compass,
  Bell,
  Flame,
  CloudSun,
  Eye,
  ExternalLink,
  Waypoints,
}

export function resolveMenuIcon(name?: string) {
  if (!name) return Circle
  return MENU_ICON_MAP[name] || Circle
}

export type SidebarSubItemConfig = {
  id: string
  label: string
  labelKey?: string
  href: string
  icon?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  badge?: string
  description?: string
}

export type SidebarItemConfig = {
  id: string
  label: string
  labelKey?: string
  href?: string
  icon?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  badge?: string
  description?: string
  /** PR 017: 'pe_forms' = sub-items generated from the PE form registry */
  source?: string
  subItems?: SidebarSubItemConfig[]
}

export type SidebarGroupConfig = {
  id: string
  title: string
  titleKey?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  items: SidebarItemConfig[]
}

// Legacy-compatible types
export type SidebarItem = {
  id?: string
  label: string
  labelKey?: string
  icon: any
  iconName?: string
  href?: string
  url?: string
  external?: boolean
  order?: number
  enabled?: boolean
  badge?: string
  description?: string
  source?: string
  subItems?: SidebarItem[]
}

export type SidebarGroup = {
  id?: string
  title: string
  titleKey?: string
  order?: number
  enabled?: boolean
  items: SidebarItem[]
}

// PR 017: default (pre-settings) menu = app_settings.navigation_menu from migration 028 (first paint only;
// the DB value wins once settings load). Form PE sub-items per disease come from the PE form registry.
export const DEFAULT_NAVIGATION_CONFIG: SidebarGroupConfig[] = [
  {
    "id": "grp_beranda",
    "title": "Beranda",
    "order": 1,
    "enabled": true,
    "items": [
      {
        "id": "mod_beranda",
        "label": "Beranda",
        "href": "/",
        "icon": "Home",
        "description": "Ringkasan situasi dan rilis data surveilans terkini",
        "order": 1,
        "enabled": true
      }
    ]
  },
  {
    "id": "grp_dasbor",
    "title": "Dasbor",
    "order": 2,
    "enabled": true,
    "items": [
      {
        "id": "mod_main_dashboard",
        "label": "Dasbor Utama",
        "href": "/main-dashboard",
        "icon": "LayoutDashboard",
        "description": "Indikator SKDR, peta sebaran, dan Kinerja 7-1-7",
        "order": 1,
        "enabled": true
      },
      {
        "id": "mod_penyakit",
        "label": "Penyakit",
        "href": "/penyakit",
        "icon": "Stethoscope",
        "description": "Profil, tren, dan sebaran kasus per penyakit",
        "order": 2,
        "enabled": true
      },
      {
        "id": "mod_tv",
        "label": "Mode TV",
        "href": "/tv",
        "icon": "Tv",
        "description": "Tampilan layar lebar ruang pemantauan (sedang dalam pengembangan)",
        "order": 3,
        "enabled": true
      }
    ]
  },
  {
    "id": "grp_transaksi",
    "title": "Transaksi",
    "order": 3,
    "enabled": true,
    "items": [
      {
        "id": "mod_form_pe",
        "label": "Form PE",
        "href": "#",
        "icon": "FileText",
        "description": "Formulir Penyelidikan Epidemiologi per penyakit",
        "source": "pe_forms",
        "order": 1,
        "enabled": true,
        "subItems": [
          {
            "id": "sub_pe_daftar",
            "label": "Daftar PE",
            "href": "/pe",
            "icon": "FileSpreadsheet",
            "description": "Seluruh laporan PE lintas penyakit",
            "order": 99,
            "enabled": true
          }
        ]
      }
    ]
  },
  {
    "id": "grp_integrasi",
    "title": "Integrasi",
    "order": 4,
    "enabled": true,
    "items": [
      {
        "id": "mod_ebs_sync",
        "label": "Sinkronisasi EBS",
        "href": "/ebs",
        "icon": "Radio",
        "description": "Penarikan dan pemantauan data sinyal EBS",
        "order": 1,
        "enabled": true
      }
    ]
  },
  {
    "id": "grp_bantuan",
    "title": "Lainnya",
    "order": 5,
    "enabled": true,
    "items": [
      {
        "id": "mod_dokumentasi",
        "label": "Dokumentasi",
        "href": "/dokumentasi",
        "icon": "BookText",
        "description": "Panduan penggunaan, definisi indikator, dan sumber data",
        "order": 1,
        "enabled": true
      }
    ]
  }
]

export function convertConfigToSidebarGroups(config: SidebarGroupConfig[]): SidebarGroup[] {
  return config
    .filter((grp) => grp.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((grp) => ({
      id: grp.id,
      title: grp.title,
      titleKey: grp.titleKey,
      items: (grp.items || [])
        .filter((item) => item.enabled)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((item) => ({
          id: item.id,
          label: item.label,
          labelKey: item.labelKey,
          icon: resolveMenuIcon(item.icon),
          iconName: item.icon,
          href: item.href,
          badge: item.badge,
          description: item.description,
          source: item.source,
          subItems: item.subItems
            ?.filter((sub) => sub.enabled)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((sub) => ({
              id: sub.id,
              label: sub.label,
              labelKey: sub.labelKey,
              icon: resolveMenuIcon(sub.icon),
              iconName: sub.icon,
              href: sub.href,
              badge: sub.badge,
              description: sub.description,
            })),
        })),
    }))
}

// Standard Dashboard Menu (Fallback)
const BORDER_COUNTRIES_MENU_ITEM: SidebarItemConfig = {
  id: 'mod_border_countries',
  label: 'Border Countries',
  icon: 'Waypoints',
  href: '/border-countries',
  order: 3,
  enabled: true,
}

export function ensureBorderCountriesMenu(menu: SidebarGroupConfig[]): SidebarGroupConfig[] {
  if (menu.some((group) => (group.items || []).some((item) => item.href === '/border-countries' || item.id === 'mod_border_countries'))) {
    return menu
  }
  let inserted = false
  const withMaster = menu.map((group) => {
    if (inserted) return group
    const items = group.items || []
    const masterIndex = items.findIndex((item) => item.href === '/master-countries' || item.id === 'mod_master_countries')
    if (masterIndex < 0) return group
    inserted = true
    const next = [...items]
    next.splice(masterIndex + 1, 0, BORDER_COUNTRIES_MENU_ITEM)
    return { ...group, items: next }
  })
  if (inserted) return withMaster
  return withMaster.map((group) => {
    if (inserted) return group
    if (group.id === 'grp_configuration' || group.title === 'CONFIGURATION') {
      inserted = true
      return { ...group, items: [...(group.items || []), BORDER_COUNTRIES_MENU_ITEM] }
    }
    return group
  })
}

export const sidebarMenu: SidebarGroup[] = convertConfigToSidebarGroups(DEFAULT_NAVIGATION_CONFIG)

// Dedicated Console Menu in Full English
export const consoleMenu: SidebarGroup[] = []
// export const consoleMenu: SidebarGroup[] = [
//   {
//     title: 'SYSTEM MANAGEMENT',
//     items: [
//       { label: 'Configuration & Branding', icon: Settings, href: '/console/settings' },
//       { label: 'Configuration Modul', icon: SlidersHorizontal, href: '/console/configuration-modul' },
//       { label: 'Publication CMS & Reports', icon: FileText, href: '/reports/cms' },
//       { label: 'User Management', icon: Users, href: '/console/users' },
//       { label: 'Activity Audit Logs', icon: FileText, href: '/console/settings?tab=audit' },
//     ],
//   },
//   {
//     title: 'NAVIGATION',
//     items: [
//       { label: 'Home Portal', icon: Home, href: '/' },
//       { label: 'Main Dashboard', icon: LayoutDashboard, href: '/main-dashboard' },
//       { label: 'TV Command Center', icon: Activity, href: '/tv' },
//       { label: 'Reports', icon: FileText, href: '/reports' },
//       { label: 'Matrix & ledger', icon: FileSpreadsheet, href: '/reports/matrix' },
//     ],
//   },
// ]

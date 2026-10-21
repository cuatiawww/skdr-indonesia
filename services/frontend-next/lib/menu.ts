import {
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

// PR 014: default (pre-settings) menu = the SKDR menu from app_settings.navigation_menu (migration 021),
// so the first paint never shows the old NLP modules.
export const DEFAULT_NAVIGATION_CONFIG: SidebarGroupConfig[] = [
  {
    "id": "grp_surveillance",
    "items": [
      {
        "id": "mod_main_dashboard",
        "href": "/main-dashboard",
        "icon": "LayoutDashboard",
        "label": "Dasbor Utama",
        "order": 1,
        "enabled": true
      },
      {
        "id": "mod_penyakit",
        "href": "/penyakit",
        "icon": "Stethoscope",
        "label": "Penyakit",
        "order": 2,
        "enabled": true
      },
      {
        "id": "mod_ebs_sync",
        "href": "/ebs",
        "icon": "Radio",
        "label": "Sinkronisasi EBS",
        "order": 3,
        "enabled": true
      },
      {
        "id": "mod_dokumentasi",
        "href": "/dokumentasi",
        "icon": "BookText",
        "label": "Dokumentasi",
        "order": 5,
        "enabled": true
      }
    ],
    "order": 1,
    "title": "SURVEILANS",
    "enabled": true
  },
  {
    "id": "grp_master_data",
    "items": [
      {
        "id": "mod_master_data",
        "href": "#",
        "icon": "Database",
        "label": "Master Data",
        "order": 1,
        "enabled": true,
        "subItems": [
          {
            "id": "sub_master_provinsi",
            "href": "/master/provinsi",
            "icon": "Globe2",
            "label": "Data Provinsi",
            "order": 1,
            "enabled": true
          },
          {
            "id": "sub_master_kabupaten",
            "href": "/master/kabupaten",
            "icon": "MapPin",
            "label": "Data Kabupaten/Kota",
            "order": 2,
            "enabled": true
          },
          {
            "id": "sub_master_penyakit",
            "href": "/master/penyakit",
            "icon": "Stethoscope",
            "label": "Data Penyakit",
            "order": 3,
            "enabled": true
          }
        ]
      }
    ],
    "order": 3,
    "title": "MASTER DATA",
    "enabled": true
  },
  {
    "id": "grp_form_pe",
    "items": [
      {
        "id": "mod_form_pe",
        "href": "#",
        "icon": "FileText",
        "label": "Form PE",
        "order": 1,
        "enabled": true,
        "subItems": [
          {
            "id": "sub_pe_lepto",
            "href": "/pe/lepto",
            "icon": "Activity",
            "label": "Leptospirosis",
            "order": 1,
            "enabled": true
          },
          {
            "id": "sub_pe_rabies",
            "href": "/pe/rabies",
            "icon": "Bell",
            "label": "Rabies/GHPR",
            "order": 2,
            "enabled": true
          },
          {
            "id": "sub_pe_antraks",
            "href": "/pe/antraks",
            "icon": "Flame",
            "label": "Antraks",
            "order": 3,
            "enabled": true
          },
          {
            "id": "sub_pe_ai",
            "href": "/pe/ai",
            "icon": "Globe2",
            "label": "Avian Influenza",
            "order": 4,
            "enabled": true
          }
        ]
      }
    ],
    "order": 2,
    "title": "FORM PE",
    "enabled": true
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

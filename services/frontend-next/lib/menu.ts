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
  ClipboardCheck,
  Utensils,
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
  ClipboardCheck,
  Utensils, // PR 034
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

/** PR 029: which sidebar a group belongs to. 'home' groups show only on Beranda (full sidebar). */
export type NavArea = 'home' | 'dashboard' | 'tatakelola'

export type SidebarGroupConfig = {
  id: string
  title: string
  titleKey?: string
  order?: number
  enabled: boolean
  targetRoles?: string[]
  /** PR 029: sidebar area + access hints (enforced by AuthGuard/backend, these only drive display) */
  area?: NavArea
  requiresAuth?: boolean
  permission?: string
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
  area?: NavArea
  requiresAuth?: boolean
  permission?: string
  items: SidebarItem[]
}

// PR 017: default (pre-settings) menu = app_settings.navigation_menu (first paint only; the DB value wins once
// settings load). PR 029: mirrors migration 051 (areas home / dashboard / tatakelola, Dasbor Limited, Manajemen Akses).
// Form PE sub-items per disease come from the PE form registry.
const it = (id: string, label: string, href: string, icon: string, order: number, extra: Partial<SidebarItemConfig> = {}): SidebarItemConfig =>
  ({ id, label, href, icon, order, enabled: true, ...extra })
export const DEFAULT_NAVIGATION_CONFIG: SidebarGroupConfig[] = [
  { id: 'grp_beranda', title: 'Beranda', order: 1, enabled: true, area: 'home', items: [it('mod_beranda', 'Beranda', '/beranda', 'Home', 1)] },
  { id: 'grp_dasbor', title: 'Dasbor', order: 2, enabled: true, area: 'dashboard', items: [
    it('mod_dashboard_home', 'Ringkasan Dasbor', '/dashboard', 'LayoutDashboard', 0),
    it('mod_main_dashboard', 'Dasbor SKDR', '/main-dashboard', 'LayoutDashboard', 1),
    it('mod_dasbor_ebs_ibs', 'Dasbor SKDR EBS & IBS', '/dasbor/ebs-ibs', 'BarChart3', 1.8, { enabled: false, description: 'Dasbor analitik dari Transaksi Form Laporan EBS, Entri Data Agregat IBS, dan Form Individu IBS' }),
    it('mod_dasbor_mbg', 'Dasbor MBG', '/dasbor/mbg', 'Utensils', 1.9, { description: 'Dasbor Program Makan Bergizi Gratis: pengawasan standar gizi SPPG dan kejadian keracunan pangan MBG' }),
    it('mod_penyakit', 'Penyakit', '/penyakit', 'Stethoscope', 2),
    it('mod_tv', 'Mode TV', '/tv', 'Tv', 3),
  ] },
  { id: 'grp_dasbor_limited', title: 'Dasbor Limited', order: 3, enabled: true, area: 'dashboard', requiresAuth: true, items: [
    it('mod_spasial', 'Spasial', '/dashboard/spasial', 'MapPin', 1),
    it('mod_matriks_analisa', 'Matriks Analisa', '/dashboard/matriks-analisa', 'Layers', 2),
  ] },
  { id: 'grp_tatakelola', title: 'Tata Kelola', order: 4, enabled: true, area: 'tatakelola', requiresAuth: true, permission: 'tatakelola', items: [
    it('mod_tatakelola_home', 'Ringkasan Tata Kelola', '/tatakelola', 'Shield', 1),
  ] },
  { id: 'grp_transaksi', title: 'Transaksi', order: 5, enabled: true, area: 'tatakelola', items: [
    it('mod_form_pe', 'Form PE', '#', 'FileText', 1, { source: 'pe_forms', subItems: [
      { id: 'sub_pe_daftar', label: 'Daftar PE', href: '/pe', icon: 'FileSpreadsheet', order: 99, enabled: true },
    ] }),
    it('mod_laporan_ebs', 'Laporan EBS', '/ebs/laporan', 'Radio', 2, { description: 'Laporan kejadian/rumor penyakit di masyarakat — jumlah kasus & kematian per kelompok usia dan jenis kelamin' }), // PR 030, label PR 035
    it('mod_laporan_ibs', 'Laporan Agregat IBS', '/ibs/laporan', 'FileSpreadsheet', 3, { description: 'Rekap mingguan Puskesmas/unit — jumlah kasus, kematian, dan lab per penyakit + total kunjungan' }), // PR 030, label PR 031/035
    it('mod_laporan_individu', 'Laporan Individu IBS', '/ibs/individu', 'Stethoscope', 4, { description: 'Data satu pasien per laporan — diagnosa, pemeriksaan, dan status akhir pasien' }), // PR 031, label PR 035
    // PR 034: satu menu "Program MBG" — Pengawasan Gizi (PR 033) + Keracunan Pangan
    it('mod_program_mbg', 'Program MBG', '#', 'Utensils', 5, { description: 'Program Makan Bergizi Gratis — pengawasan standar gizi SPPG dan laporan keracunan pangan', subItems: [
      { id: 'mod_pengawasan_gizi', label: 'Pengawasan Gizi MBG', href: '/pengawasan-gizi', icon: 'ClipboardCheck', order: 1, enabled: true, description: 'Kunjungan pengawasan standar gizi MBG ke SPPG — Formulir 1–13 (ketenagaan, SOP, daya terima, rekap)' },
      { id: 'mod_keracunan_mbg', label: 'Keracunan Pangan MBG', href: '/keracunan-mbg', icon: 'AlertTriangle', order: 2, enabled: true, description: 'Laporan cepat & penyelidikan kejadian keracunan pangan MBG — kasus harian, lingkungan, laboratorium' },
    ] }),
  ] },
  { id: 'grp_integrasi', title: 'Integrasi', order: 6, enabled: true, area: 'tatakelola', permission: 'integrasi', items: [
    it('mod_ebs_sync', 'Sinkronisasi EBS', '/ebs', 'Radio', 1),
  ] },
  { id: 'grp_akses', title: 'Manajemen Akses', order: 8, enabled: true, area: 'tatakelola', requiresAuth: true, permission: 'user_management', items: [
    it('mod_pengguna', 'Pengguna', '/tatakelola/pengguna', 'Users', 1),
    it('mod_peran', 'Peran & Hak Akses', '/tatakelola/peran', 'ShieldCheck', 2),
    it('mod_log_akses', 'Log Akses', '/tatakelola/log-akses', 'History', 3),
  ] },
  { id: 'grp_bantuan', title: 'Lainnya', order: 9, enabled: true, area: 'dashboard', items: [
    it('mod_dokumentasi', 'Dokumentasi', '/dokumentasi', 'BookText', 1),
  ] },
]

export function convertConfigToSidebarGroups(config: SidebarGroupConfig[]): SidebarGroup[] {
  return config
    .filter((grp) => grp.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((grp) => ({
      id: grp.id,
      title: grp.title,
      titleKey: grp.titleKey,
      area: grp.area,
      requiresAuth: grp.requiresAuth,
      permission: grp.permission,
      items: (grp.items || [])
        .filter((item) => item.enabled && item.id !== 'mod_dasbor_ebs_ibs')
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((item) => ({
          id: item.id,
          label: item.id === 'mod_main_dashboard' && (item.label === 'Dasbor Utama' || !item.label) ? 'Dasbor SKDR' : item.label,
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

// PR 027: "Dasbor Zoonosis Lite" sits directly under Dasbor Utama. Injected on the client (display only, never saved)
// so no navigation_menu migration is needed; skipped when the DB menu already has the item.
export const ZOONOSIS_LITE_MENU_ITEM: SidebarItemConfig = {
  id: 'mod_zoonosis_lite',
  label: 'Dasbor Zoonosis Lite',
  labelKey: 'skdr.lite.menu',
  icon: 'Activity',
  href: '/dasbor/zoonosis-lite',
  description: 'Antraks, Rabies, Leptospirosis, Flu Burung: CFR dan peta sebaran',
  order: 1.5,
  enabled: true,
}

export function ensureZoonosisLiteMenu(menu: SidebarGroupConfig[]): SidebarGroupConfig[] {
  if (menu.some((group) => (group.items || []).some((item) => item.id === ZOONOSIS_LITE_MENU_ITEM.id || item.href === ZOONOSIS_LITE_MENU_ITEM.href))) {
    return menu
  }
  let inserted = false
  return menu.map((group) => {
    if (inserted) return group
    const main = (group.items || []).find((item) => item.href === '/main-dashboard' || item.id === 'mod_main_dashboard')
    if (!main) return group
    inserted = true
    return { ...group, items: [...(group.items || []), { ...ZOONOSIS_LITE_MENU_ITEM, order: (main.order || 0) + 0.5 }] }
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

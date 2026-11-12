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
  Clock,
  TrendingUp,
  Bug,
  FolderTree,
  FilePlus,
  Key,
  Lock,
  Sparkles,
  Share2,
  Calendar,
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
  Clock,
  TrendingUp,
  Bug,
  FolderTree,
  FilePlus,
  Key,
  Lock,
  Sparkles,
  Share2,
  Calendar,
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

export const DASBOR_SKDR_SUB_ITEMS: SidebarSubItemConfig[] = [
  {
    id: 'mod_skdr_ringkasan',
    label: 'Ringkasan Utama (IBS & EBS)',
    href: '/dashboard/skdr/ringkasan',
    icon: 'LayoutDashboard',
    order: 1,
    enabled: true,
    description: 'Sintesis komando surveilans nasional: beban kasus IBS, rumor & sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster',
  },
  {
    id: 'mod_skdr_tren',
    label: 'Tren Penyakit (IBS)',
    href: '/dashboard/skdr/tren',
    icon: 'TrendingUp',
    order: 2,
    enabled: true,
    description: 'Kurva epidemiologi mingguan (Minggu 1–52) per penyakit indikator dengan ambang batas (Mean + 2SD), komparasi multi-tahun, multi-wilayah, dan korelasi iklim ERA5',
  },
  {
    id: 'mod_skdr_distribusi',
    label: 'Distribusi & Demografi',
    href: '/dashboard/skdr/distribusi',
    icon: 'Users',
    order: 3,
    enabled: true,
    description: 'Analisa distribusi orang (piramida golongan usia dan jenis kelamin), sebaran unit pelapor (Puskesmas, RS, Klinik, Lab), serta peringkat insidensi wilayah',
  },
  {
    id: 'mod_skdr_717',
    label: 'WHO 7-1-7 & Kinerja EBS',
    href: '/dashboard/skdr/717',
    icon: 'Clock',
    order: 4,
    enabled: true,
    description: 'Pengukuran ketepatan respon standar internasional WHO: deteksi ≤7 hari, notifikasi ≤1 hari, respon ≤7 hari, kualitas sinyal, konversi KLB, dan AAR',
  },
  {
    id: 'mod_skdr_deteksi',
    label: 'Deteksi Outbreak & Iklim',
    href: '/dashboard/skdr/deteksi',
    icon: 'Activity',
    order: 5,
    enabled: true,
    description: 'Algoritma statistik deteksi dini KLB (EARS C1–C3 & Farrington), korelasi titik panas karhutla (NASA FIRMS) vs lonjakan ISPA, serta radar kapasitas IHR/JEE',
  },
  {
    id: 'mod_skdr_buletin',
    label: 'Buletin & Infografis',
    href: '/dashboard/skdr/buletin',
    icon: 'FileText',
    order: 6,
    enabled: true,
    description: 'Generator laporan buletin mingguan otomatis skala nasional/provinsi dan infografis digital responsif siap unduh (PNG) serta cetak PDF',
  },
]

export const DASBOR_SKDR_MENU_ITEM: SidebarItemConfig = {
  id: 'mod_main_dashboard',
  label: 'Dasbor SKDR',
  href: '#',
  icon: 'LayoutDashboard',
  order: 1,
  enabled: true,
  description: 'Dasbor komando surveilans terpadu SKDR: Ringkasan IBS & EBS, Tren Penyakit, Distribusi Demografi, Kinerja 7-1-7, Deteksi Outbreak, dan Buletin',
  subItems: DASBOR_SKDR_SUB_ITEMS,
}

export const DASBOR_MBG_SUB_ITEMS: SidebarSubItemConfig[] = [
  {
    id: 'mod_dasbor_mbg_ringkasan',
    label: 'Ringkasan Eksekutif',
    href: '/dashboard/mbg/ringkasan',
    icon: 'LayoutDashboard',
    order: 1,
    enabled: true,
    description: 'Kajian eksekutif pimpinan, rekomendasi pengerahan sumber daya, korelasi risiko pengawasan × kejadian, dan peta komparasi spasial',
  },
  {
    id: 'mod_dasbor_mbg_keracunan',
    label: 'Keracunan Pangan',
    href: '/dashboard/mbg/keracunan',
    icon: 'AlertTriangle',
    order: 2,
    enabled: true,
    description: 'Analisa epidemiologi KLB keracunan pangan: beban kasus/CFR, peta sebaran, kurva epidemi, ketepatan respons 24 jam, etiologi lab & lingkungan dapur',
  },
  {
    id: 'mod_dasbor_mbg_pengawasan',
    label: 'Pengawasan Gizi',
    href: '/dashboard/mbg/pengawasan',
    icon: 'ClipboardCheck',
    order: 3,
    enabled: true,
    description: 'Analisa kepatuhan standar gizi & audit SPPG (Formulir 1–13): cakupan, aspek terlemah, matriks SPPG × formulir, temuan & daftar prioritas pembinaan',
  },
]

export const DASBOR_MBG_MENU_ITEM: SidebarItemConfig = {
  id: 'mod_dasbor_mbg',
  label: 'Dasbor MBG',
  href: '#',
  icon: 'Utensils',
  order: 1.9,
  enabled: true,
  description: 'Dasbor analitik Program Makan Bergizi Gratis (MBG): Ringkasan Eksekutif, Analisa Keracunan Pangan, dan Analisa Pengawasan Gizi',
  subItems: DASBOR_MBG_SUB_ITEMS,
}

export const DASBOR_ZOONOSIS_SUB_ITEMS: SidebarSubItemConfig[] = [
  {
    id: 'sub_zoonosis_general',
    label: 'Zoonosis General',
    href: '/dasbor/zoonosis-general',
    icon: 'LayoutDashboard',
    order: 1,
    enabled: true,
    description: 'Sintesis komprehensif penyakit zoonosis: beban kasus, CFR, kurva tren, alert SKDR, dan peta sebaran',
  },
  {
    id: 'sub_zoonosis_lite',
    label: 'Zoonosis Lite',
    labelKey: 'skdr.lite.menu',
    href: '/dasbor/zoonosis-lite',
    icon: 'Activity',
    order: 2,
    enabled: true,
    description: 'Antraks, Rabies, Leptospirosis, Flu Burung: CFR dan peta sebaran',
  },
  {
    id: 'sub_kategori_pd3i',
    label: 'PD3I',
    href: '/dasbor/kategori/pd3i',
    icon: 'Shield',
    order: 3,
    enabled: true,
    description: 'Penyakit yang Dapat Dicegah Dengan Imunisasi (PD3I)',
  },
  {
    id: 'sub_kategori_tular_vektor',
    label: 'Tular Vektor',
    href: '/dasbor/kategori/tular-vektor',
    icon: 'Bug',
    order: 4,
    enabled: true,
    description: 'Penyakit Tular Vektor dan Zoonotik',
  },
  {
    id: 'sub_kategori_menular_langsung',
    label: 'Menular Langsung',
    href: '/dasbor/kategori/menular-langsung',
    icon: 'Users',
    order: 5,
    enabled: true,
    description: 'Penyakit Menular Langsung',
  },
  {
    id: 'sub_kategori_tular_makanan_air',
    label: 'Tular Makanan & Air',
    href: '/dasbor/kategori/tular-makanan-air',
    icon: 'Layers',
    order: 6,
    enabled: true,
    description: 'Penyakit Tular Makanan dan Air Terkontaminasi',
  },
  {
    id: 'sub_kategori_pie',
    label: 'PIE',
    href: '/dasbor/kategori/pie',
    icon: 'AlertTriangle',
    order: 7,
    enabled: true,
    description: 'Penyakit Infeksi Emerging (PIE)',
  },
]

export const DASBOR_ZOONOSIS_MENU_ITEM: SidebarItemConfig = {
  id: 'mod_dasbor_kategori',
  label: 'Dasbor Zoonosis',
  href: '#',
  icon: 'Bug',
  order: 1.7,
  enabled: true,
  description: 'Dasbor analitik penyakit zoonosis dan per kategori',
  subItems: DASBOR_ZOONOSIS_SUB_ITEMS,
}

export const FORM_PE_SUB_ITEMS: SidebarSubItemConfig[] = [
  { id: 'sub_pe_daftar', label: 'Daftar PE', href: '/pe', icon: 'FileSpreadsheet', order: 1, enabled: true, description: 'Daftar dan ringkasan penyelidikan epidemiologi semua penyakit' },
  { id: 'sub_pe_lepto', label: 'Leptospirosis', href: '/pe/lepto', icon: 'FileText', order: 2, enabled: true, description: 'Formulir PE Leptospirosis' },
  { id: 'sub_pe_rabies', label: 'Rabies', href: '/pe/rabies', icon: 'FileText', order: 3, enabled: true, description: 'Formulir PE Rabies / GHPR' },
  { id: 'sub_pe_antraks', label: 'Antraks', href: '/pe/antraks', icon: 'FileText', order: 4, enabled: true, description: 'Formulir PE Antraks' },
  { id: 'sub_pe_ai', label: 'Flu Burung', href: '/pe/ai', icon: 'FileText', order: 5, enabled: true, description: 'Formulir PE Flu Burung / Avian Influenza' },
]

export const DEFAULT_NAVIGATION_CONFIG: SidebarGroupConfig[] = [
  { id: 'grp_beranda', title: 'Beranda', order: 1, enabled: true, area: 'home', items: [it('mod_beranda', 'Beranda', '/beranda', 'Home', 1)] },
  { id: 'grp_dasbor', title: 'Dasbor', order: 2, enabled: true, area: 'dashboard', items: [
    it('mod_dashboard_home', 'Ringkasan Dasbor', '/dashboard', 'LayoutDashboard', 0),
    DASBOR_SKDR_MENU_ITEM,
    DASBOR_ZOONOSIS_MENU_ITEM,
    it('mod_dasbor_ebs_ibs', 'Dasbor SKDR EBS & IBS', '/dasbor/ebs-ibs', 'BarChart3', 1.8, { enabled: false, description: 'Dasbor analitik dari Transaksi Form Laporan EBS, Entri Data Agregat IBS, dan Form Individu IBS' }),
    DASBOR_MBG_MENU_ITEM,
    it('mod_penyakit', 'Penyakit', '/penyakit', 'Stethoscope', 2),
    it('mod_tv', 'Mode TV', '/tv', 'Tv', 3),
  ] },
  { id: 'grp_dasbor_limited', title: 'Dasbor Limited', order: 3, enabled: true, area: 'dashboard', requiresAuth: true, items: [
    it('mod_spasial', 'Spasial', '/dashboard/spasial', 'MapPin', 1),
    it('mod_matriks_analisa', 'Matriks Analisa', '/dashboard/matriks-analisa', 'Layers', 2),
  ] },
  { id: 'grp_tatakelola', title: 'Tata Kelola', order: 4, enabled: true, area: 'tatakelola', requiresAuth: true, permission: 'tatakelola', items: [
    it('mod_tatakelola_home', 'Ringkasan Tata Kelola', '/tatakelola', 'Shield', 1),
    it('mod_navigasi', 'Modul & Navigasi', '/tatakelola/navigasi', 'SlidersHorizontal', 2, { description: 'Pengaturan dinamis nama navigasi, menu, dan sub-menu sidebar' }),
  ] },
  { id: 'grp_transaksi', title: 'Transaksi', order: 5, enabled: true, area: 'tatakelola', items: [
    it('mod_form_pe', 'Form PE', '#', 'FileText', 1, { subItems: FORM_PE_SUB_ITEMS }),
    it('mod_laporan_ebs', 'Laporan EBS', '/ebs/laporan', 'Radio', 2, { description: 'Laporan kejadian/rumor penyakit di masyarakat — jumlah kasus & kematian per kelompok usia dan jenis kelamin' }), // PR 030, label PR 035
    it('mod_laporan_ibs', 'Laporan Agregat IBS', '/ibs/laporan', 'FileSpreadsheet', 3, { description: 'Rekap mingguan Puskesmas/unit — jumlah kasus, kematian, dan lab per penyakit + total kunjungan' }), // PR 030, label PR 031/035
    it('mod_laporan_individu', 'Laporan Individu IBS', '/ibs/individu', 'Stethoscope', 4, { description: 'Data satu pasien per laporan — diagnosa, pemeriksaan, dan status akhir pasien' }), // PR 031, label PR 035
    // PR 034: satu menu "Program MBG" — Pengawasan Gizi (PR 033) + Keracunan Pangan
    it('mod_program_mbg', 'Program MBG', '#', 'Utensils', 5, { description: 'Program Makan Bergizi Gratis — pengawasan standar gizi SPPG dan laporan keracunan pangan', subItems: [
      { id: 'mod_dasbor_mbg_program', label: 'Dasbor MBG', href: '/dashboard/mbg/ringkasan', icon: 'LayoutDashboard', order: 0, enabled: true, description: 'Ringkasan & tautan risiko: Keracunan Pangan MBG (kejadian) × Pengawasan Gizi MBG (pencegahan)' }, // PR 052
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

export function normalizeDasborMbgMenu(config: SidebarGroupConfig[]): SidebarGroupConfig[] {
  return config
}

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

export function ensureBorderCountriesMenu(menu: SidebarGroupConfig[]): SidebarGroupConfig[] {
  return menu
}

export function ensureZoonosisLiteMenu(menu: SidebarGroupConfig[]): SidebarGroupConfig[] {
  return menu
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

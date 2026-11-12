// PR 057: Filter state & navigation metadata for the unified Dasbor SKDR
import { getCurrentEpiWeek, getWeeksInYear } from '@/lib/epi-week'
import {
  Activity,
  BarChart3,
  Clock,
  FileText,
  LayoutDashboard,
  TrendingUp,
  Users,
} from 'lucide-react'

export type SkdrTab = 'ringkasan' | 'tren' | 'distribusi' | '717' | 'deteksi' | 'buletin'
export type SumberFilter = 'semua' | 'ibs' | 'ebs'
export type EarsAlgoritma = 'c1' | 'c2' | 'c3' | 'farrington'
export type ModeTren = 'tahunan' | 'multiTahun' | 'komparasiWilayah'

export interface SkdrFilter {
  sumber: SumberFilter
  sy: number
  sw: number
  ey: number
  ew: number
  prov: string[]
  kab: string[]
  penyakit: string[]
  modeTren: ModeTren
  komparasiWilayah: string[]
  iklimOverlay: boolean
  earsAlgoritma: EarsAlgoritma
  earsHanyaAlert: boolean
  hotspotLag: number
}

export interface SkdrPageMeta {
  key: SkdrTab
  slug: string
  label: string
  icon: any
  eyebrow: string
  title: string
  desc: string
}

export const SKDR_PAGES: SkdrPageMeta[] = [
  {
    key: 'ringkasan',
    slug: 'ringkasan',
    label: 'Ringkasan Utama (IBS & EBS)',
    icon: LayoutDashboard,
    eyebrow: 'Dasbor SKDR · Ringkasan Terpadu',
    title: 'Ringkasan Eksekutif Surveilans Nasional',
    desc: 'Sintesis komando surveilans nasional: beban kasus IBS, sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster.',
  },
  {
    key: 'tren',
    slug: 'tren',
    label: 'Tren Penyakit (IBS)',
    icon: TrendingUp,
    eyebrow: 'Dasbor SKDR · Surveilans Berbasis Indikator',
    title: 'Kurva Tren Penyakit & Ambang Batas Alert',
    desc: 'Kurva epidemiologi mingguan (Minggu 1–52) per penyakit indikator dengan ambang batas (Mean + 2SD), komparasi multi-tahun, multi-wilayah, dan korelasi iklim ERA5.',
  },
  {
    key: 'distribusi',
    slug: 'distribusi',
    label: 'Distribusi & Demografi',
    icon: Users,
    eyebrow: 'Dasbor SKDR · Epidemiologi Deskriptif',
    title: 'Distribusi Umur, Gender & Peringkat Wilayah',
    desc: 'Analisa distribusi orang (piramida golongan usia dan jenis kelamin), sebaran unit pelapor (Puskesmas, RS, Klinik, Lab), serta peringkat insidensi wilayah.',
  },
  {
    key: '717',
    slug: '717',
    label: 'WHO 7-1-7 & Kinerja EBS',
    icon: Clock,
    eyebrow: 'Dasbor SKDR · Respon Standar Global',
    title: 'Capaian WHO 7-1-7 & Evaluasi Sinyal EBS',
    desc: 'Pengukuran ketepatan respon standar internasional WHO: deteksi ≤7 hari, notifikasi ≤1 hari, respon ≤7 hari, kualitas sinyal, konversi KLB, dan AAR.',
  },
  {
    key: 'deteksi',
    slug: 'deteksi',
    label: 'Deteksi Outbreak & Iklim',
    icon: Activity,
    eyebrow: 'Dasbor SKDR · Analitik Lanjutan',
    title: 'Deteksi Outbreak Statistik (EARS) & Hotspot FIRMS',
    desc: 'Algoritma statistik deteksi dini KLB (EARS C1–C3 & Farrington), korelasi titik panas karhutla (NASA FIRMS) vs lonjakan ISPA, serta radar kapasitas IHR/JEE.',
  },
  {
    key: 'buletin',
    slug: 'buletin',
    label: 'Buletin & Infografis',
    icon: FileText,
    eyebrow: 'Dasbor SKDR · Diseminasi Informasi',
    title: 'Buletin Epidemiologi & Infografis Mingguan',
    desc: 'Generator laporan buletin mingguan otomatis skala nasional/provinsi dan infografis digital responsif siap unduh (PNG) serta cetak PDF.',
  },
]

export const skdrHref = (t: SkdrTab) => `/dashboard/skdr/${SKDR_PAGES.find((x) => x.key === t)?.slug || 'ringkasan'}`

export function defaultSkdrFilter(): SkdrFilter {
  const cur = getCurrentEpiWeek()
  const year = cur.year || new Date().getFullYear()
  const week = Math.max(1, cur.week || 1)
  return {
    sumber: 'semua',
    sy: year,
    sw: 1,
    ey: year,
    ew: week,
    prov: [],
    kab: [],
    penyakit: [], // Default Semua Penyakit (Nasional)
    modeTren: 'tahunan',
    komparasiWilayah: [],
    iklimOverlay: false,
    earsAlgoritma: 'c2',
    earsHanyaAlert: false,
    hotspotLag: 0,
  }
}

export function presetRange(kind: '4m' | '12m' | 'tahun' | 'semua'): Pick<SkdrFilter, 'sy' | 'sw' | 'ey' | 'ew'> {
  const cur = getCurrentEpiWeek()
  const curY = cur.year || new Date().getFullYear()
  const curW = Math.max(1, cur.week || 1)
  if (kind === 'tahun' || kind === 'semua') {
    return { sy: curY, sw: 1, ey: curY, ew: curW }
  }
  const n = kind === '4m' ? 4 : 12
  let ey = curY
  let ew = curW
  let sy = ey
  let sw = ew - (n - 1)
  while (sw < 1) {
    sy -= 1
    sw += getWeeksInYear(sy)
  }
  return { sy, sw, ey, ew }
}

const LIST = (v: string | null, sep = ',') =>
  (v || '')
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean)

export function readSkdrFilter(sp: URLSearchParams): SkdrFilter {
  const d = defaultSkdrFilter()
  const num = (k: string, def: number) => {
    const val = Number(sp.get(k))
    return Number.isFinite(val) && val > 0 ? val : def
  }
  const s = (sp.get('sumber') || '').toLowerCase()
  const sumber: SumberFilter = s === 'ebs' ? 'ebs' : s === 'ibs' ? 'ibs' : 'semua'
  const ears = (sp.get('ears') || '').toLowerCase()
  const earsAlgoritma: EarsAlgoritma =
    ears === 'c1' || ears === 'c3' || ears === 'farrington' ? ears : 'c2'

  const modeRaw = (sp.get('modeTren') || '').trim()
  const modeTren: ModeTren =
    modeRaw === 'multiTahun' || modeRaw === 'komparasiWilayah' ? modeRaw : 'tahunan'

  return {
    sumber,
    sy: num('startYear', d.sy),
    sw: num('startWeek', d.sw),
    ey: num('endYear', d.ey),
    ew: num('endWeek', d.ew),
    prov: LIST(sp.get('prov')),
    kab: LIST(sp.get('kab')),
    penyakit: sp.get('penyakit') ? LIST(sp.get('penyakit')) : d.penyakit,
    modeTren,
    komparasiWilayah: LIST(sp.get('komparasi')),
    iklimOverlay: sp.get('iklim') === '1',
    earsAlgoritma,
    earsHanyaAlert: sp.get('hanyaAlert') === '1',
    hotspotLag: Number(sp.get('lag')) || 0,
  }
}

export function writeSkdrFilter(f: SkdrFilter): string {
  const sp = new URLSearchParams()
  if (f.sumber !== 'semua') sp.set('sumber', f.sumber)
  sp.set('startYear', String(f.sy))
  sp.set('startWeek', String(f.sw))
  sp.set('endYear', String(f.ey))
  sp.set('endWeek', String(f.ew))
  if (f.prov.length) sp.set('prov', f.prov.join(','))
  if (f.kab.length) sp.set('kab', f.kab.join(','))
  if (f.penyakit.length) sp.set('penyakit', f.penyakit.join(','))
  if (f.modeTren !== 'tahunan') sp.set('modeTren', f.modeTren)
  if (f.komparasiWilayah.length) sp.set('komparasi', f.komparasiWilayah.join(','))
  if (f.iklimOverlay) sp.set('iklim', '1')
  if (f.earsAlgoritma !== 'c2') sp.set('ears', f.earsAlgoritma)
  if (f.earsHanyaAlert) sp.set('hanyaAlert', '1')
  if (f.hotspotLag > 0) sp.set('lag', String(f.hotspotLag))
  return sp.toString()
}

export function activeFilterCount(f: SkdrFilter, tab: SkdrTab): number {
  let count = 0
  if (f.sumber !== 'semua') count++
  const cur = getCurrentEpiWeek()
  if (f.sy !== cur.year || f.sw !== 1 || f.ey !== cur.year || f.ew !== cur.week) count++
  if (f.prov.length) count += f.prov.length
  if (f.kab.length) count += f.kab.length
  if (f.penyakit.length > 1) count += f.penyakit.length - 1
  if (tab === 'tren' && f.modeTren !== 'tahunan') count++
  if (tab === 'tren' && f.komparasiWilayah.length) count += f.komparasiWilayah.length
  if (tab === 'tren' && f.iklimOverlay) count++
  if (tab === 'deteksi' && f.earsAlgoritma !== 'c2') count++
  if (tab === 'deteksi' && f.earsHanyaAlert) count++
  if (tab === 'deteksi' && f.hotspotLag > 0) count++
  return count
}

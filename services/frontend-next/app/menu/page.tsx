'use client'
// PR 073 / PR 074: /menu = Landing page copying /dashboard with custom /menu sidebar
// and 5 category views: Kinerja, IBS, EBS, MBG, and Zoonosis.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bug,
  ClipboardCheck,
  Clock,
  FileText,
  Layers,
  LayoutDashboard,
  MapPin,
  Radio,
  Shield,
  Stethoscope,
  TrendingUp,
  Tv,
  Users,
  Utensils,
} from 'lucide-react'
import { useAuth } from '@/lib/skdr-auth'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import KinerjaView from '@/components/dasbor-menu/KinerjaView'

type TabKey = 'kinerja' | 'ibs' | 'ebs' | 'mbg' | 'zoonosis'

type MenuItemCard = {
  title: string
  href: string
  icon: any
  description: string
  badge?: string
}

type TabConfig = {
  key: TabKey
  label: string
  icon: any
  title: string
  subtitle: string
  items: MenuItemCard[]
}

const CATEGORIES: Record<TabKey, TabConfig> = {
  kinerja: {
    key: 'kinerja',
    label: 'Kinerja',
    icon: Activity,
    title: 'Kinerja Surveilans SKDR',
    subtitle:
      'Pengukuran ketepatan respons standar WHO 7-1-7, kinerja kelengkapan pelaporan faskes, dan sintesis ringkasan komando nasional',
    items: [
      {
        title: 'Ringkasan Utama (IBS & EBS)',
        href: '/dashboard/skdr/ringkasan',
        icon: LayoutDashboard,
        description:
          'Sintesis komando surveilans nasional: beban kasus IBS, rumor & sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster',
      },
      {
        title: 'WHO 7-1-7 & Kinerja EBS',
        href: '/dashboard/skdr/717',
        icon: Clock,
        description:
          'Pengukuran ketepatan respon standar internasional WHO: deteksi ≤7 hari, notifikasi ≤1 hari, respon ≤7 hari, kualitas sinyal, konversi KLB, dan AAR',
      },
      {
        title: 'Deteksi Outbreak & Iklim',
        href: '/dashboard/skdr/deteksi',
        icon: Activity,
        description:
          'Algoritma statistik deteksi dini KLB (EARS C1–C3 & Farrington), korelasi titik panas karhutla (NASA FIRMS) vs lonjakan ISPA, serta radar kapasitas IHR/JEE',
      },
      {
        title: 'Buletin & Infografis',
        href: '/dashboard/skdr/buletin',
        icon: FileText,
        description:
          'Generator laporan buletin mingguan otomatis skala nasional/provinsi dan infografis digital responsif siap unduh (PNG) serta cetak PDF',
      },
      {
        title: 'Ringkasan Dasbor',
        href: '/dashboard',
        icon: LayoutDashboard,
        description:
          'Portal ikhtisar seluruh modul dasbor surveilans dan limited analytics dalam satu halaman terpadu',
      },
      {
        title: 'Mode TV Komando',
        href: '/tv',
        icon: Tv,
        description:
          'Pusat komando spasial & meja analisa epidemiologi penuh layar (full-viewport spatial command center)',
      },
    ],
  },
  ibs: {
    key: 'ibs',
    label: 'IBS',
    icon: TrendingUp,
    title: 'Dasbor Indikator Berbasis Sinyal (IBS)',
    subtitle:
      'Surveilans agregat mingguan indikator penyakit potensial KLB, kurva epidemiologi, dan distribusi demografi faskes',
    items: [
      {
        title: 'Tren Penyakit (IBS)',
        href: '/dashboard/skdr/tren',
        icon: TrendingUp,
        description:
          'Kurva epidemiologi mingguan (Minggu 1–52) per penyakit indikator dengan ambang batas (Mean + 2SD), komparasi multi-tahun, multi-wilayah, dan korelasi iklim ERA5',
      },
      {
        title: 'Distribusi & Demografi',
        href: '/dashboard/skdr/distribusi',
        icon: Users,
        description:
          'Analisa distribusi orang (piramida golongan usia dan jenis kelamin), sebaran unit pelapor (Puskesmas, RS, Klinik, Lab), serta peringkat insidensi wilayah',
      },
      {
        title: 'Ringkasan Utama (IBS & EBS)',
        href: '/dashboard/skdr/ringkasan',
        icon: LayoutDashboard,
        description:
          'Sintesis komando surveilans nasional: beban kasus IBS, rumor & sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster',
      },
      {
        title: 'Dasbor SKDR EBS & IBS',
        href: '/dasbor/ebs-ibs',
        icon: BarChart3,
        description:
          'Dasbor analitik dari Transaksi Form Laporan EBS, Entri Data Agregat IBS, dan Form Individu IBS',
      },
      {
        title: 'Matriks Analisa IBS',
        href: '/dashboard/matriks-analisa',
        icon: Layers,
        description:
          'Analisis korelasi morbiditas, matriks laporan pivot, drilldown wilayah, dan kinerja pelaporan IBS faskes',
      },
      {
        title: 'Spasial Kasus IBS',
        href: '/dashboard/spasial',
        icon: MapPin,
        description:
          'Peta OpenLayers choropleth sebaran kasus agregat IBS provinsi hingga kabupaten/kota se-Indonesia',
      },
    ],
  },
  ebs: {
    key: 'ebs',
    label: 'EBS',
    icon: Radio,
    title: 'Dasbor Event Based Surveillance (EBS)',
    subtitle:
      'Deteksi dini sinyal rumor masyarakat, verifikasi epidemiologi 24 jam, dan penanggulangan outbreak',
    items: [
      {
        title: 'Ringkasan Utama (IBS & EBS)',
        href: '/dashboard/skdr/ringkasan',
        icon: LayoutDashboard,
        description:
          'Sintesis komando surveilans nasional: beban kasus IBS, rumor & sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster',
      },
      {
        title: 'WHO 7-1-7 & Kinerja EBS',
        href: '/dashboard/skdr/717',
        icon: Clock,
        description:
          'Pengukuran ketepatan respon standar internasional WHO: deteksi ≤7 hari, notifikasi ≤1 hari, respon ≤7 hari, kualitas sinyal, konversi KLB, dan AAR',
      },
      {
        title: 'Deteksi Outbreak & Iklim',
        href: '/dashboard/skdr/deteksi',
        icon: Activity,
        description:
          'Algoritma statistik deteksi dini KLB (EARS C1–C3 & Farrington), korelasi titik panas karhutla (NASA FIRMS) vs lonjakan ISPA, serta radar kapasitas IHR/JEE',
      },
      {
        title: 'Dasbor SKDR EBS & IBS',
        href: '/dasbor/ebs-ibs',
        icon: BarChart3,
        description:
          'Dasbor analitik dari Transaksi Form Laporan EBS, Entri Data Agregat IBS, dan Form Individu IBS',
      },
      {
        title: 'Laporan Rumor EBS',
        href: '/ebs/laporan',
        icon: Radio,
        description:
          'Laporan kejadian/rumor penyakit di masyarakat — jumlah kasus & kematian per kelompok usia dan jenis kelamin',
      },
      {
        title: 'Spasial Sinyal EBS',
        href: '/dashboard/spasial',
        icon: MapPin,
        description:
          'Pemetaan sebaran sinyal dan rumor kejadian berbasis kejadian luar biasa di seluruh Indonesia',
      },
    ],
  },
  mbg: {
    key: 'mbg',
    label: 'MBG',
    icon: Utensils,
    title: 'Dasbor Program MBG (Makan Bergizi Gratis)',
    subtitle:
      'Surveilans epidemiologi keracunan pangan dan audit kepatuhan standar gizi SPPG (Formulir 1–13)',
    items: [
      {
        title: 'Ringkasan Eksekutif MBG',
        href: '/dashboard/mbg/ringkasan',
        icon: LayoutDashboard,
        description:
          'Kajian eksekutif pimpinan, rekomendasi pengerahan sumber daya, korelasi risiko pengawasan × kejadian, dan peta komparasi spasial',
      },
      {
        title: 'Analisa Keracunan Pangan',
        href: '/dashboard/mbg/keracunan',
        icon: AlertTriangle,
        description:
          'Analisa epidemiologi KLB keracunan pangan: beban kasus/CFR, peta sebaran, kurva epidemi, ketepatan respons 24 jam, etiologi lab & lingkungan dapur',
      },
      {
        title: 'Audit Pengawasan Gizi',
        href: '/dashboard/mbg/pengawasan',
        icon: ClipboardCheck,
        description:
          'Analisa kepatuhan standar gizi & audit SPPG (Formulir 1–13): cakupan, aspek terlemah, matriks SPPG × formulir, temuan & daftar prioritas pembinaan',
      },
      {
        title: 'Peta Spasial MBG',
        href: '/dasbor/mbg',
        icon: MapPin,
        description:
          'Peta sebaran spasial 2-dock terpadu investigasi keracunan pangan dan kepatuhan gizi SPPG se-Indonesia',
      },
      {
        title: 'Pengawasan Gizi SPPG',
        href: '/pengawasan-gizi',
        icon: Utensils,
        description:
          'Kunjungan pengawasan standar gizi MBG ke SPPG — Formulir 1–13 (ketenagaan, SOP, daya terima, rekap)',
      },
      {
        title: 'Laporan Kejadian Keracunan',
        href: '/keracunan-mbg',
        icon: AlertTriangle,
        description:
          'Laporan cepat & penyelidikan kejadian keracunan pangan MBG — kasus harian, lingkungan, laboratorium',
      },
    ],
  },
  zoonosis: {
    key: 'zoonosis',
    label: 'Zoonosis',
    icon: Bug,
    title: 'Dasbor Zoonosis & Penyakit Menular',
    subtitle:
      'Sintesis analitik penyakit zoonosis One Health, pemantauan KLB, dan kategori penyakit menular nasional',
    items: [
      {
        title: 'Zoonosis General',
        href: '/dasbor/zoonosis-general',
        icon: LayoutDashboard,
        description:
          'Sintesis komprehensif penyakit zoonosis: beban kasus, CFR, kurva tren, alert SKDR, dan peta sebaran',
      },
      {
        title: 'Zoonosis Lite',
        href: '/dasbor/zoonosis-lite',
        icon: Activity,
        description: 'Antraks, Rabies, Leptospirosis, Flu Burung: CFR dan peta sebaran',
      },
      {
        title: 'PD3I',
        href: '/dasbor/kategori/pd3i',
        icon: Shield,
        description: 'Penyakit yang Dapat Dicegah Dengan Imunisasi (PD3I)',
      },
      {
        title: 'Tular Vektor & Zoonotik',
        href: '/dasbor/kategori/tular-vektor',
        icon: Bug,
        description: 'Penyakit Tular Vektor dan Zoonotik',
      },
      {
        title: 'Menular Langsung',
        href: '/dasbor/kategori/menular-langsung',
        icon: Users,
        description: 'Penyakit Menular Langsung',
      },
      {
        title: 'Tular Makanan & Air',
        href: '/dasbor/kategori/tular-makanan-air',
        icon: Layers,
        description: 'Penyakit Tular Makanan dan Air Terkontaminasi',
      },
      {
        title: 'Penyakit Infeksi Emerging (PIE)',
        href: '/dasbor/kategori/pie',
        icon: AlertTriangle,
        description: 'Penyakit Infeksi Emerging (PIE)',
      },
      {
        title: 'Profil Penyakit',
        href: '/penyakit',
        icon: Stethoscope,
        description: 'Profil, tren, dan sebaran kasus per penyakit indikator',
      },
    ],
  },
}

export default function MenuPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('kinerja')
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const t = sp.get('tab') as TabKey
      if (t && ['kinerja', 'ibs', 'ebs', 'mbg', 'zoonosis'].includes(t)) {
        setActiveTab(t)
      }
    }
  }, [pathname])

  const current = CATEGORIES[activeTab] || CATEGORIES.kinerja
  const { user } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid="menu-category-page">
      {/* Header section */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            {current.title}
          </h1>

          {/* Quick tab pills inside page */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1 shadow-2xs backdrop-blur-xs">
            {(Object.keys(CATEGORIES) as TabKey[]).map((k) => {
              const cat = CATEGORIES[k]
              const Icon = cat.icon
              const active = activeTab === k
              return (
                <Link
                  key={k}
                  href={`/menu?tab=${k}`}
                  onClick={() => setActiveTab(k)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    active
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white hover:text-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{cat.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-slate-500">{current.subtitle}</p>

        {user && (
          <p className="mt-1 text-xs text-slate-600">
            {t('skdr.access.signedInAs', {
              name: user.full_name || user.username,
              role: user.role_name,
            })}
          </p>
        )}
      </div>

      {/* PR 075: When active tab is Kinerja, display KPI Cards and 4 Redesigned Charts */}
      {activeTab === 'kinerja' && <KinerjaView />}

      {/* Cards Grid */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          DAFTAR MODUL {current.label}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {current.items.map((it) => {
            const Icon = it.icon
            return (
              <Link
                key={it.href + it.title}
                href={it.href}
                className="group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary">
                  {Icon && <Icon className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    {it.title}
                    {it.badge && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
                        {it.badge}
                      </span>
                    )}
                  </span>
                  {it.description && (
                    <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                      {it.description}
                    </span>
                  )}
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

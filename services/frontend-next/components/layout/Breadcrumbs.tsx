'use client'
// PR 017: breadcrumb reflects the nav group (Beranda › Grup › Menu › Sub-menu › Detail).
// PR 065: Audit warna dasar & penyelarasan pill container breadcrumb agar elegan dan selaras tanpa tabrakan warna.
// PR 067: Tombol Back terintegrasi di samping breadcrumb & link aktif pada setiap level breadcrumb untuk navigasi balik.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronRight, Home } from 'lucide-react'
import type { SidebarGroup, SidebarItem } from '@/lib/menu'

type Match = { group: SidebarGroup; item: SidebarItem; sub?: SidebarItem } | null

export default function Breadcrumbs({ match }: { match: Match }) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  if (pathname === '/' || pathname === '/beranda' || !match) return null

  // Tautkan grup ke halamannya jika ada (tatakelola -> /tatakelola, dashboard -> /dashboard, atau item pertama)
  const groupHref = match.group.area === 'tatakelola'
    ? '/tatakelola'
    : match.group.area === 'dashboard'
    ? '/dashboard'
    : (match.group.items?.[0]?.href && match.group.items[0].href !== '#')
    ? match.group.items[0].href
    : undefined

  const crumbs: { label: string; href?: string }[] = [{ label: match.group.title, href: groupHref }]
  const itemHasPage = match.item.href && match.item.href !== '#'
  if (match.item.label !== match.group.title) {
    crumbs.push({ label: match.item.label, href: itemHasPage ? match.item.href : undefined })
  }
  if (match.sub && match.sub.href) {
    crumbs.push({ label: match.sub.label, href: match.sub.href })
  }
  const base = (match.sub?.href || match.item.href || '').replace(/\/$/, '')
  const rest = pathname.slice(base.length).split('/').filter(Boolean)
  // PR 030: also used by Laporan EBS/IBS
  // PR 031: Form Individu → "Tambah Pasien"
  const addLabel = pathname.startsWith('/pengawasan-gizi')
    ? 'Tambah Kunjungan'
    : pathname.startsWith('/keracunan-mbg')
    ? 'Lapor Kejadian'
    : pathname.startsWith('/pe')
    ? 'Tambah PE'
    : pathname.startsWith('/ibs/individu')
    ? 'Tambah Pasien'
    : 'Tambah Laporan'
  if (rest.length) {
    crumbs.push({ label: rest[rest.length - 1] === 'baru' ? addLabel : 'Detail' })
  }
  const last = crumbs.length - 1

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      const prevCrumb = crumbs.slice(0, last).reverse().find((c) => c.href)
      router.push(prevCrumb?.href || '/beranda')
    }
  }

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs" className="flex flex-wrap items-center gap-2 px-4 pt-3.5 sm:px-6 lg:px-8">
      {/* Tombol Back di samping breadcrumb */}
      <button
        type="button"
        onClick={handleBack}
        data-testid="breadcrumb-back"
        title="Kembali ke halaman sebelumnya"
        aria-label="Kembali ke halaman sebelumnya"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-primary active:bg-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kembali</span>
      </button>

      {/* Pill Breadcrumbs */}
      <ol className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-1.5 text-xs text-slate-600 shadow-2xs backdrop-blur-xs">
        <li>
          <Link href="/beranda" className="inline-flex items-center gap-1.5 font-medium text-slate-600 transition-colors hover:text-primary">
            <Home className="h-3.5 w-3.5 text-slate-400 group-hover:text-primary" />
            <span>Beranda</span>
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={i} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
            {c.href && i !== last ? (
              <Link href={c.href} className="font-medium text-slate-600 transition-colors hover:text-primary">
                {c.label}
              </Link>
            ) : (
              <span
                className={i === last ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}
                aria-current={i === last ? 'page' : undefined}
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

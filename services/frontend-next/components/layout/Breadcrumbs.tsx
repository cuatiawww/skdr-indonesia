'use client'
// PR 017: breadcrumb reflects the nav group (Beranda › Grup › Menu › Sub-menu › Detail).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import type { SidebarGroup, SidebarItem } from '@/lib/menu'

type Match = { group: SidebarGroup; item: SidebarItem; sub?: SidebarItem } | null

export default function Breadcrumbs({ match }: { match: Match }) {
  const pathname = usePathname() || '/'
  if (pathname === '/' || !match) return null
  const crumbs: { label: string; href?: string }[] = [{ label: match.group.title }]
  const itemHasPage = match.item.href && match.item.href !== '#'
  if (match.item.label !== match.group.title) crumbs.push({ label: match.item.label, href: itemHasPage ? match.item.href : undefined })
  if (match.sub) crumbs.push({ label: match.sub.label, href: match.sub.href })
  const base = (match.sub?.href || match.item.href || '').replace(/\/$/, '')
  const rest = pathname.slice(base.length).split('/').filter(Boolean)
  if (rest.length) crumbs.push({ label: rest[rest.length - 1] === 'baru' ? 'Tambah PE' : 'Detail' })
  const last = crumbs.length - 1
  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumbs" className="px-4 pt-3 text-xs sm:px-6 lg:px-8">
      <ol className="flex flex-wrap items-center gap-1.5 text-slate-500">
        <li><Link href="/" className="inline-flex items-center gap-1 hover:text-primary"><Home className="h-3.5 w-3.5" />Beranda</Link></li>
        {crumbs.map((c, i) => (
          <li key={i} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-slate-300" />
            {c.href && i !== last ? <Link href={c.href} className="hover:text-primary">{c.label}</Link>
              : <span className={i === last ? 'font-semibold text-slate-700' : ''} aria-current={i === last ? 'page' : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

'use client'
// PR 029: landing page of an area (/dashboard or /tatakelola): one card per menu item of that area's sidebar groups.
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'
import { useNavGroups } from '@/lib/nav'
import { useAuth } from '@/lib/skdr-auth'
import { hasPerm } from '@/lib/access'
import type { SidebarItem } from '@/lib/menu'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function AreaHub({ area, title, subtitle, selfHref }: { area: 'dashboard' | 'tatakelola'; title: string; subtitle: string; selfHref: string }) {
  const groups = useNavGroups()
  const { user } = useAuth()
  const { t } = useTranslation()
  const visible = groups.filter((g) => g.area === area && (!user || !g.permission || hasPerm(user.permissions, g.permission)))
  return (
    <div className="w-full space-y-6 bg-page px-4 py-6 sm:px-6 lg:px-8" data-testid={`hub-${area}`}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">{title}</h1>
        <p className="text-xs text-slate-500">{subtitle}</p>
        {user && (
          <p className="mt-2 text-xs text-slate-600">
            {t('skdr.access.signedInAs', { name: user.full_name || user.username, role: user.role_name })}
          </p>
        )}
      </div>
      {visible.map((g) => {
        const items: SidebarItem[] = g.items.flatMap((it) => (it.subItems?.length ? it.subItems : [it])).filter((it) => it.href && it.href !== '#' && it.href !== selfHref)
        if (!items.length) return null
        const locked = !user && (g.requiresAuth || area === 'tatakelola')
        return (
          <section key={g.id || g.title} className="space-y-3">
            <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {g.title}
              {locked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500"><Lock className="h-3 w-3" />{t('skdr.access.needLogin')}</span>}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => {
                const Icon = it.icon
                return (
                  <Link key={it.id || it.href} href={it.href!}
                    className="group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-md">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary">{Icon && <Icon className="h-5 w-5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        {it.label}
                        {it.badge && <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">{it.badge}</span>}
                      </span>
                      {it.description && <span className="mt-0.5 block text-xs text-slate-500">{it.description}</span>}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

'use client'

import { ClipboardPlus, LayoutDashboard, Menu, TableProperties } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useSettings } from '@/lib/settings-context'

const tabs = [
  { href: '/', label: 'DASHBOARD', icon: LayoutDashboard },
  { href: '/form', label: 'REPORT FORM', icon: ClipboardPlus },
  { href: '/reports', label: 'CASE REPORTS', icon: TableProperties },
]

export default function DashboardHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const pathname = usePathname()
  const { settings } = useSettings()
  const logoSrc = `${PUBLIC_BASE_PATH}/Logo-Kemenkes.png`

  return (
    <header className="w-full border-b border-white/20 bg-[#102f78]">
      <div className="relative flex min-h-[118px] items-stretch overflow-visible bg-[#102f78]">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-100"
          style={{ backgroundImage: `url('${PUBLIC_BASE_PATH}/bg%20header_abvc%20nlp.webp')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#061b50]/25 via-transparent to-black/10" />
        <div className="relative grid w-full gap-5 px-4 py-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={onToggleSidebar}
              aria-label="Open menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="Logo" className="h-auto max-h-[62px] w-[132px] shrink-0 rounded-lg bg-white/90 object-contain p-1 md:w-[168px]" />
              <div className="min-w-0 border-white/35 md:border-l md:pl-5">
                <h1 className="max-w-[720px] text-lg font-extrabold uppercase leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:text-2xl md:text-3xl">
                  {settings.app_name}
                </h1>
                {settings.app_tagline ? (
                  <p className="mt-2 hidden max-w-[760px] text-xs leading-relaxed text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] sm:block md:text-sm lg:text-base">
                    {settings.app_tagline}
                  </p>
                ) : null}
              </div>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <div className="hidden items-center rounded-2xl border border-white/45 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm sm:flex">
              {tabs.map(({ href, label, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname?.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      active ? 'bg-[#0060A9] text-white hover:bg-[#004b85]' : 'text-slate-700 hover:bg-white hover:text-[#0060A9]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

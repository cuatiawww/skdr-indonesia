'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Menu, ShieldCheck, X } from 'lucide-react'
import { triggerModal } from '@/components/landing/LandingModals'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useAuth } from '@/lib/skdr-auth'

export default function LandingNavbar() {
  const { user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeItem, setActiveItem] = useState('Beranda')
  const portalHref = user ? '/dashboard' : '/login?redirect=%2Fdashboard'

  const navItems = [
    { label: 'Beranda', href: '#', type: 'top' },
    { label: 'Dasbor Surveilans', href: '#dasbor', type: 'dashboard' },
    { label: 'Penyakit & Sinyal', href: '#penyakit', type: 'scroll' },
    { label: 'Form PE', href: '#form-pe', type: 'pe' },
    { label: 'Integrasi EBS', href: '#tentang', type: 'scroll' },
    { label: 'Dokumentasi', href: '#respons', type: 'scroll' },
    { label: 'Kontak', href: '#kontak', type: 'scroll' },
  ]

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: (typeof navItems)[number],
  ) => {
    e.preventDefault()
    setActiveItem(item.label)
    setMobileMenuOpen(false)

    if (item.type === 'dashboard') {
      triggerModal('dashboard')
      return
    }
    if (item.type === 'pe') {
      triggerModal('pe')
      return
    }
    if (item.type === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (item.type === 'scroll') {
      const targetId = item.href.replace('#', '')
      const element = document.getElementById(targetId)
      if (element) element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between md:h-20">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
              setActiveItem('Beranda')
            }}
            className="group flex items-center py-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${PUBLIC_BASE_PATH}/images/Logo-Kemenkes.png`}
              alt="Kementerian Kesehatan Republik Indonesia"
              width={180}
              height={42}
              className="h-8 w-auto object-contain sm:h-9 md:h-11"
            />
          </a>

          <nav className="hidden items-center gap-1 lg:flex xl:gap-2">
            {navItems.map((item) => {
              const isActive = activeItem === item.label
              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`relative cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors xl:text-[13px] ${
                    isActive
                      ? "font-semibold text-[#009896] after:absolute after:bottom-0 after:left-2.5 after:right-2.5 after:h-0.5 after:rounded-full after:bg-[#009896] after:content-['']"
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#009896]'
                  }`}
                >
                  {item.label}
                </a>
              )
            })}
          </nav>

          <div className="hidden flex-shrink-0 items-center gap-2.5 lg:flex">
            <div className="hidden select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 xl:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Sistem Online 24/7
            </div>

            <Link
              href={portalHref}
              data-testid="landing-access-btn"
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#009896] px-4 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:bg-[#008381] active:scale-95 md:text-[13px]"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{user ? 'Buka Dasbor' : 'Akses SKDR'}</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <Link
              href={portalHref}
              className="cursor-pointer rounded-full bg-[#009896] px-3 py-1.5 text-xs font-medium text-white"
            >
              {user ? 'Dasbor' : 'Akses SKDR'}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-slate-100 bg-white shadow-lg lg:hidden">
          <div className="space-y-1 px-4 pb-6 pt-3">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(e, item)}
                className={`block cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium ${
                  activeItem === item.label
                    ? 'bg-teal-50 font-semibold text-[#009896]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </a>
            ))}
            <div className="border-t border-slate-100 pt-3">
              <Link
                href={portalHref}
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#009896] px-4 py-2.5 text-sm font-medium text-white shadow"
              >
                <ShieldCheck className="h-4 w-4" />
                {user ? 'Buka Portal Dasbor SKDR' : 'Masuk ke Portal SKDR'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

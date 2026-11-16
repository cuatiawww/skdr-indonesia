'use client'
// PR 073: MenuSidebar dedicated to /menu route
// Renders the exact requested hierarchy:
// DASHBOARD
// KONFIGURASI
// - WILAYAH
// - PARAMETER
// -- EBS
// -- IBS
// -- TGC
// SKDR EBS
// SKDR IBS
// TGC
// PROGRAM MBG
// WA GATEWAY
// SKRINING SKDR
// INTEGRASI
// BULETIN SKDR
// INFOGRAFIS
// BANTUAN
// -- KONTAK
// -- PETUNJUK PENGGUNAAN
// SITUASI KHUSUS SKDR
// MEDIA MONITORING

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  MapPin,
  SlidersHorizontal,
  Radio,
  FileSpreadsheet,
  Clock,
  TrendingUp,
  Shield,
  Utensils,
  Share2,
  Search,
  Waypoints,
  FileText,
  PieChart,
  HelpCircle,
  Building2,
  BookText,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useSettings } from '@/lib/settings-context'
import { tr, useTranslation } from '@/lib/i18n/LanguageContext'

type Props = {
  open: boolean
  collapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

export default function MenuSidebar({ open, collapsed, onClose, onToggleCollapse }: Props) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const pathname = usePathname()

  // Accordion open states (default open so user immediately sees the requested hierarchy)
  const [configOpen, setConfigOpen] = useState(true)
  const [paramOpen, setParamOpen] = useState(true)
  const [helpOpen, setHelpOpen] = useState(true)

  // Floating flyout for collapsed rail mode
  const [flyout, setFlyout] = useState<string | null>(null)
  const flyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        setFlyout(null)
      }
    }
    if (open) document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  useEffect(() => {
    if (!flyout) return
    const down = (e: MouseEvent) => {
      if (flyRef.current && !flyRef.current.contains(e.target as Node)) setFlyout(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyout(null)
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [flyout])

  useEffect(() => {
    if (!collapsed) setFlyout(null)
  }, [collapsed])

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/Logo-Kemenkes.png`
  const appTitle = settings.app_name || tr('skdr.layout.appName')
  const appSubtitle = settings.app_tagline || tr('skdr.layout.appTagline')
  const rail = collapsed && !open

  const Tip = ({ label }: { label: string }) =>
    rail ? (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-[80] ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block group-focus-visible:block"
      >
        {label}
      </span>
    ) : null

  const linkCls = (active: boolean, level = 0) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/40 ${
      rail ? 'justify-center px-0' : ''
    } ${
      active
        ? 'bg-primary/10 text-primary font-bold'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    } ${level === 1 && !rail ? 'text-[13px]' : ''} ${level === 2 && !rail ? 'text-xs' : ''}`

  return (
    <aside
      aria-label="Navigasi Menu"
      data-testid="nav-menu-sidebar"
      data-collapsed={rail ? 'true' : 'false'}
      className={`fixed left-0 top-0 z-[60] flex h-screen flex-col border-r border-slate-100 bg-white text-slate-800 shadow-[2px_0_12px_rgba(0,0,0,0.03)] transition-[transform,width] duration-300 ${
        open ? 'w-[280px] translate-x-0' : 'w-[280px] -translate-x-full lg:translate-x-0'
      } ${rail ? 'lg:w-[72px]' : 'lg:w-[280px]'}`}
    >
      {/* Top accent bar */}
      <div className="h-[4px] shrink-0 bg-primary" />

      {/* Header */}
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 py-4 ${rail ? 'px-2' : 'px-4'}`}>
        <div className={`flex min-w-0 items-center gap-3 ${rail ? 'mx-auto' : ''}`}>
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={tr('skdr.layout.logo')}
              className="h-auto max-h-8 w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
          {!rail && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase tracking-wide text-slate-800">{appTitle}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{appSubtitle}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={t('common.closeSidebar')}
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
        {!rail && (
          <button
            type="button"
            onClick={onToggleCollapse}
            data-testid="sidebar-toggle"
            aria-label="Tutup sidebar"
            title="Tutup sidebar"
            className="hidden shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-primary/40 hover:text-primary lg:inline-flex"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {rail && (
        <div className="hidden shrink-0 justify-center border-b border-slate-100 py-2 lg:flex">
          <button
            type="button"
            onClick={onToggleCollapse}
            data-testid="sidebar-toggle"
            aria-label="Buka sidebar"
            className="group relative inline-flex cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-primary/40 hover:text-primary"
          >
            <PanelLeftOpen className="h-4 w-4" />
            <Tip label="Buka sidebar" />
          </button>
        </div>
      )}

      {/* Navigation items */}
      <nav
        className={`flex-1 space-y-1 py-4 ${rail ? 'overflow-visible px-2' : 'overflow-y-auto px-3'}`}
        data-testid="menu-nav-list"
      >
        {/* 1. DASHBOARD */}
        <div>
          <Link
            href="/menu"
            onClick={onClose}
            aria-current={pathname === '/menu' ? 'page' : undefined}
            className={linkCls(pathname === '/menu')}
          >
            <LayoutDashboard className={`h-4 w-4 shrink-0 ${pathname === '/menu' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">DASHBOARD</span>}
            <Tip label="DASHBOARD" />
          </Link>
        </div>

        {/* 2. KONFIGURASI */}
        <div className="relative" ref={flyout === 'konfigurasi' ? flyRef : undefined}>
          <button
            type="button"
            aria-expanded={rail ? flyout === 'konfigurasi' : configOpen}
            aria-label={rail ? 'KONFIGURASI' : undefined}
            onClick={() => {
              if (rail) setFlyout(flyout === 'konfigurasi' ? null : 'konfigurasi')
              else setConfigOpen((p) => !p)
            }}
            className={`${linkCls(false)} w-full text-left`}
          >
            <Settings className="h-4 w-4 shrink-0 text-slate-400" />
            {!rail && <span className="flex-1 truncate">KONFIGURASI</span>}
            {!rail && (configOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />)}
            <Tip label="KONFIGURASI" />
          </button>

          {/* Subitems for rail mode flyout */}
          {rail && flyout === 'konfigurasi' && (
            <div
              role="menu"
              data-testid="menu-flyout"
              className="absolute left-full top-0 z-[80] ml-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
            >
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">KONFIGURASI</p>
              <Link
                href="/master/provinsi"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>WILAYAH</span>
              </Link>
              <div className="my-1 border-t border-slate-100" />
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">PARAMETER</p>
              <Link
                href="/ebs/laporan"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Radio className="h-4 w-4 text-slate-400" />
                <span>EBS</span>
              </Link>
              <Link
                href="/ibs/laporan"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                <span>IBS</span>
              </Link>
              <Link
                href="/dashboard/skdr/717"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Clock className="h-4 w-4 text-slate-400" />
                <span>TGC</span>
              </Link>
            </div>
          )}

          {/* Subitems for expanded mode */}
          {configOpen && !rail && (
            <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-100 pl-3">
              {/* - WILAYAH */}
              <li>
                <Link
                  href="/master/provinsi"
                  onClick={onClose}
                  aria-current={pathname.startsWith('/master') ? 'page' : undefined}
                  className={linkCls(pathname.startsWith('/master'), 1)}
                >
                  <MapPin className={`h-4 w-4 shrink-0 ${pathname.startsWith('/master') ? 'text-primary' : 'text-slate-400'}`} />
                  <span className="truncate">WILAYAH</span>
                </Link>
              </li>

              {/* - PARAMETER (collapsible level 2) */}
              <li>
                <button
                  type="button"
                  aria-expanded={paramOpen}
                  onClick={() => setParamOpen((p) => !p)}
                  className={`${linkCls(false, 1)} w-full text-left`}
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate">PARAMETER</span>
                  {paramOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                </button>

                {paramOpen && (
                  <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-200/80 pl-3">
                    {/* -- EBS */}
                    <li>
                      <Link
                        href="/ebs/laporan"
                        onClick={onClose}
                        aria-current={pathname.startsWith('/ebs') ? 'page' : undefined}
                        className={linkCls(pathname.startsWith('/ebs'), 2)}
                      >
                        <Radio className={`h-3.5 w-3.5 shrink-0 ${pathname.startsWith('/ebs') ? 'text-primary' : 'text-slate-400'}`} />
                        <span className="truncate">EBS</span>
                      </Link>
                    </li>
                    {/* -- IBS */}
                    <li>
                      <Link
                        href="/ibs/laporan"
                        onClick={onClose}
                        aria-current={pathname.startsWith('/ibs') ? 'page' : undefined}
                        className={linkCls(pathname.startsWith('/ibs'), 2)}
                      >
                        <FileSpreadsheet className={`h-3.5 w-3.5 shrink-0 ${pathname.startsWith('/ibs') ? 'text-primary' : 'text-slate-400'}`} />
                        <span className="truncate">IBS</span>
                      </Link>
                    </li>
                    {/* -- TGC */}
                    <li>
                      <Link
                        href="/dashboard/skdr/717"
                        onClick={onClose}
                        className={linkCls(false, 2)}
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">TGC</span>
                      </Link>
                    </li>
                  </ul>
                )}
              </li>
            </ul>
          )}
        </div>

        {/* 3. SKDR EBS */}
        <div>
          <Link
            href="/dasbor/ebs-ibs"
            onClick={onClose}
            aria-current={pathname === '/dasbor/ebs-ibs' ? 'page' : undefined}
            className={linkCls(pathname === '/dasbor/ebs-ibs')}
          >
            <Radio className={`h-4 w-4 shrink-0 ${pathname === '/dasbor/ebs-ibs' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">SKDR EBS</span>}
            <Tip label="SKDR EBS" />
          </Link>
        </div>

        {/* 4. SKDR IBS */}
        <div>
          <Link
            href="/dashboard/skdr/tren"
            onClick={onClose}
            aria-current={pathname === '/dashboard/skdr/tren' ? 'page' : undefined}
            className={linkCls(pathname === '/dashboard/skdr/tren')}
          >
            <TrendingUp className={`h-4 w-4 shrink-0 ${pathname === '/dashboard/skdr/tren' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">SKDR IBS</span>}
            <Tip label="SKDR IBS" />
          </Link>
        </div>

        {/* 5. TGC */}
        <div>
          <Link
            href="/dashboard/skdr/717"
            onClick={onClose}
            aria-current={pathname === '/dashboard/skdr/717' ? 'page' : undefined}
            className={linkCls(pathname === '/dashboard/skdr/717')}
          >
            <Shield className={`h-4 w-4 shrink-0 ${pathname === '/dashboard/skdr/717' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">TGC</span>}
            <Tip label="TGC" />
          </Link>
        </div>

        {/* 6. PROGRAM MBG */}
        <div>
          <Link
            href="/dashboard/mbg/ringkasan"
            onClick={onClose}
            aria-current={pathname.startsWith('/dashboard/mbg') || pathname === '/dasbor/mbg' ? 'page' : undefined}
            className={linkCls(pathname.startsWith('/dashboard/mbg') || pathname === '/dasbor/mbg')}
          >
            <Utensils className={`h-4 w-4 shrink-0 ${pathname.startsWith('/dashboard/mbg') || pathname === '/dasbor/mbg' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">PROGRAM MBG</span>}
            <Tip label="PROGRAM MBG" />
          </Link>
        </div>

        {/* 7. WA GATEWAY */}
        <div>
          <Link
            href="/tatakelola/navigasi"
            onClick={onClose}
            className={linkCls(false)}
          >
            <Share2 className="h-4 w-4 shrink-0 text-slate-400" />
            {!rail && <span className="truncate">WA GATEWAY</span>}
            <Tip label="WA GATEWAY" />
          </Link>
        </div>

        {/* 8. SKRINING SKDR */}
        <div>
          <Link
            href="/penyakit"
            onClick={onClose}
            aria-current={pathname.startsWith('/penyakit') ? 'page' : undefined}
            className={linkCls(pathname.startsWith('/penyakit'))}
          >
            <Search className={`h-4 w-4 shrink-0 ${pathname.startsWith('/penyakit') ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">SKRINING SKDR</span>}
            <Tip label="SKRINING SKDR" />
          </Link>
        </div>

        {/* 9. INTEGRASI */}
        <div>
          <Link
            href="/integrasi/bnpb"
            onClick={onClose}
            aria-current={pathname.startsWith('/integrasi') ? 'page' : undefined}
            className={linkCls(pathname.startsWith('/integrasi'))}
          >
            <Waypoints className={`h-4 w-4 shrink-0 ${pathname.startsWith('/integrasi') ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">INTEGRASI</span>}
            <Tip label="INTEGRASI" />
          </Link>
        </div>

        {/* 10. BULETIN SKDR */}
        <div>
          <Link
            href="/dashboard/skdr/buletin"
            onClick={onClose}
            aria-current={pathname === '/dashboard/skdr/buletin' ? 'page' : undefined}
            className={linkCls(pathname === '/dashboard/skdr/buletin')}
          >
            <FileText className={`h-4 w-4 shrink-0 ${pathname === '/dashboard/skdr/buletin' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">BULETIN SKDR</span>}
            <Tip label="BULETIN SKDR" />
          </Link>
        </div>

        {/* 11. INFOGRAFIS */}
        <div>
          <Link
            href="/dashboard/skdr/buletin"
            onClick={onClose}
            className={linkCls(false)}
          >
            <PieChart className="h-4 w-4 shrink-0 text-slate-400" />
            {!rail && <span className="truncate">INFOGRAFIS</span>}
            <Tip label="INFOGRAFIS" />
          </Link>
        </div>

        {/* 12. BANTUAN */}
        <div className="relative" ref={flyout === 'bantuan' ? flyRef : undefined}>
          <button
            type="button"
            aria-expanded={rail ? flyout === 'bantuan' : helpOpen}
            aria-label={rail ? 'BANTUAN' : undefined}
            onClick={() => {
              if (rail) setFlyout(flyout === 'bantuan' ? null : 'bantuan')
              else setHelpOpen((p) => !p)
            }}
            className={`${linkCls(false)} w-full text-left`}
          >
            <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" />
            {!rail && <span className="flex-1 truncate">BANTUAN</span>}
            {!rail && (helpOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />)}
            <Tip label="BANTUAN" />
          </button>

          {/* Subitems for rail mode flyout */}
          {rail && flyout === 'bantuan' && (
            <div
              role="menu"
              data-testid="menu-flyout"
              className="absolute left-full top-0 z-[80] ml-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
            >
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">BANTUAN</p>
              <Link
                href="/beranda#kontak"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Building2 className="h-4 w-4 text-slate-400" />
                <span>KONTAK</span>
              </Link>
              <Link
                href="/dokumentasi"
                role="menuitem"
                onClick={() => { setFlyout(null); onClose() }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <BookText className="h-4 w-4 text-slate-400" />
                <span>PETUNJUK PENGGUNAAN</span>
              </Link>
            </div>
          )}

          {/* Subitems for expanded mode */}
          {helpOpen && !rail && (
            <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-100 pl-3">
              {/* -- KONTAK */}
              <li>
                <Link
                  href="/beranda#kontak"
                  onClick={onClose}
                  className={linkCls(false, 1)}
                >
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">KONTAK</span>
                </Link>
              </li>
              {/* -- PETUNJUK PENGGUNAAN */}
              <li>
                <Link
                  href="/dokumentasi"
                  onClick={onClose}
                  aria-current={pathname.startsWith('/dokumentasi') ? 'page' : undefined}
                  className={linkCls(pathname.startsWith('/dokumentasi'), 1)}
                >
                  <BookText className={`h-4 w-4 shrink-0 ${pathname.startsWith('/dokumentasi') ? 'text-primary' : 'text-slate-400'}`} />
                  <span className="truncate">PETUNJUK PENGGUNAAN</span>
                </Link>
              </li>
            </ul>
          )}
        </div>

        {/* 13. SITUASI KHUSUS SKDR */}
        <div>
          <Link
            href="/dashboard/skdr/deteksi"
            onClick={onClose}
            aria-current={pathname === '/dashboard/skdr/deteksi' ? 'page' : undefined}
            className={linkCls(pathname === '/dashboard/skdr/deteksi')}
          >
            <AlertTriangle className={`h-4 w-4 shrink-0 ${pathname === '/dashboard/skdr/deteksi' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">SITUASI KHUSUS SKDR</span>}
            <Tip label="SITUASI KHUSUS SKDR" />
          </Link>
        </div>

        {/* 14. MEDIA MONITORING */}
        <div>
          <Link
            href="/dashboard/skdr/ringkasan"
            onClick={onClose}
            aria-current={pathname === '/dashboard/skdr/ringkasan' ? 'page' : undefined}
            className={linkCls(pathname === '/dashboard/skdr/ringkasan')}
          >
            <Eye className={`h-4 w-4 shrink-0 ${pathname === '/dashboard/skdr/ringkasan' ? 'text-primary' : 'text-slate-400'}`} />
            {!rail && <span className="truncate">MEDIA MONITORING</span>}
            <Tip label="MEDIA MONITORING" />
          </Link>
        </div>
      </nav>
    </aside>
  )
}

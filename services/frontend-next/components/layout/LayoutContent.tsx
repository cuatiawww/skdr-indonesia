'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { tr } from '@/lib/i18n/LanguageContext'
import AppShell from '@/components/layout/AppShell'
import AuthGuard from '@/components/AuthGuard'

// PR 029/037: / (Landing Page) dan /login tampil penuh tanpa AppShell sidebar; halaman lainnya dilindungi AuthGuard.
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const toaster = <Toaster position="top-right" richColors containerAriaLabel={tr("skdr.notifications")} />
  if (pathname === '/' || pathname === '/login') {
    return (
      <>
        {children}
        {toaster}
      </>
    )
  }
  return (
    <>
      {/* PR 017: MODE TV belum dirilis, halaman /tv tampil di shell biasa (navigasi + breadcrumb) */}
      <AppShell tvMode={false}><AuthGuard>{children}</AuthGuard></AppShell>
      {toaster}
    </>
  )
}

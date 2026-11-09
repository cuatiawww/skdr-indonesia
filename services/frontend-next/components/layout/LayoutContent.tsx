'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { tr } from '@/lib/i18n/LanguageContext'
import AppShell from '@/components/layout/AppShell'
import AuthGuard from '@/components/AuthGuard'

// SKDR: copied from NLP-PENYAKIT LayoutContent. PR 029: /login renders without the app shell; every other page is
// wrapped in AuthGuard (public pages pass straight through, see lib/access.ts).
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const toaster = <Toaster position="top-right" richColors containerAriaLabel={tr("skdr.notifications")} />
  if (pathname === '/login') {
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

'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { tr } from '@/lib/i18n/LanguageContext'
import AppShell from '@/components/layout/AppShell'

// SKDR: copied from NLP-PENYAKIT LayoutContent without AuthGuard/login (no auth for now).
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <>
      <AppShell tvMode={pathname === '/tv'}>{children}</AppShell>
      <Toaster position="top-right" richColors containerAriaLabel={tr("skdr.notifications")} />
    </>
  )
}

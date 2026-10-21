'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import AppShell from '@/components/layout/AppShell'

// SKDR: copied from NLP-PENYAKIT LayoutContent without AuthGuard/login (no auth for now).
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <>
      <AppShell tvMode={pathname === '/tv'}>{children}</AppShell>
      <Toaster position="top-right" richColors />
    </>
  )
}

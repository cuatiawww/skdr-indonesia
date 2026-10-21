'use client'

import { Toaster } from 'sonner'
import { tr } from '@/lib/i18n/LanguageContext'
import AppShell from '@/components/layout/AppShell'

// SKDR: copied from NLP-PENYAKIT LayoutContent without AuthGuard/login (no auth for now).
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* PR 017: MODE TV belum dirilis, halaman /tv tampil di shell biasa (navigasi + breadcrumb) */}
      <AppShell tvMode={false}>{children}</AppShell>
      <Toaster position="top-right" richColors containerAriaLabel={tr("skdr.notifications")} />
    </>
  )
}

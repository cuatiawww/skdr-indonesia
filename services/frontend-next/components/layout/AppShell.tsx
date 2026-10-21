'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import { sidebarMenu } from '@/lib/menu'
import DashboardSidebar from './DashboardSidebar'
import DashboardHeader from './DashboardHeader'
import Footer from './Footer'

// Shell layout copied from NLP-PENYAKIT (sidebar drawer + header + footer), without auth/console modes.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => setSidebarOpen(false), [pathname])

  return (
    <main className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-[55] bg-slate-900/35 backdrop-blur-[1px]"
        />
      )}
      <div className="print:hidden">
        <DashboardSidebar open={sidebarOpen} menuGroups={sidebarMenu} onClose={() => setSidebarOpen(false)} />
      </div>
      <div className="print:hidden">
        <DashboardHeader onToggleSidebar={() => setSidebarOpen((p) => !p)} />
      </div>
      <div className="w-full flex-1 py-3 md:py-5">{children}</div>
      <div className="print:hidden">
        <Footer />
      </div>
      <Toaster position="top-right" richColors />
    </main>
  )
}

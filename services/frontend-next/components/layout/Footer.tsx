'use client'

import { useSettings } from '@/lib/settings-context'

export default function Footer() {
  const { settings } = useSettings()
  return (
    <footer className="border-t border-blue-100 bg-white">
      <div className="h-1 bg-gradient-to-r from-[#0060A9] via-[#1a78c2] to-transparent" />
      <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} {settings.footer_text}</p>
      </div>
    </footer>
  )
}

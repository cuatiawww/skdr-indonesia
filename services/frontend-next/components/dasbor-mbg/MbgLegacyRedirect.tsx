'use client'
// PR 052b: tautan lama Dasbor MBG (/dasbor/mbg?tab=… dan /dashboard/mbg) dialihkan ke rute halaman baru
// /dashboard/mbg/{ringkasan|keracunan|pengawasan}; parameter filter lain di query string dipertahankan.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function mbgSlugFromTab(tab: string | null): 'ringkasan' | 'keracunan' | 'pengawasan' {
  if (tab === 'keracunan') return 'keracunan'
  if (tab === 'gizi' || tab === 'pengawasan') return 'pengawasan'
  return 'ringkasan'
}

export default function MbgLegacyRedirect() {
  const router = useRouter()
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const slug = mbgSlugFromTab(sp.get('tab'))
    sp.delete('tab')
    const q = sp.toString()
    router.replace(`/dashboard/mbg/${slug}${q ? `?${q}` : ''}`)
  }, [router])
  return <div className="p-6 text-sm text-slate-500" data-testid="mbg-redirect">Mengalihkan ke Dasbor MBG…</div>
}

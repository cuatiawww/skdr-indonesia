'use client'
// PR 033: halaman kunjungan (identitas + Formulir 1–13). ?mode=lihat = hanya baca.
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import MbgHub from '@/components/pengawasan-gizi/MbgHub'

export default function PengawasanGiziHubPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id } = useParams<{ id: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <MbgHub key={`${id}-${view}`} id={Number(id)} viewOnly={view} />
}

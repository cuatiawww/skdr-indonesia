'use client'
// PR 033: identitas kunjungan (/identitas) atau Formulir 1–13 (/f1 … /f13). ?mode=lihat = hanya baca.
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import MbgWizard from '@/components/pengawasan-gizi/MbgWizard'

export default function PengawasanGiziFormPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id, form } = useParams<{ id: string; form: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <MbgWizard key={`${id}-${form}-${view}`} kid={Number(id) || null} target={form} viewOnly={view} />
}

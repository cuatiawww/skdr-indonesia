'use client'
// PR 031: edit / lihat satu Form Individu (?mode=lihat = hanya baca).
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { INDIVIDU_FORM } from '@/lib/laporan/individu'

export default function FormIndividuEditPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id } = useParams<{ id: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <LaporanWizard key={`${id}-${view}`} def={INDIVIDU_FORM} id={Number(id) || null} viewOnly={view} />
}

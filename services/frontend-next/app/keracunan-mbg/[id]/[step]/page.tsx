'use client'
// PR 034: wizard langkah s1–s6. ?mode=lihat = hanya baca.
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import KpWizard from '@/components/keracunan-mbg/KpWizard'

export default function KeracunanMbgStepPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id, step } = useParams<{ id: string; step: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <KpWizard key={`${id}-${view}`} rid={Number(id) || null} stepId={step} viewOnly={view} />
}

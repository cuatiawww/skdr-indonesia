'use client'
// PR 006: edit / view one PE.
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import PeFormEditor from '@/components/pe/PeFormEditor'

export default function EditPePage() {
  return <Suspense fallback={null}><EditPeInner /></Suspense>
}

function EditPeInner() {
  const { form, id } = useParams<{ form: string; id: string }>()
  const view = useSearchParams().get('mode') === 'lihat' // PR 011: Lihat = read-only detail
  return <PeFormEditor key={`${id}-${view}`} formKey={form} caseId={Number(id) || null} viewOnly={view} />
}

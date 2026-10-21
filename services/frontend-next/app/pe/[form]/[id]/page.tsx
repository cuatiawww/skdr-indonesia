'use client'
// PR 006: edit / view one PE.
import { useParams } from 'next/navigation'
import PeFormEditor from '@/components/pe/PeFormEditor'

export default function EditPePage() {
  const { form, id } = useParams<{ form: string; id: string }>()
  return <PeFormEditor key={id} formKey={form} caseId={Number(id) || null} />
}

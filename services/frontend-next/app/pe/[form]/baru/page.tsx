'use client'
// PR 006: new PE (draft is created on the first autosave; No. PE is assigned by the server then).
import { useParams } from 'next/navigation'
import PeFormEditor from '@/components/pe/PeFormEditor'

export default function NewPePage() {
  const { form } = useParams<{ form: string }>()
  return <PeFormEditor formKey={form} caseId={null} />
}

'use client'
// PR 034: ringkasan kejadian (status, update harian, laboratorium, tutup/buka).
import { useParams } from 'next/navigation'
import KpDetail from '@/components/keracunan-mbg/KpDetail'

export default function KeracunanMbgDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <KpDetail key={id} id={Number(id)} />
}

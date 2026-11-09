'use client'
// PR 030: edit / lihat satu laporan EBS (?mode=lihat = hanya baca).
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { EBS_FORM } from '@/lib/laporan/ebs'

export default function LaporanEBSEditPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id } = useParams<{ id: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <LaporanWizard key={`${id}-${view}`} def={EBS_FORM} id={Number(id) || null} viewOnly={view} />
}

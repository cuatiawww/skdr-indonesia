'use client'
// PR 030: edit / lihat satu laporan IBS (?mode=lihat = hanya baca).
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { IBS_FORM } from '@/lib/laporan/ibs'

export default function LaporanIBSEditPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}

function Inner() {
  const { id } = useParams<{ id: string }>()
  const view = useSearchParams().get('mode') === 'lihat'
  return <LaporanWizard key={`${id}-${view}`} def={IBS_FORM} id={Number(id) || null} viewOnly={view} />
}

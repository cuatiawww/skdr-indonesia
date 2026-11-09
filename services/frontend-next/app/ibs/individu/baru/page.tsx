'use client'
// PR 031: Form Individu baru (draf dibuat saat autosave pertama; nomor IND-… diberikan server).
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { INDIVIDU_FORM } from '@/lib/laporan/individu'

export default function FormIndividuNewPage() {
  return <LaporanWizard def={INDIVIDU_FORM} id={null} />
}

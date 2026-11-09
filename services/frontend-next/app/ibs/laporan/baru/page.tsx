'use client'
// PR 030: laporan IBS baru (draf dibuat saat autosave pertama; nomor diberikan server).
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { IBS_FORM } from '@/lib/laporan/ibs'

export default function LaporanIBSNewPage() {
  return <LaporanWizard def={IBS_FORM} id={null} />
}

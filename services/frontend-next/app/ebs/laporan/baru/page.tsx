'use client'
// PR 030: laporan EBS baru (draf dibuat saat autosave pertama; nomor diberikan server).
import LaporanWizard from '@/components/laporan/LaporanWizard'
import { EBS_FORM } from '@/lib/laporan/ebs'

export default function LaporanEBSNewPage() {
  return <LaporanWizard def={EBS_FORM} id={null} />
}

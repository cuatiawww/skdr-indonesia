'use client'
// PR 034: laporan kejadian baru — draf dibuat setelah 4 isian wajib terisi (atau Simpan Draf).
import KpWizard from '@/components/keracunan-mbg/KpWizard'

export default function KeracunanMbgNewPage() {
  return <KpWizard rid={null} stepId="s1" />
}

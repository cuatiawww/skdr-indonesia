'use client'
// PR 033: kunjungan baru — identitas dulu; draf dibuat setelah identitas valid atau saat Simpan Draf.
import MbgWizard from '@/components/pengawasan-gizi/MbgWizard'

export default function PengawasanGiziNewPage() {
  return <MbgWizard kid={null} target="identitas" />
}

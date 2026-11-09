'use client'
// PR 031: daftar Form Individu IBS (data per pasien).
import LaporanList from '@/components/laporan/LaporanList'
import { INDIVIDU_FORM } from '@/lib/laporan/individu'

export default function FormIndividuListPage() {
  return <LaporanList def={INDIVIDU_FORM} subtitle="Data per pasien (SKDR-IBS) — penyakit agregat, pemeriksaan, dan catatan SOAP." />
}

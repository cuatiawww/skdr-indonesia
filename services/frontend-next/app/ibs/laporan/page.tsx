'use client'
// PR 030: daftar Laporan IBS. PR 031: judul "Entri Data Agregat" (URL tetap).
import LaporanList from '@/components/laporan/LaporanList'
import { IBS_FORM } from '@/lib/laporan/ibs'

export default function LaporanIBSListPage() {
  return <LaporanList def={IBS_FORM} subtitle="Data agregat mingguan per unit (SKDR-IBS): 24 penyakit × Jumlah Kasus / Kematian / Lab + Total Kunjungan." />
}

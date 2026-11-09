'use client'
// PR 030: daftar Laporan IBS.
import LaporanList from '@/components/laporan/LaporanList'
import { IBS_FORM } from '@/lib/laporan/ibs'

export default function LaporanIBSListPage() {
  return <LaporanList def={IBS_FORM} subtitle="Data agregat mingguan per unit (Surveilans Berbasis Indikator)." />
}

'use client'
// PR 030: daftar Laporan IBS. Judul "Laporan Agregat IBS" (URL tetap).
import LaporanList from '@/components/laporan/LaporanList'
import { IBS_FORM } from '@/lib/laporan/ibs'

export default function LaporanIBSListPage() {
  return <LaporanList def={IBS_FORM} />
}

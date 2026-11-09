'use client'
// PR 030: daftar Laporan EBS.
import LaporanList from '@/components/laporan/LaporanList'
import { EBS_FORM } from '@/lib/laporan/ebs'

export default function LaporanEBSListPage() {
  return <LaporanList def={EBS_FORM} subtitle="Laporan rumor/kejadian (Surveilans Berbasis Kejadian) yang diinput di SKDR Indonesia." />
}

// PR 030: /ibs → daftar Laporan IBS.
import { redirect } from 'next/navigation'

export default function IbsIndex() {
  redirect('/ibs/laporan')
}

'use client'
// PR 016: global page filters kept in the URL (?sumber=semua|ebs|pe, ?ukuran=alert|kasus). One filter per page; every
// section follows it. Legacy ?source=pe|ebs|form links (disease pages, bookmarks) are still accepted.
import { useCallback, useEffect, useState } from 'react'

export type Sumber = 'all' | 'ebs' | 'pe'
export type UkuranEbs = 'alert' | 'kasus'

const readSumber = (): Sumber => {
  if (typeof window === 'undefined') return 'all'
  const sp = new URLSearchParams(window.location.search)
  const v = (sp.get('sumber') || sp.get('source') || '').toLowerCase()
  // PR 039: ?sumber=ibs (Dasbor Utama: Laporan Agregat IBS) uses the same second-source slot as 'pe'.
  return v === 'ebs' ? 'ebs' : v === 'pe' || v === 'form' || v === 'ibs' ? 'pe' : 'all'
}
const readUkuran = (): UkuranEbs => {
  if (typeof window === 'undefined') return 'alert'
  return new URLSearchParams(window.location.search).get('ukuran') === 'kasus' ? 'kasus' : 'alert'
}
function writeParam(key: string, value: string | null, drop: string[] = []) {
  const url = new URL(window.location.href)
  drop.forEach((k) => url.searchParams.delete(k))
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  window.history.replaceState(window.history.state, '', url.toString())
}

/** PR 039: opts.peParam = URL value written for the second source (main dashboard: 'ibs'; default 'pe'). */
export function useSumber(opts: { peParam?: string } = {}) {
  const peParam = opts.peParam || 'pe'
  const [sumber, setS] = useState<Sumber>('all')
  const [ukuran, setU] = useState<UkuranEbs>('alert')
  const [ready, setReady] = useState(false)
  useEffect(() => { setS(readSumber()); setU(readUkuran()); setReady(true) }, [])
  const setSumber = useCallback((v: Sumber) => { setS(v); writeParam('sumber', v === 'all' ? null : v === 'pe' ? peParam : v, ['source']) }, [peParam])
  const setUkuran = useCallback((v: UkuranEbs) => { setU(v); writeParam('ukuran', v === 'alert' ? null : v) }, [])
  return { sumber, setSumber, ukuran, setUkuran, ready, apiSource: sumber === 'all' ? undefined : sumber }
}

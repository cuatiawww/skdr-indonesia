// PR 022: urutan, label dan seksi tersembunyi Dasbor Utama dari app_settings.dashboard_sections (migrasi 047).
import { useEffect, useState } from 'react'
import { fetchFrom } from '@/lib/api'

export type SectionsConf = { order: string[]; labels: Record<string, string>; hidden: string[] }
/** Dipakai hanya sampai /api/v1/dashboard/sections menjawab (atau bila baris setelan belum ada). */
const BAWAAN: SectionsConf = {
  order: ['ringkasan', 'cfr', 'alert', 't717', 'laboratorium', 'wilayah', 'tren', 'klaster', 'nar'],
  labels: { ringkasan: 'Ringkasan', cfr: 'CFR', alert: 'Alert', t717: '7-1-7', laboratorium: 'Laboratorium', wilayah: 'Sebaran wilayah', tren: 'Tren', klaster: 'Klaster dan epi curve', nar: 'NAR-SKDR' },
  hidden: [],
}
export function useDashboardSections(): SectionsConf {
  const [c, setC] = useState<SectionsConf>(BAWAAN)
  useEffect(() => {
    fetchFrom<SectionsConf>('/api/v1/dashboard/sections').then((d) => {
      if (d && Array.isArray(d.order) && d.order.length) setC({ order: d.order, labels: { ...BAWAAN.labels, ...(d.labels || {}) }, hidden: d.hidden || [] })
      else if (d && Array.isArray(d.hidden)) setC({ ...BAWAAN, hidden: d.hidden })
    }).catch(() => undefined)
  }, [])
  return c
}

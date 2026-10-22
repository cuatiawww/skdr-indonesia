// PR 022: satu fetch /api/v1/alert-skdr per filter, dipakai bersama seksi CFR, Alert dan 7-1-7.
import { fetchFrom } from '@/lib/api'

export type Ci = { num: number; den: number; pct: number | null; ci_low: number | null; ci_high: number | null }
export type Stage = { den: number; on_time: number; late: number; missing: number; pct: number | null; median_days: number | null }
export type AlertSkdr = {
  kpis: { alerts: number; verified: number; klb: number; respon24: number; cases: number; deaths: number; units: number; verified_respon24: number }
  cfr: { overall: Ci; by_disease: { disease: string; cfr: Ci }[] }
  status: { verifikasi: string; klb: string; count: number }[]
  by_disease: { disease: string; alerts: number; verified: number; klb: number; respon24: number; cases: number; deaths: number; notify: Stage }[]
  trend: { year: number; week: number; alerts: number; verified: number; respon24: number }[]
  t717: { detection: Stage | null; detection_reason: string; notification: Stage; notification_basis: string; response: Stage; response_basis: string }
}
const cache = new Map<string, Promise<AlertSkdr>>()
export function toQs(query: Record<string, unknown>) {
  return new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
}
export function fetchAlertSkdr(qs: string, fresh = false): Promise<AlertSkdr> {
  if (fresh) cache.delete(qs)
  let p = cache.get(qs)
  if (!p) {
    p = fetchFrom<AlertSkdr>(`/api/v1/alert-skdr?${qs}`)
    p.catch(() => cache.delete(qs))
    if (cache.size > 20) cache.clear()
    cache.set(qs, p)
  }
  return p
}
export const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('id-ID')
export const pf = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 3 : 1 })}%`)

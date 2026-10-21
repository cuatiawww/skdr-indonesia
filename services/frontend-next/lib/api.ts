import { API_BASE } from './public-path'

export interface MasterItem { id: number; code: string; name: string; level?: string }
export interface CaseReport {
  id: string; report_date: string; disease: string; location: string
  cases: number; deaths: number; notes: string | null; created_at: string
}
export interface GroupRow { name: string; cases: number; deaths: number; reports: number }
export interface DashboardSummary {
  totals: { reports: number; cases: number; deaths: number; cfr: number; locations: number; diseases: number }
  by_disease: GroupRow[]; by_location: GroupRow[]
  trend: { date: string; cases: number; deaths: number }[]
}
export interface Filters { from?: string; to?: string; disease_id?: string; location_id?: string }
export interface NewCaseReport {
  disease_id: number; location_id: number; report_date: string; cases: number; deaths: number; notes?: string
}

function qs(f: Filters = {}) {
  const p = new URLSearchParams()
  Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`)
  return json.data as T
}

export const fetchDiseases = () => req<MasterItem[]>('/master/diseases')
export const fetchLocations = () => req<MasterItem[]>('/master/locations')
export const fetchSummary = (f?: Filters) => req<DashboardSummary>(`/dashboard/summary${qs(f)}`)
export const fetchReports = (f?: Filters) => req<CaseReport[]>(`/case-reports${qs(f)}`)
export async function createReport(body: NewCaseReport) {
  const res = await fetch(`${API_BASE}/case-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`)
  return json as { success: true; id: string }
}

// SKDR form API (case reports). Uses the same base path and auth headers as the NLP lib/api.
import { fetchFrom } from '@/lib/api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export interface MasterDisease { id: number; code: string; name: string }
export interface MasterCountry { id: string; iso2: string; iso3: string; name: string; flag_code?: string | null }
export interface MasterLocation {
  id: number; code: string; name: string; level: string; country_iso2: string
  latitude: number | null; longitude: number | null
}
export interface CaseReport {
  id: string; report_date: string; disease: string; location: string; country: string
  cases: number; deaths: number; notes: string | null; created_at: string
  latitude: number | null; longitude: number | null; is_reviewed: boolean
}
export interface NewCaseReport {
  disease_id: number; country_id: string; location_id?: number | null; location_name?: string
  latitude?: number | null; longitude?: number | null; report_date: string
  cases: number; deaths: number; notes?: string; is_reviewed: boolean
}

export const fetchFormDiseases = () => fetchFrom<MasterDisease[]>('/api/v1/master/diseases')
export const fetchFormCountries = () => fetchFrom<MasterCountry[]>('/api/v1/master/countries')
export const fetchFormLocations = (iso2: string) =>
  fetchFrom<MasterLocation[]>(`/api/v1/master/locations?country_iso2=${encodeURIComponent(iso2)}`)
export const fetchCaseReports = () => fetchFrom<CaseReport[]>('/api/v1/case-reports?limit=500')

export async function createCaseReport(body: NewCaseReport) {
  const res = await fetch(`${PUBLIC_BASE_PATH}/api/v1/case-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`)
  return json as { success: true; id: string }
}

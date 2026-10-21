// SKDR form API (case reports + Indonesia master data). Same base path as the NLP lib/api; no auth.
import { fetchFrom } from '@/lib/api'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export interface MasterDisease {
  id: number; code: string; name: string; canonical_name?: string | null; english_name?: string | null
  category?: string | null; is_zoonotic?: boolean; aliases_id?: string[]
}
export interface MasterProvince { id: number; code: string; name: string; latitude: number | null; longitude: number | null }
export interface MasterKabkota {
  id: number; code: string; kemendagri_code: string; name: string; kind: 'kabupaten' | 'kota'
  province_id: number; province_name: string; latitude: number; longitude: number
}
export interface CaseReport {
  id: string; report_date: string; disease: string; location: string; province: string; kabkota: string
  cases: number; deaths: number; notes: string | null; created_at: string
  latitude: number | null; longitude: number | null; is_reviewed: boolean
}
export interface NewCaseReport {
  disease_id: number; province_id: number; kabkota_id?: number | null; location_name?: string
  latitude?: number | null; longitude?: number | null; report_date: string
  cases: number; deaths: number; notes?: string; is_reviewed: boolean
}

export const fetchFormDiseases = () => fetchFrom<MasterDisease[]>('/api/v1/master/diseases')
export const fetchProvinces = () => fetchFrom<MasterProvince[]>('/api/v1/master/provinces')
export const fetchKabkota = (provinceId: number) =>
  fetchFrom<MasterKabkota[]>(`/api/v1/master/kabkota?province_id=${encodeURIComponent(String(provinceId))}`)
export const fetchCaseReports = () => fetchFrom<CaseReport[]>('/api/v1/case-reports?limit=500')

/** Throws Error(message) where message is the server's (Indonesian) error text or the HTTP status. */
export async function createCaseReport(body: NewCaseReport) {
  const res = await fetch(`${PUBLIC_BASE_PATH}/api/v1/case-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error || `HTTP ${res.status}`)
  return json as { success: true; id: string }
}

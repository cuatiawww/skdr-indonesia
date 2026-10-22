// PR 023: satu fetch /api/v1/ebs-analitik per (filter dasbor + filter EBS), dipakai bersama panel-panel EBS.
import { fetchFrom } from '@/lib/api'
import { toQs } from '@/lib/alert-skdr'

export type EbsAnalitik = {
  kpis: { reports: number; cases: number; deaths: number; with_coords: number; coords_pct: number | null; over_cap: number; negative_deaths: number; units: number; last_date: string | null }
  config: { max_kasus_per_laporan: number | null; outlier_flag_kasus: number; silent_weeks: number; silent_baseline_weeks: number; respons_target_days: number }
  kel_unit: { kel_unit: string; reports: number; cases: number }[]
  units: { unit: string | null; kel_unit: string | null; kabkota: string | null; reports: number; cases: number; last: string | null }[]
  silent: { count: number; active_base: number; ref_date: string | null; rows: { unit: string | null; kel_unit: string | null; kabkota: string | null; base_reports: number; last: string | null }[] }
  respons: { den: number; with_update: number; on_time: number; late: number; missing: number; pct: number | null; median_days: number | null
    by_disease: { disease: string; reports: number; with_update: number; on_time: number; pct: number | null; median_days: number | null }[] }
  funnel: { status: string; count: number }[]
  status_trend: { week: string; status: string; count: number }[]
  diagnosa_matrix: { awal: string; verifikasi: string; count: number }[]
  histogram: { from: number; to: number | null; count: number }[]
  flags: { no_ebs: string | null; date: string | null; disease: string | null; kabkota: string | null; province: string | null; cases: number; deaths: number; reason: string }[]
  klb: { code: string; label: string; reports: number; cases: number; deaths: number }[]
  coords_by_province: { province: string | null; reports: number; with_coords: number; pct: number | null }[]
  text_classes: { field: string; filled: number; classes: { kelas: string; count: number }[] }[]
  weekly: { year: number; week: number; label: string; reports: number; cases: number; prev_reports: number | null; prev_cases: number | null }[]
  prev_available: boolean
}
const cache = new Map<string, Promise<EbsAnalitik>>()
export function fetchEbsAnalitik(query: Record<string, unknown>, extra: Record<string, string> = {}): Promise<EbsAnalitik> {
  const qs = toQs({ ...query, ...extra })
  let p = cache.get(qs)
  if (!p) {
    p = fetchFrom<EbsAnalitik>(`/api/v1/ebs-analitik?${qs}`)
    p.catch(() => cache.delete(qs))
    if (cache.size > 30) cache.clear()
    cache.set(qs, p)
  }
  return p
}

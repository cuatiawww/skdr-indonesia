// PR 012: types for /api/v1/analytics/*
export type Week = { start: string; year: number; week: number; label: string }
export type Rate = { num: number; den: number; pct: number | null; as_fraction: boolean; ci_low: number | null; ci_high: number | null }
export type EbsSeries = { disease_id: number; code: string; name: string; total: number; alerts: number[]; cases: number[] }
export type PeSeries = { disease_id: number; code: string; name: string; total: number; cases: number[]; deaths: number[] }
export type HeatRow = { province_id: number; code: string; name: string; total: number; values: number[] }
export type Overview = {
  weeks: Week[]; sources: { ebs: boolean; pe: boolean }; trend: { ebs: EbsSeries[]; pe: PeSeries[] }
  ebs_unmapped_alerts: number; heatmap: { ebs_alerts: HeatRow[]; ebs_cases: HeatRow[]; pe_cases: HeatRow[] }; disease_not_found: boolean
}
export type DiseaseInfo = {
  id: number; code: string; name: string; english_name: string | null; category: string | null; is_zoonotic: boolean
  description: string | null; icd10: string | null; symptoms: string | null; transmission: string | null; ebs_alerts?: number; pe_cases?: number
}
export type Region = { id: number; code: string; name: string; ebs_alerts: number; ebs_cases: number; pe_cases: number }
export type TopRow = { id: number; code: string; name: string; value: number }
export type DiseaseDetail = {
  disease: DiseaseInfo; weeks: Week[]; sources: { ebs: boolean; pe: boolean }; level: 'province' | 'kabkota'; scope: string
  totals: { ebs_alerts: number; ebs_cases: number; ebs_deaths: number; pe_cases: number; pe_deaths: number }
  epi: { ebs_alerts: number[]; ebs_cases: number[]; ebs_deaths: number[]; pe_cases: number[]; pe_deaths: number[] }
  regions: Region[]; top: { ebs_alerts: TopRow[]; ebs_cases: TopRow[]; pe_cases: TopRow[] }
  age: { group: string; male: number; female: number; unknown: number }[]; sex: { sex: string; n: number }[]
  cfr: { pe: { rate: Rate; unknown: number; confirmed_classes: string[]; label: string | null }; ebs: { rate: Rate; basis: string } }
  latest: {
    ebs: { id?: number; no_ebs: string | null; date: string | null; kabkota: string | null; province: string | null; status: string | null; cases: number | null; deaths: number | null; diagnosa: string | null }[]
    pe: { id: number; no_pe: string; form_key: string; status: string; classification: string | null; date: string | null; kabkota: string | null; province: string | null; patient_initials: string | null }[]
  }
  pe_form: string | null
}
export const nf = new Intl.NumberFormat('id-ID')
export const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : nf.format(v))
export const pct1 = (v: number) => v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export function rateText(r?: Rate | null) {
  if (!r || r.den === 0) return '—'
  return r.as_fraction ? `${r.num}/${r.den}` : `${pct1(r.pct ?? 0)}%`
}
export const ciText = (r?: Rate | null) => (!r || r.den === 0 || r.ci_low === null || r.ci_high === null ? '—' : `${pct1(r.ci_low)}–${pct1(r.ci_high)}%`)
export const qs = (o: Record<string, unknown>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)])).toString()
/** Sequential palette (light → dark) for heatmap / choropleth; 0 stays neutral. PR 016: theme tokens (lib/theme.ts). */
export { shadeVar as shade } from '@/lib/theme'

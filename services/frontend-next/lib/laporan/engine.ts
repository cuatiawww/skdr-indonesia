// PR 030: small form engine for the EBS/IBS wizards (steps → sections → fields, conditional visibility,
// required-if, progress per step). Validation rules live in ebs.ts / ibs.ts and mirror services/backend-rust/src/laporan.rs.
import { getEpiWeekDateRange, getMmwrEpiWeek, getWeeksInYear } from '@/lib/epi-week'

export type Data = Record<string, any>
export interface Issue { step: string; key: string; msg: string }
export type Jenis = 'ebs' | 'ibs'

export type FieldType =
  | 'info' | 'text' | 'tel' | 'textarea' | 'richtext' | 'number' | 'date' | 'select' | 'multiselect' | 'yatidak'
  | 'province' | 'kabkota' | 'kecamatan' | 'unit' | 'agegrid' | 'ibsgrid' | 'lampiran' | 'epiweek' | 'tahun' | 'check' | 'domsama'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean | ((d: Data) => boolean)
  visible?: (d: Data) => boolean
  /** laporan_opsi kelompok, or 'penyakit' */
  options?: string
  hint?: string
  placeholder?: string
  /** province key (kabkota) / kabkota key (kecamatan) */
  depends?: string
  /** kabkota: may be picked without a province (province is then filled automatically) */
  direct?: string
  /** keys cleared when this field changes (cascade) */
  resets?: string[]
  /** show the epi week next to a date */
  epi?: boolean
  /** "Hari ini / Kemarin" shortcuts */
  shortcuts?: boolean
  /** -/+ buttons on number inputs */
  stepper?: boolean
  /** indented follow-up under a Ya/Tidak question */
  child?: boolean
  wide?: boolean
  maxLen?: number
  /** info chip renderer */
  info?: (d: Data, ctx: { no: string | null }) => string
}

export interface SectionDef { id: string; title: string; desc?: string; fields: FieldDef[]; visible?: (d: Data) => boolean }
export interface StepDef { id: string; title: string; desc?: string; sections: SectionDef[]; review?: boolean }

export interface Refs {
  opsi: Record<string, { value: string; label: string }[]>
  penyakit: { value: string; label: string; disease_id: number | null; disease_name: string | null; symptoms: string | null; transmission: string | null }[]
  ibs_penyakit: { kode: string; urutan: number; kode_sms: string; nama: string; nama_asli: string; is_total: boolean }[]
  today: string
  lampiran: { max_bytes: number; tipe: string[] }
}

export interface FormDef {
  jenis: Jenis
  title: string
  short: string
  eyebrow: string
  listHref: string
  steps: StepDef[]
  validate: (d: Data, refs: Refs) => { errors: Issue[]; warnings: Issue[] }
}

export const isFilled = (v: any) =>
  v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0) && v !== false

export const ya = (d: Data, k: string) => d[k] === 'Ya'
export const toNum = (v: any): number | null => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}
export const isReq = (f: FieldDef, d: Data) => (typeof f.required === 'function' ? f.required(d) : !!f.required)
export const isVisible = (f: { visible?: (d: Data) => boolean }, d: Data) => !f.visible || f.visible(d)

export function validHp(x: string): boolean {
  const digits = x.replace(/[\s\-.()]/g, '')
  const m = digits.match(/^(?:\+62|62|0)(\d+)$/)
  return !!m && m[1].startsWith('8') && m[1].length >= 8 && m[1].length <= 12
}

/** collects issues; helpers mirror laporan.rs Issues */
export class Collector {
  errors: Issue[] = []
  warnings: Issue[] = []
  constructor(private d: Data) {}
  e(step: string, key: string, msg: string) { this.errors.push({ step, key, msg }) }
  w(step: string, key: string, msg: string) { this.warnings.push({ step, key, msg }) }
  req(step: string, key: string, label: string) {
    if (!isFilled(this.d[key])) { this.e(step, key, `${label} wajib diisi`); return false }
    return true
  }
  nonneg(step: string, key: string, label: string, v: any = this.d[key]) {
    const n = toNum(v)
    if (n === null) return
    if (!Number.isInteger(n) || n < 0) this.e(step, key, `${label} harus bilangan bulat ≥ 0`)
  }
  notAfter(step: string, key: string, label: string, max: string) {
    const v = this.d[key]
    if (isFilled(v) && v > max) this.e(step, key, `${label} tidak boleh setelah Tanggal Laporan`)
  }
}

// ─── epi week ─────────────────────────────────────────────────────────────────
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export function epiLabel(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const { year, week } = getMmwrEpiWeek(new Date(`${iso}T00:00:00Z`))
  const r = getEpiWeekDateRange(year, week)
  return `Minggu Epid ${week}/${year} · ${rangeShort(r.startIso, r.endIso)}`
}
export function rangeShort(a: string, b: string) {
  const [ya1, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return ya1 === yb && ma === mb ? `${da}–${db} ${SHORT_MONTH[mb - 1]} ${yb}` : ya1 === yb ? `${da} ${SHORT_MONTH[ma - 1]} – ${db} ${SHORT_MONTH[mb - 1]} ${yb}` : `${da} ${SHORT_MONTH[ma - 1]} ${ya1} – ${db} ${SHORT_MONTH[mb - 1]} ${yb}`
}
export function weekStart(year: number, week: number) { return getEpiWeekDateRange(year, week).startIso }
export function weeksOf(year: number) {
  return Array.from({ length: getWeeksInYear(year) }, (_, i) => {
    const r = getEpiWeekDateRange(year, i + 1)
    return { week: i + 1, start: r.startIso, end: r.endIso, label: rangeShort(r.startIso, r.endIso) }
  })
}
/** reporting week = the last complete epi week (SKDR shows week 44 on Monday 9 Nov 2026) */
export function reportingWeek(todayIso: string) {
  const d = new Date(`${todayIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return getMmwrEpiWeek(d)
}
export const weeksInYear = getWeeksInYear

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── progress ─────────────────────────────────────────────────────────────────
export function visibleFields(step: StepDef, d: Data): FieldDef[] {
  const out: FieldDef[] = []
  step.sections.forEach((se) => { if (isVisible(se, d)) se.fields.forEach((f) => { if (isVisible(f, d)) out.push(f) }) })
  return out
}

export function stepStats(def: FormDef, d: Data, errors: Issue[]) {
  const errKeys = new Set(errors.map((e) => e.key.split('.')[0]))
  return def.steps.map((st) => {
    let total = 0, done = 0
    visibleFields(st, d).forEach((f) => {
      if (!isReq(f, d) || ['info', 'lampiran', 'agegrid', 'ibsgrid'].includes(f.type)) return
      total++
      if (isFilled(d[f.key]) && !errKeys.has(f.key)) done++
    })
    const errs = errors.filter((e) => e.step === st.id)
    return { total, done, errs, pct: st.review ? (errors.length ? 0 : 1) : total ? done / total : errs.length ? 0 : 1 }
  })
}

export function overall(stats: ReturnType<typeof stepStats>) {
  const total = stats.reduce((a, s) => a + s.total, 0)
  const done = stats.reduce((a, s) => a + s.done, 0)
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

export const UNIT_KEY = (d: Data) => (d.unit_kode ? String(d.unit_kode) : d.unit_pelapor ? `${String(d.unit_pelapor).toLowerCase()}|${d.kabkota_id ?? ''}` : '')

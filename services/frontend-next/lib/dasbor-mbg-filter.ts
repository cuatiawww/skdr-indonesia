// PR 052: Dasbor MBG — satu filter bersama (panel samping) untuk Ringkasan, Keracunan Pangan, dan Pengawasan Gizi.
// Filter tersimpan di URL agar setiap tampilan bisa dibagikan. Juga berisi agregasi waktu (Tahun/Bulan/Minggu Epid/Harian)
// dan interval kepercayaan Wilson untuk proporsi (CFR, attack rate).
import { getMmwrEpiWeek, MONTHS_ID } from '@/lib/epi-week'
import type { MbgDashFilterParams } from '@/lib/dasbor-mbg-api'

export type MbgTab = 'ringkasan' | 'keracunan' | 'gizi'
export type Gran = 'tahun' | 'bulan' | 'minggu' | 'harian'
export type Jenis = 'kejadian' | 'kasus' | 'meninggal'

export interface MbgFilter {
  from: string
  to: string
  gran: Gran
  jenis: Jenis
  prov: string[]
  kab: string[]
  kec: string[]
  sppg: string
  sekolah: string
  // Keracunan (lanjutan)
  status: string
  lab: string
  ikl: string
  slhs: string
  // Pengawasan Gizi (lanjutan)
  gstatus: string
  rekap12: string
}

export const GRAN_OPTS: { value: Gran; label: string }[] = [
  { value: 'tahun', label: 'Tahun' },
  { value: 'bulan', label: 'Bulan' },
  { value: 'minggu', label: 'Minggu Epid' },
  { value: 'harian', label: 'Harian' },
]
export const JENIS_OPTS: { value: Jenis; label: string; long: string }[] = [
  { value: 'kejadian', label: 'Kejadian', long: 'Jumlah Kejadian' },
  { value: 'kasus', label: 'Kasus', long: 'Jumlah Kasus' },
  { value: 'meninggal', label: 'Meninggal', long: 'Jumlah Meninggal' },
]
export const jenisLabel = (j: Jenis) => JENIS_OPTS.find((x) => x.value === j)?.long || j

export function defaultMbgFilter(): MbgFilter {
  return { from: '', to: '', gran: 'minggu', jenis: 'kejadian', prov: [], kab: [], kec: [], sppg: '', sekolah: '', status: 'all', lab: 'all', ikl: 'all', slhs: 'all', gstatus: 'all', rekap12: 'all' }
}

const LIST_KEYS = ['prov', 'kab', 'kec'] as const
const STR_KEYS = ['from', 'to', 'sppg', 'sekolah', 'status', 'lab', 'ikl', 'slhs', 'gstatus', 'rekap12'] as const

export function readMbgFilter(sp: URLSearchParams): MbgFilter {
  const f = defaultMbgFilter()
  for (const k of STR_KEYS) { const v = sp.get(k); if (v) (f as any)[k] = v }
  // kecamatan names may contain commas → "|" separator for the URL
  for (const k of LIST_KEYS) { const v = sp.get(k); if (v) f[k] = v.split(k === 'kec' ? '|' : ',').map((x) => x.trim()).filter(Boolean) }
  const g = sp.get('gran'); if (g && GRAN_OPTS.some((o) => o.value === g)) f.gran = g as Gran
  const j = sp.get('jenis'); if (j && JENIS_OPTS.some((o) => o.value === j)) f.jenis = j as Jenis
  return f
}

export function writeMbgFilter(url: URL, f: MbgFilter) {
  const d = defaultMbgFilter()
  for (const k of STR_KEYS) { if (f[k] && f[k] !== d[k]) url.searchParams.set(k, f[k]); else url.searchParams.delete(k) }
  for (const k of LIST_KEYS) { if (f[k].length) url.searchParams.set(k, f[k].join(k === 'kec' ? '|' : ',')); else url.searchParams.delete(k) }
  if (f.gran !== d.gran) url.searchParams.set('gran', f.gran); else url.searchParams.delete('gran')
  if (f.jenis !== d.jenis) url.searchParams.set('jenis', f.jenis); else url.searchParams.delete('jenis')
}

export type MapState = { level: 'prov' | 'kab'; parent: { id: number; name: string } | null }

export function keracunanParams(f: MbgFilter, m: MapState): MbgDashFilterParams {
  return {
    status: f.status, lab_status: f.lab, ikl: f.ikl, slhs: f.slhs, from: f.from, to: f.to,
    province_id: f.prov, kabkota_id: f.kab, sppg: f.sppg, kecamatan: f.kec.join(','), sekolah: f.sekolah,
    level: m.level, parent: m.parent?.id ?? '',
  }
}
export function giziParams(f: MbgFilter, m: MapState): MbgDashFilterParams {
  return { status: f.gstatus, rekap12: f.rekap12, from: f.from, to: f.to, province_id: f.prov, kabkota_id: f.kab, sppg: f.sppg, level: m.level, parent: m.parent?.id ?? '' }
}

/** Active (non-default) filters; `scope` limits the count to filters that apply to a tab. */
export function activeMbgCount(f: MbgFilter, scope: MbgTab = 'ringkasan') {
  let n = (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.prov.length ? 1 : 0) + (f.kab.length ? 1 : 0) + (f.sppg ? 1 : 0)
  if (scope !== 'gizi') n += (f.kec.length ? 1 : 0) + (f.sekolah ? 1 : 0) + ['status', 'lab', 'ikl', 'slhs'].filter((k) => (f as any)[k] !== 'all').length
  if (scope !== 'keracunan') n += ['gstatus', 'rekap12'].filter((k) => (f as any)[k] !== 'all').length
  return n
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
export function presetRange(kind: '7h' | '30h' | '12m' | 'tahun' | 'semua'): { from: string; to: string } {
  if (kind === 'semua') return { from: '', to: '' }
  const now = new Date(Date.now() + 7 * 3600 * 1000) // WIB
  const to = iso(now)
  if (kind === 'tahun') return { from: `${now.getUTCFullYear()}-01-01`, to }
  const days = kind === '7h' ? 6 : kind === '30h' ? 29 : 83
  return { from: iso(new Date(now.getTime() - days * 86400000)), to }
}

// ─── Agregasi waktu ───────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
function bucketOf(date: string, g: Gran): { key: string; label: string } {
  const y = Number(date.slice(0, 4)); const m = Number(date.slice(5, 7))
  if (g === 'tahun') return { key: String(y), label: String(y) }
  if (g === 'bulan') return { key: `${y}-${pad(m)}`, label: `${MONTHS_ID[m - 1]} ${y}` }
  if (g === 'minggu') { const w = getMmwrEpiWeek(date); return { key: `${w.year}-W${pad(w.week)}`, label: `M${pad(w.week)}/${String(w.year).slice(2)}` } }
  return { key: date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}` }
}
function nextDay(d: string) { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return iso(t) }

/**
 * Groups a daily series into Tahun/Bulan/Minggu Epid/Harian buckets and fills empty buckets with 0 between the first
 * and last observation, so the epidemic curve shows quiet periods instead of collapsing them.
 */
export type Bucket = { key: string; label: string; [k: string]: any }
export function aggregateSeries<T extends { tanggal: string }>(rows: T[], g: Gran, keys: (keyof T)[]): Bucket[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  const out = new Map<string, Bucket>()
  const blank = (b: { key: string; label: string }): Bucket => { const o: Bucket = { ...b }; for (const k of keys) o[k as string] = 0; return o }
  let d = sorted[0].tanggal
  const end = sorted[sorted.length - 1].tanggal
  let guard = 0
  while (d <= end && guard++ < 4000) { const b = bucketOf(d, g); if (!out.has(b.key)) out.set(b.key, blank(b)); d = nextDay(d) }
  for (const r of sorted) {
    const b = bucketOf(r.tanggal, g)
    const o = out.get(b.key) || blank(b)
    for (const k of keys) o[k as string] += Number((r as any)[k] || 0)
    out.set(b.key, o)
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Wilson score interval (95%) for x/n, in percent. */
export function wilson(x: number, n: number, z = 1.96): { p: number; lo: number; hi: number } | null {
  if (!n || n <= 0 || x < 0 || x > n) return null
  const p = x / n
  const z2 = z * z
  const den = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den
  const r = (v: number) => Math.round(v * 1000) / 10
  return { p: r(p), lo: r(Math.max(0, center - half)), hi: r(Math.min(1, center + half)) }
}

export const fmtJam = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—'
  if (h < 48) return `${h.toLocaleString('id-ID', { maximumFractionDigits: 1 })} jam`
  return `${(h / 24).toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari`
}


// PR 044: Spasial (Dasbor Limited) - types, decoding and map classes for /api/v1/analisa/spasial*.
// Filters are the Matriks Analisa filters (lib/analisa-api.ts), so the two pages share URLs.
import { buildChoroClasses, type ChoroClass, type ChoroConfig } from '@/lib/choropleth-classes'

export type Metric = 'kasus' | 'kematian' | 'laporan' | 'alert' | 'klb' | 'cfr' | 'chg_minggu'
type SeriKey = 'k' | 'm' | 'l' | 'a' | 'b'

export const METRICS: { key: Metric; label: string; tip: string; seri?: SeriKey }[] = [
  { key: 'kasus', label: 'Kasus', seri: 'k', tip: 'Jumlah kasus pada rentang minggu epid. Laporan Agregat IBS: jumlah kasus per penyakit per unit per minggu. Laporan EBS: jumlah kasus pada laporan kejadian.' },
  { key: 'kematian', label: 'Kematian', seri: 'm', tip: 'Jumlah kematian yang dilaporkan pada rentang minggu epid.' },
  { key: 'laporan', label: 'Laporan', seri: 'l', tip: 'Jumlah laporan terkirim. Satu Laporan Agregat IBS = satu unit pelapor x satu minggu epid; satu Laporan EBS = satu kejadian/rumor.' },
  { key: 'alert', label: 'Alert / sinyal', seri: 'a', tip: 'IBS: baris penyakit yang memicu alert SKDR (ambang mingguan). EBS: setiap Laporan EBS dihitung sebagai satu sinyal.' },
  { key: 'klb', label: 'KLB', seri: 'b', tip: 'IBS: alert berstatus KLB. EBS: laporan yang memenuhi kriteria KLB.' },
  { key: 'cfr', label: 'CFR (%)', tip: 'Case fatality rate = kematian / kasus x 100 pada rentang. Tidak stabil bila kasus sedikit; lihat jumlah kasus sebelum menyimpulkan.' },
  { key: 'chg_minggu', label: 'Perubahan vs minggu lalu', tip: 'Perubahan kasus minggu epid terakhir pada rentang dibanding minggu sebelumnya (%). Kosong bila minggu sebelumnya 0 kasus (tidak ada pembanding).' },
]

export interface Seri { k: number[]; m: number[]; l: number[]; a: number[]; b: number[] }
export interface Area {
  id: number; code: string; nama: string; lat: number | null; lon: number | null
  kasus: number; kematian: number; laporan: number; alert: number; klb: number; unit: number
  cfr: number | null; porsi: number | null; kasus_prev: number; chg_periode: number | null
  minggu_ini: number; minggu_lalu: number; chg_minggu: number | null; seri: Seri | null; dipilih: boolean
}
export interface Titik {
  idx: number; src: 'ibs' | 'ebs' | 'ind'; unit: string | null; kab_id: number | null; kab: string | null; kec: string | null; ju: string | null
  lat: number; lon: number; lokasi: 'a' | 'f' | 'c'
  k: number; m: number; l: number; a: number; b: number; v: number; r: number; rn: number; st: string
  w: [number, number, number, number][]
}
export interface SpasialResp {
  meta: any; level: 'provinsi' | 'kabkota'; prov: number | null; kab: number[]; kec: string | null
  minggu: { ws: string; label: string }[]; seri: boolean; minggu_ini: string; minggu_lalu: string
  ringkasan: any; wilayah: Area[]; titik: any[][]; titik_kolom: string[]; titik_terpotong: boolean
  lokasi_label: Record<string, string>; kab_nama: Record<string, string | null>; interpretasi: string[]; ms: number
}

export function decodeTitik(d: SpasialResp | null): Titik[] {
  if (!d?.titik) return []
  return d.titik.map((r, idx) => ({
    idx, src: r[0], unit: r[1], kab_id: r[2], kab: r[2] != null ? d.kab_nama?.[String(r[2])] ?? null : null, kec: r[3], ju: r[4],
    lat: r[5], lon: r[6], lokasi: r[7], k: r[8], m: r[9], l: r[10], a: r[11], b: r[12], v: r[13], r: r[14], rn: r[15], st: r[16], w: r[17] || [],
  }))
}

/** Value of a titik for the whole range (wi < 0) or one week. */
export function titikVal(t: Titik, wi: number): { k: number; a: number; b: number; st: string } {
  if (wi < 0) return { k: t.k, a: t.a, b: t.b, st: t.st }
  const w = t.w.find((x) => x[0] === wi)
  if (!w) return { k: 0, a: 0, b: 0, st: 'none' }
  const st = w[3] > 0 ? 'klb' : t.src === 'ebs' ? (t.st === 'klb' ? (t.v > 0 ? 'verif' : 'rumor') : t.st) : w[2] > 0 ? (t.v > 0 ? 'verif' : 'alert') : 'lapor'
  return { k: w[1], a: w[2], b: w[3], st }
}

export const STATUS: Record<string, { label: string; color: string; tip: string }> = {
  klb: { label: 'KLB', color: '#dc2626', tip: 'Ada alert/laporan berstatus KLB di unit ini pada rentang.' },
  verif: { label: 'Terverifikasi', color: '#ea580c', tip: 'IBS: alert sudah diverifikasi. EBS: rumor terverifikasi.' },
  alert: { label: 'Alert belum diverifikasi', color: '#f59e0b', tip: 'IBS: ada alert yang belum diverifikasi.' },
  rumor: { label: 'Rumor / dalam investigasi', color: '#2563eb', tip: 'EBS: laporan belum terverifikasi atau masih dalam investigasi.' },
  lapor: { label: 'Laporan tanpa alert', color: '#0f766e', tip: 'IBS: unit melapor tanpa alert pada rentang.' },
  discarded: { label: 'Discarded', color: '#94a3b8', tip: 'EBS: seluruh laporan unit ini berstatus discarded.' },
}
export const STATUS_ORDER = ['klb', 'verif', 'alert', 'rumor', 'lapor', 'discarded']
export function statusFor(src: string): string[] { return src === 'ebs' ? ['klb', 'verif', 'rumor', 'discarded'] : src === 'ibs' ? ['klb', 'verif', 'alert', 'lapor'] : STATUS_ORDER }

export const DEFAULT_CHORO: ChoroConfig = { mode: 'quantile', zeroColor: '#E3ECEA', colors: ['#B9DDD6', '#7CC4B8', '#3A9E90', '#0F6E64'], quantiles: [0.25, 0.5, 0.75] }
export const NA_COLOR = '#e5e7eb'
export type MapClass = { min: number; max: number | null; label: string; color: string; na?: boolean }
const CHG: MapClass[] = [
  { min: -Infinity, max: -50, label: '≤ −50%', color: '#1d4ed8' }, { min: -50, max: -10, label: '−50 s.d. −10%', color: '#93c5fd' },
  { min: -10, max: 10, label: '±10% (stabil)', color: '#f1f5f9' }, { min: 10, max: 50, label: '+10 s.d. +50%', color: '#fca5a5' },
  { min: 50, max: null, label: '≥ +50%', color: '#dc2626' },
]
const CFR: MapClass[] = [
  { min: 0, max: 0, label: '0%', color: '#E3ECEA' }, { min: 0.0001, max: 1, label: '> 0–1%', color: '#fde68a' }, { min: 1.0001, max: 5, label: '> 1–5%', color: '#f59e0b' },
  { min: 5.0001, max: 10, label: '> 5–10%', color: '#dc2626' }, { min: 10.0001, max: null, label: '> 10%', color: '#7f1d1d' },
]

/** Classes for the displayed metric. Counts: quartile classes from app_settings.map_choropleth (recomputed per map). */
export function classesFor(metric: Metric, values: (number | null)[], cfg: ChoroConfig | null): MapClass[] {
  if (metric === 'chg_minggu') return CHG
  if (metric === 'cfr') return CFR
  return (buildChoroClasses(cfg || DEFAULT_CHORO, values.map((v) => v || 0)) || []) as ChoroClass[]
}
export function classOf(v: number | null | undefined, cls: MapClass[], metric: Metric): MapClass {
  if (v === null || v === undefined || !Number.isFinite(v)) return { min: 0, max: 0, label: metric === 'chg_minggu' ? 'Tidak ada pembanding' : 'Tidak ada kasus', color: NA_COLOR, na: true }
  const x = metric === 'chg_minggu' || metric === 'cfr' ? v : Math.max(0, Math.round(v))
  if (metric === 'chg_minggu') return cls.find((c) => (c.max === null || x < c.max) && x >= c.min) || cls[cls.length - 1]
  return cls.find((c) => x >= c.min && (c.max === null || x <= c.max)) || cls[cls.length - 1]
}

/** Value of an area for a metric, for the whole range (wi < 0) or one week of the range. */
export function areaVal(a: Area, metric: Metric, wi: number): number | null {
  if (wi < 0 || !a.seri) {
    if (metric === 'cfr') return a.kasus > 0 ? a.cfr : null
    return (a as any)[metric] ?? null
  }
  const s = a.seri
  if (metric === 'cfr') return s.k[wi] > 0 ? Math.round((s.m[wi] * 1000) / s.k[wi]) / 10 : null
  if (metric === 'chg_minggu') { const p = wi > 0 ? s.k[wi - 1] : null; return p ? Math.round(((s.k[wi] - p) * 1000) / p) / 10 : null }
  const key = METRICS.find((m) => m.key === metric)?.seri
  return key ? s[key][wi] : null
}
export const fmtPct = (v: number | null | undefined, sign = false) => (v === null || v === undefined ? '–' : `${sign && v > 0 ? '+' : ''}${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`)

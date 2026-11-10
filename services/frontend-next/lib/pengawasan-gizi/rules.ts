// PR 033: aturan penilaian Formulir 1–13 — cermin services/backend-rust/src/pengawasan_gizi.rs (server tetap penentu saat Kirim).
import type { Data, Issue } from '@/lib/laporan/engine'
import { CEK_NASKAH, type CekNaskah } from './naskah'

export const SESUAI = 'Sesuai'
export const TIDAK = 'Tidak Sesuai'
export const AMBANG_SKOR = 80
export const SAMPEL = 5
export const BATAS_SISA = 20
export const F2_A = 7
export const F2_B = 8
export const F2_BUKTI = ['undangan', 'notulen', 'hadir']

export interface Eval {
  errors: Issue[]; warnings: Issue[]; skor: number | null; kesimpulan: string | null; hasil: Record<string, any>
}
export type Source = { form_no: number; status: string | null; kesimpulan: string | null }

const str = (d: Data, k: string): string | null => {
  const v = d[k]
  if (typeof v === 'string') return v.trim() ? v.trim() : null
  if (typeof v === 'number') return String(v)
  return null
}
export const numOf = (v: any): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) { const x = Number(v.trim().replace(',', '.')); return Number.isFinite(x) ? x : null }
  return null
}
export const has = (d: Data, k: string) => {
  const v = d[k]
  return !(v === undefined || v === null || (typeof v === 'string' && !v.trim()))
}
const round1 = (x: number) => Math.round(x * 10) / 10

class Iss {
  errors: Issue[] = []
  warnings: Issue[] = []
  constructor(private d: Data) {}
  e(step: string, key: string, msg: string) { this.errors.push({ step, key, msg }) }
  w(step: string, key: string, msg: string) { this.warnings.push({ step, key, msg }) }
  req(step: string, key: string, label: string) { if (!has(this.d, key)) { this.e(step, key, `${label} wajib diisi`); return false } return true }
  count(step: string, key: string, label: string, required: boolean): number | null {
    if (!has(this.d, key)) { if (required) this.e(step, key, `${label} wajib diisi (isi 0 bila tidak ada)`); return null }
    const x = numOf(this.d[key])
    if (x === null || x < 0 || !Number.isInteger(x)) { this.e(step, key, `${label} harus bilangan bulat ≥ 0`); return null }
    return x
  }
  choice(step: string, key: string, label: string, allowed: string[]): string | null {
    const v = str(this.d, key)
    if (v === null) { this.e(step, key, `${label} belum dinilai`); return null }
    if (!allowed.includes(v)) { this.e(step, key, `${label}: pilihan tidak valid`); return null }
    return v
  }
  maxLen(step: string, key: string, label: string, max: number) {
    const v = str(this.d, key)
    if (v && [...v].length > max) this.e(step, key, `${label} maksimal ${max} karakter`)
  }
}

// ─── identitas ────────────────────────────────────────────────────────────────
export function validateIdentitas(d: Data, today: string): { errors: Issue[]; warnings: Issue[] } {
  const i = new Iss(d)
  i.req('s1', 'nama_tpg', 'Nama TPG')
  i.req('s1', 'provinsi_id', 'Provinsi')
  i.req('s1', 'kabkota_id', 'Kab/Kota')
  i.req('s1', 'unit_pelapor', 'Puskesmas')
  i.req('s2', 'nama_sppg', 'Nama SPPG')
  i.req('s2', 'nama_pengawas', 'Nama Pengawas Gizi')
  if (i.req('s2', 'tanggal', 'Hari/Tanggal')) {
    const t = String(d.tanggal)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) i.e('s2', 'tanggal', 'Format tanggal tidak valid')
    else if (t > today) i.e('s2', 'tanggal', 'Hari/Tanggal kunjungan tidak boleh di masa depan')
  }
  ;([['nama_tpg', 'Nama TPG'], ['nama_sppg', 'Nama SPPG'], ['nama_pengawas', 'Nama Pengawas Gizi']] as const).forEach(([k, l]) => i.maxLen(k === 'nama_tpg' ? 's1' : 's2', k, l, 200))
  return { errors: i.errors, warnings: i.warnings }
}

// ─── checklist ────────────────────────────────────────────────────────────────
/** daya terima butir 3–7: Sesuai bila ≥ 3 dari 5 sampel sisa < 20% (hanya bila 5 sampel terisi) */
export function sisaItem(d: Data, item: number): { val: string | null; bad: string[]; filled: number; lt: number; rata: number | null } {
  const bad: string[] = []
  let filled = 0, lt = 0, sum = 0
  for (let x = 1; x <= SAMPEL; x++) {
    const k = `sisa_i${item}_${x}`
    if (!has(d, k)) continue
    const v = numOf(d[k])
    if (v === null || v < 0 || v > 100) { bad.push(k); continue }
    filled++; sum += v
    if (v < BATAS_SISA) lt++
  }
  const val = filled === SAMPEL && !bad.length ? (lt >= 3 ? SESUAI : TIDAK) : null
  return { val, bad, filled, lt, rata: filled ? round1(sum / filled) : null }
}

function skorKes(sesuai: number, dinilai: number, total: number): [number | null, string | null] {
  if (!total) return [null, null]
  const skor = round1((sesuai / total) * 100)
  if (dinilai < total) return [skor, null]
  return [skor, skor >= AMBANG_SKOR ? SESUAI : TIDAK]
}
function rekomendasi(i: Iss, d: Data, perlu: boolean, prefix: string, msg: string) {
  for (let x = 1; x <= 4; x++) i.maxLen('kes', `${prefix}${x}`, `Rekomendasi ${x}`, 500)
  if (perlu && !has(d, `${prefix}1`)) i.e('kes', `${prefix}1`, msg)
}

export function validateCek(spec: CekNaskah, d: Data): Eval {
  const i = new Iss(d)
  ;(spec.header || []).forEach((h) => { i.req('dok', h.key, h.label); i.maxLen('dok', h.key, h.label, 200) })
  let total = 0, sesuai = 0, dinilai = 0
  const tidak: number[] = []
  const nilai: Record<string, string> = {}
  spec.komponen.forEach((g) => g.items.forEach(({ k }) => {
    total++
    const key = `i${k}`
    let v: string | null
    if (spec.sisa && k >= 3) {
      const r = sisaItem(d, k)
      if (r.bad.length) i.e(g.step, key, `Item ${k}: persentase sisa makanan harus 0–100`)
      else if (!r.val) i.e(g.step, key, `Item ${k}: isi persentase sisa makanan ${SAMPEL} sampel (${r.filled}/${SAMPEL} terisi)`)
      v = r.val
    } else {
      v = i.choice(g.step, key, `Item ${k}`, [SESUAI, TIDAK])
      if (v === TIDAK && !has(d, `${key}_ket`)) i.e(g.step, `${key}_ket`, `Item ${k}: Keterangan wajib diisi bila Tidak Sesuai`)
    }
    i.maxLen(g.step, `${key}_ket`, `Keterangan item ${k}`, 500)
    if (v) { dinilai++; if (v === SESUAI) sesuai++; else tidak.push(k); nilai[key] = v }
  }))
  const [skor, kes] = skorKes(sesuai, dinilai, total)
  rekomendasi(i, d, tidak.length > 0, 'rek', 'Rekomendasi 1 wajib diisi bila ada item Tidak Sesuai')
  if (spec.alergi && i.choice('kes', 'alergi', 'Pertanyaan sasaran alergi makanan', ['Ya', 'Tidak']) === 'Ya') i.req('kes', 'alergi_detail', 'Jenis alergi & penanganannya')
  return { errors: i.errors, warnings: i.warnings, skor, kesimpulan: kes, hasil: { total, dinilai, sesuai, tidak_sesuai: tidak, nilai } }
}

// ─── F9 ───────────────────────────────────────────────────────────────────────
export const F9_ITEMS = 6
export interface Sasaran { id: string; nama: string }
export const sasaranOf = (d: Data): Sasaran[] => (Array.isArray(d.sasaran) ? d.sasaran : []).map((x: any) => ({ id: String(x?.id ?? ''), nama: String(x?.nama ?? '').trim() }))
export function f9Item(d: Data, k: number): string | null {
  const sas = sasaranOf(d)
  if (!sas.length) return null
  let all = true, anyTidak = false
  sas.forEach((s) => { const v = d[`i${k}_${s.id}`]; if (v === TIDAK) anyTidak = true; else if (v !== SESUAI) all = false })
  return all ? (anyTidak ? TIDAK : SESUAI) : null
}
export function validateF9(d: Data): Eval {
  const i = new Iss(d)
  const sas = sasaranOf(d)
  if (!sas.length) i.e('sas', 'sasaran', 'Tambahkan minimal 1 kelompok sasaran')
  const seen = new Set<string>()
  sas.forEach((s, x) => {
    if (!s.id || !s.nama) i.e('sas', 'sasaran', `Kelompok sasaran ke-${x + 1} belum dipilih`)
    else if (seen.has(s.nama.toLowerCase())) i.w('sas', 'sasaran', `Kelompok sasaran "${s.nama}" dipilih lebih dari sekali`)
    else seen.add(s.nama.toLowerCase())
  })
  let sesuai = 0, dinilai = 0, selS = 0, selT = 0
  const tidak: number[] = []
  const nilai: Record<string, string> = {}
  for (let k = 1; k <= F9_ITEMS; k++) {
    const step = k === 1 ? 'kA' : 'kB'
    const key = `i${k}`
    i.maxLen(step, `${key}_ket`, `Keterangan item ${k}`, 500)
    sas.forEach((s) => { selT++; if (d[`i${k}_${s.id}`] === SESUAI) selS++ })
    const v = f9Item(d, k)
    if (!v) { if (sas.length) i.e(step, key, `Item ${k}: nilai untuk semua kelompok sasaran`); continue }
    dinilai++
    nilai[key] = v
    if (v === TIDAK) { tidak.push(k); if (!has(d, `${key}_ket`)) i.e(step, `${key}_ket`, `Item ${k}: Keterangan wajib diisi bila Tidak Sesuai`) } else sesuai++
  }
  const [skor, kes] = skorKes(sesuai, dinilai, F9_ITEMS)
  rekomendasi(i, d, tidak.length > 0, 'rek', 'Rekomendasi 1 wajib diisi bila ada item Tidak Sesuai')
  return { errors: i.errors, warnings: i.warnings, skor, kesimpulan: kes, hasil: { total: F9_ITEMS, dinilai, sesuai, tidak_sesuai: tidak, nilai, sasaran: sas.length, sel_sesuai: selS, sel_total: selT } }
}

// ─── F1 ───────────────────────────────────────────────────────────────────────
export function ambangPenjamah(tigaT: boolean, penerima: number | null): number {
  if (!tigaT || penerima === null) return 47
  if (penerima < 250) return 15
  if (penerima <= 500) return 18
  if (penerima <= 750) return 21
  if (penerima <= 999) return 25
  return 47
}
const sv = (x: boolean | null) => (x === null ? null : x ? SESUAI : TIDAK)
export function validateF1(d: Data): Eval {
  const i = new Iss(d)
  let kual = 0, a1ok = true
  for (let r = 1; r <= 7; r++) {
    const x = i.count('a1', `a1_r${r}`, `A.1 baris ${r}`, true)
    if (x === null) a1ok = false
    else if (r <= 6) kual += x
    else if (x > 0) i.req('a1', 'a1_r7_jenis', 'Jenis pendidikan Lainnya')
  }
  i.maxLen('a1', 'a1_r7_jenis', 'Jenis pendidikan Lainnya', 200)
  const a1 = a1ok ? kual >= 1 : null
  const p1 = i.choice('a2', 'a2_p1', 'A.2 Pelatihan standar gizi MBG', ['Belum', 'Sudah'])
  const p2 = i.choice('a2', 'a2_p2', 'A.2 Pelatihan penyelenggaraan makanan/keamanan pangan', ['Belum', 'Sudah'])
  for (let p = 1; p <= 2; p++) i.maxLen('a2', `a2_p${p}_sertifikat`, 'Nomor sertifikat/surat tugas', 200)
  const a2 = p1 && p2 ? p1 === 'Sudah' && p2 === 'Sudah' : null
  const a = a1 !== null && a2 !== null ? a1 && a2 : null
  let total = 0, b1ok = true
  for (let r = 1; r <= 5; r++) { const x = i.count('b1', `b1_r${r}`, `B.1 baris ${r}`, true); if (x === null) b1ok = false; else total += x }
  const tigaT = i.choice('b1', 'wilayah_3t', 'SPPG di wilayah 3T', ['Ya', 'Tidak'])
  const is3t = tigaT === 'Ya'
  const penerima = is3t ? i.count('b1', 'penerima', 'Jumlah penerima manfaat', true) : null
  const ambang = ambangPenjamah(is3t, penerima)
  const b1 = b1ok && tigaT !== null && (!is3t || penerima !== null) ? total >= ambang : null
  const rows: [number | null, number | null][] = []
  for (let r = 1; r <= 3; r++) rows.push([i.count('b2', `b2_p${r}_belum`, `B.2 baris ${r} — belum mengikuti`, true), i.count('b2', `b2_p${r}_sudah`, `B.2 baris ${r} — sudah mengikuti`, true)])
  for (let r = 1; r <= 5; r++) {
    if (has(d, `b2_l${r}_nama`)) {
      i.count('b2', `b2_l${r}_belum`, `Pelatihan lain ${r} — belum mengikuti`, true)
      i.count('b2', `b2_l${r}_sudah`, `Pelatihan lain ${r} — sudah mengikuti`, true)
      i.maxLen('b2', `b2_l${r}_nama`, `Nama pelatihan lain ${r}`, 200)
    }
  }
  const [be1, su1] = rows[0]
  const denom = b1ok && total > 0 ? total : be1 !== null && su1 !== null ? be1 + su1 : null
  const b2 = su1 !== null && denom !== null ? (denom > 0 ? su1 * 2 >= denom : false) : null
  if (su1 !== null && b1ok && su1 > total) i.e('b2', 'b2_p1_sudah', 'Jumlah yang sudah mengikuti melebihi total penjamah makanan (B.1)')
  rows.forEach(([be, su], r) => {
    if (be !== null && su !== null && b1ok && total > 0 && be + su !== total) i.w('b2', `b2_p${r + 1}_sudah`, `B.2 baris ${r + 1}: belum + sudah (${be + su}) ≠ total penjamah B.1 (${total})`)
  })
  rekomendasi(i, d, a === false, 'rekA', 'Rekomendasi A wajib diisi bila Kesimpulan Pengawas Gizi Tidak Sesuai')
  rekomendasi(i, d, b1 === false || b2 === false, 'rekB', 'Rekomendasi B wajib diisi bila B.1/B.2 Tidak Sesuai')
  const kes = a !== null && b1 !== null && b2 !== null ? (a && b1 && b2 ? SESUAI : TIDAK) : null
  return { errors: i.errors, warnings: i.warnings, skor: null, kesimpulan: kes,
    hasil: { a1: sv(a1), a2: sv(a2), a: sv(a), b1: sv(b1), b2: sv(b2), total_penjamah: b1ok ? total : null, ambang, kualifikasi: kual, denom } }
}

// ─── F2 ───────────────────────────────────────────────────────────────────────
export function f2Saran(d: Data, r: number): string | null {
  const s = d[`b${r}_sos`]
  if (s === 'Sudah') return F2_BUKTI.every((b) => d[`b${r}_${b}`] === true) ? SESUAI : TIDAK
  if (s === 'Belum') return TIDAK
  return null
}
export function validateF2(d: Data): Eval {
  const i = new Iss(d)
  let ok = 0, done = 0
  const tA: number[] = [], tB: number[] = []
  for (let r = 1; r <= F2_A; r++) {
    const v = i.choice('a', `a${r}`, `A.${r} Ketersediaan SOP`, [SESUAI, TIDAK])
    if (v === TIDAK && !has(d, `a${r}_ket`)) i.e('a', `a${r}_ket`, `A.${r}: Keterangan wajib diisi bila Tidak Sesuai`)
    i.maxLen('a', `a${r}_ket`, `Keterangan A.${r}`, 500)
    if (v) { done++; if (v === SESUAI) ok++; else tA.push(r) }
  }
  for (let r = 1; r <= F2_B; r++) {
    i.choice('b', `b${r}_sos`, `B.${r} Sosialisasi`, ['Sudah', 'Belum'])
    const v = i.choice('b', `b${r}`, `B.${r} Kesesuaian`, [SESUAI, TIDAK])
    i.maxLen('b', `b${r}_ket`, `Keterangan B.${r}`, 500)
    const saran = f2Saran(d, r)
    if (v === SESUAI && saran === TIDAK) i.w('b', `b${r}`, `B.${r} dinilai Sesuai padahal belum sosialisasi / bukti dokumen belum lengkap`)
    if (v) { done++; if (v === SESUAI) ok++; else tB.push(r) }
  }
  const total = F2_A + F2_B
  const kes = done === total ? (ok === total ? SESUAI : TIDAK) : null
  rekomendasi(i, d, tA.length + tB.length > 0, 'rek', 'Rekomendasi wajib diisi: tuliskan SOP yang belum ada/belum disosialisasikan')
  return { errors: i.errors, warnings: i.warnings, skor: null, kesimpulan: kes, hasil: { total, dinilai: done, sesuai: ok, tidak_a: tA, tidak_b: tB } }
}

// ─── F12 / F13 ────────────────────────────────────────────────────────────────
export function validateRekap(no: 12 | 13, d: Data, sources: Source[]): Eval {
  const i = new Iss(d)
  const range = no === 12 ? [3, 4, 5, 6, 7, 8, 9] : [10, 11]
  let ok = 0, ready = true
  const rows = range.map((f) => {
    const src = sources.find((x) => x.form_no === f)
    const status = src?.status ?? null
    const kes = src?.kesimpulan ?? null
    if (status !== 'dikirim' || !kes) { ready = false; i.e('rekap', `f${f}`, `Formulir ${f} belum dikirim (${status === 'draf' ? 'masih draf' : 'belum diisi'})`) }
    else if (kes === SESUAI) ok++
    return { form_no: f, status, kesimpulan: kes }
  })
  range.forEach((f) => i.maxLen('rekap', `ket${f}`, `Keterangan Formulir ${f}`, 500))
  i.maxLen('rekap', 'catatan', 'Catatan', 1000)
  const kes = ready ? (ok === range.length ? 'BAIK' : 'BELUM BAIK') : null
  return { errors: i.errors, warnings: i.warnings, skor: null, kesimpulan: kes, hasil: { total: range.length, sesuai: ok, sumber: rows } }
}

export function evaluateForm(no: number, d: Data, sources: Source[]): Eval {
  if (no === 1) return validateF1(d)
  if (no === 2) return validateF2(d)
  if (no === 9) return validateF9(d)
  if (no === 12 || no === 13) return validateRekap(no, d, sources)
  const spec = CEK_NASKAH.find((c) => c.no === no)
  return spec ? validateCek(spec, d) : { errors: [], warnings: [], skor: null, kesimpulan: null, hasil: {} }
}

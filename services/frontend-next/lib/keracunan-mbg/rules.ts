// PR 034: aturan Keracunan Pangan MBG — cermin services/backend-rust/src/keracunan_mbg.rs (validate + hasil).
// Server tetap memvalidasi ulang; di sini untuk umpan balik langsung (attack rate, CFR, cek silang).
import type { Data, Issue } from '@/lib/laporan/engine'

export const GEJALA = [
  'Cynocis/Kebiruan', 'Demam', 'Diare', 'Gangguan Penglihatan', 'Gatal', 'Kemerahan pada wajah', 'Lemah', 'Menggigil', 'Mual', 'Muntah',
  'Nyeri Tenggorok', 'Perut Kembung', 'Perut Melilit', 'Pingsan', 'Pusing', 'Sakit Kepala', 'Sakit Perut', 'Sesak Napas',
]
export const SOP = [
  'Pemorsian makanan', 'Pendistribusian makanan', 'Penerimaan bahan baku', 'Pengolahan makanan', 'Penyiapan bahan baku', 'Penyimpanan bahan baku',
  'Penyimpanan/pendinginan makanan', 'SOP Distribusi Makanan Ke Lokasi Sasaran', 'SOP Higiene dan Pemeriksaan Kesehatan Personal', 'SOP Keselamatan kerja',
  'SOP Pemeliharaan Peralatan dan Bangunan', 'SOP Pemorsian makanan sesuai dengan kelompok sasaran', 'SOP Penanganan Limbah',
  'SOP Penanggulangan KLB keracunan pangan di puskesmas', 'SOP Penerimaan dan pemeriksaan bahan pangan',
  'SOP Pengendalian Serangga, Hewan Pengerat, dan Hewan Peliharaan', 'SOP Penggunaan loker', 'SOP Pengolahan', 'SOP Penyimpanan bahan pangan dan ingredient',
  'SOP penyimpanan kemasan dan bahan kimia', 'SOP Penyimpanan makanan dan sampel makanan', 'SOP Persiapan Bahan Pangan', 'SOP Sanitasi Fasilitas dan Ruangan.',
  'SOP Sanitasi Peralatan', 'SOP Standar Gizi', 'SOP Tindakan Apabila Terjadi Keracunan Makanan',
]
export const SUMBER_AIR = ['Air Isi Ulang', 'Mata Air', 'PDAM', 'Penampungan Air Hujan', 'Sumur Bor', 'Sumur gali']
export const SAMPEL_KATEGORI = ['Air', 'Feses', 'Muntahan', 'Pangan', 'Swab/Usap']
export const HASIL_LAB = ['Positif', 'Negatif', 'Belum']
const YA_TIDAK = ['Ya', 'Tidak']
export const PETUGAS: [string, string][] = [
  ['pt_kepala', 'Kepala SPPG'], ['pt_ahli_gizi', 'Ahli gizi'], ['pt_akuntan', 'Akuntan'], ['pt_asisten', 'Asisten lapangan'], ['pt_masak', 'Petugas memasak'],
  ['pt_porsi', 'Petugas pemorsian'], ['pt_sopir', 'Sopir/distribusi'], ['pt_cuci', 'Petugas pencucian'], ['pt_security', 'Keamanan'],
]
export const USIA: [string, string][] = [['usia_lt5', '< 5 th'], ['usia_5_9', '5–9 th'], ['usia_10_14', '10–14 th'], ['usia_15_19', '15–19 th'], ['usia_gt19', '> 19 th']]
const TEXT_200: [string, string, string][] = [
  ['s1', 'pelapor_nama', 'Petugas pelapor'], ['s1', 'pelapor_email', 'Email pelapor'], ['s1', 'desa', 'Desa'], ['s1', 'nama_sppg', 'SPPG'],
  ['s1', 'yayasan_sppg', 'Yayasan SPPG'], ['s1', 'kode_sppg', 'Kode SPPG'], ['s3', 'menu_karbo', 'Karbohidrat'], ['s3', 'menu_protein1', 'Protein 1'],
  ['s3', 'menu_protein2', 'Protein 2'], ['s3', 'menu_sayur', 'Sayur'], ['s3', 'menu_buah', 'Buah'], ['s3', 'faskes', 'Faskes penanganan kasus'],
  ['s4', 'angkut_lain', 'Kendaraan lain'], ['s5', 'lab_nama', 'Laboratorium'],
]
const TEXT_500: [string, string, string][] = [
  ['s3', 'diagnosa_banding', 'Diagnosa banding'], ['s4', 'bangunan_gambar', 'Gambar umum'], ['s4', 'bangunan_tata_letak', 'Tata letak'],
  ['s4', 'cuci_tempat', 'Tempat pencucian peralatan'], ['s4', 'cuci_proses', 'Proses pencucian peralatan'], ['s4', 'cuci_pengeringan', 'Pengeringan peralatan'],
  ['s4', 'penjamah_kesehatan', 'Kondisi kesehatan penjamah'], ['s4', 'penjamah_pemeriksaan', 'Pemeriksaan kesehatan rutin penjamah'],
  ['s4', 'penjamah_apd', 'Kepatuhan penggunaan APD'], ['s4', 'bahan_supplier', 'Supplier bahan pangan'], ['s4', 'bahan_kondisi', 'Kondisi bahan pangan'],
  ['s4', 'simpan_jenis', 'Jenis bahan pangan yang disimpan'], ['s4', 'simpan_pemisahan', 'Pemisahan penyimpanan'], ['s4', 'simpan_keadaan', 'Keadaan tempat penyimpanan'],
  ['s4', 'simpan_wadah', 'Wadah bahan pangan'], ['s4', 'angkut_kebersihan', 'Kondisi kebersihan alat pengangkutan'],
  ['s4', 'angkut_frekuensi', 'Frekuensi pembersihan alat pengangkutan'], ['s4', 'cara_olah', 'Cara pengolahan'], ['s4', 'sampah_jarak', 'Jarak tempat sampah'],
  ['s4', 'saluran_limbah', 'Keadaan saluran limbah'], ['s4', 'limbah_meningkat', 'Limbah sisa makanan pada hari kejadian'],
  ['s4', 'aduan_kondisi', 'Kondisi pangan yang tidak sesuai'], ['s4', 'aduan_alur', 'Alur pengaduan'], ['s4', 'aduan_kompensasi', 'Kompensasi'],
  ['s6', 'catatan', 'Catatan'],
]
const YA_TIDAK_KEYS: [string, string][] = [
  ['slhs', 'Sertifikasi SLHS-SPPG'], ['angkut_box_sekat', 'Mobil box dengan sekat'], ['angkut_box_tanpa', 'Mobil box tanpa sekat'], ['angkut_motor', 'Motor'],
  ['angkut_lain_status', 'Status kendaraan lain'], ['bank_sampel', 'Bank sampel makanan'], ['limbah_pencatatan', 'Pencatatan limbah sisa makanan harian'],
  ['aduan_hari_h', 'Pengaduan dari sekolah pada hari H'],
]

// ─── helpers (same semantics as the Rust side) ───────────────────────────────
const str = (o: Data, k: string): string | null => {
  const v = o?.[k]
  if (typeof v === 'string') return v.trim() ? v.trim() : null
  if (typeof v === 'number') return String(v)
  return null
}
const numOf = (v: any): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) { const n = Number(v.trim().replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}
const filledV = (v: any) => !(v === undefined || v === null || (typeof v === 'string' && !v.trim()))
const filled = (o: Data, k: string) => filledV(o?.[k])
export const cnt = (o: Data, k: string): number | null => { const n = numOf(o?.[k]); return n !== null && n >= 0 && Number.isInteger(n) ? n : null }
export const rows = (d: Data, k: string): Data[] => (Array.isArray(d[k]) ? d[k].filter((x: any) => x && typeof x === 'object') : [])
const round1 = (x: number) => Math.round(x * 10) / 10
/** "YYYY-MM-DDTHH:MM" (± detik, spasi) atau "YYYY-MM-DD" → menit sejak epoch (naif, tanpa zona) */
export function parseDt(x: any): number | null {
  if (typeof x !== 'string') return null
  const m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return null
  const [y, mo, d, h = '0', mi = '0'] = m.slice(1)
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi)
  const back = new Date(t)
  if (back.getUTCMonth() !== +mo - 1 || back.getUTCDate() !== +d || +h > 23 || +mi > 59) return null
  return t / 60000
}
const dt = (d: Data, k: string) => parseDt(d[k])

class Iss {
  errors: Issue[] = []
  warnings: Issue[] = []
  e(step: string, key: string, msg: string) { this.errors.push({ step, key, msg }) }
  w(step: string, key: string, msg: string) { this.warnings.push({ step, key, msg }) }
  req(d: Data, step: string, key: string, label: string) { if (!filled(d, key)) { this.e(step, key, `${label} wajib diisi`); return false } return true }
  count(d: Data, step: string, key: string, label: string, required: boolean): number | null {
    if (!filled(d, key)) { if (required) this.e(step, key, `${label} wajib diisi (isi 0 bila tidak ada)`); return null }
    const c = cnt(d, key)
    if (c === null) this.e(step, key, `${label} harus bilangan bulat ≥ 0`)
    return c
  }
  dec(d: Data, step: string, key: string, label: string, min: number, max: number): number | null {
    if (!filled(d, key)) return null
    const n = numOf(d[key])
    if (n !== null && n >= min && n <= max) return n
    this.e(step, key, `${label} harus angka ${min}–${max}`)
    return null
  }
  choice(d: Data, step: string, key: string, label: string, allowed: string[]) {
    const v = str(d, key)
    if (v !== null && !allowed.includes(v)) this.e(step, key, `${label}: pilihan tidak valid`)
  }
  maxLen(d: Data, step: string, key: string, label: string, max: number) {
    const v = str(d, key)
    if (v !== null && [...v].length > max) this.e(step, key, `${label} maksimal ${max} karakter`)
  }
  datetime(d: Data, step: string, key: string, label: string, today: string): number | null {
    if (!filled(d, key)) return null
    const t = dt(d, key)
    if (t === null) { this.e(step, key, `${label}: format tanggal/jam tidak valid`); return null }
    if (String(d[key]).slice(0, 10) > today) { this.e(step, key, `${label} tidak boleh di masa depan`); return null }
    return t
  }
}

// ─── hasil (dihitung otomatis) ───────────────────────────────────────────────
export interface Hasil {
  kasus: number | null; meninggal: number | null; terpapar: number | null; terpapar_sumber: 'isian' | 'porsi' | null
  ar: number | null; cfr: number | null; inkubasi_saran: number | null; total_petugas: number | null; pct_penjamah: number | null
  lab_status: 'belum' | 'dikirim' | 'hasil'; sekolah: number
}
export function totalPorsi(d: Data): number | null {
  const v = rows(d, 'sekolah').map((o) => cnt(o, 'porsi')).filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}
export function labStatus(d: Data): Hasil['lab_status'] {
  const s = rows(d, 'sampel')
  const any = s.some((o) => ['mikro', 'kimia'].some((k) => ['Positif', 'Negatif'].includes(str(o, k) || '')))
  if (filled(d, 'lab_tgl_hasil') || any) return 'hasil'
  if (filled(d, 'lab_tgl_kirim') || filled(d, 'lab_tgl_ambil') || s.length) return 'dikirim'
  return 'belum'
}
export function hasil(d: Data): Hasil {
  const kasus = cnt(d, 'jumlah_kasus')
  const meninggal = cnt(d, 'jumlah_meninggal')
  const isian = cnt(d, 'jumlah_terpapar')
  const porsi = totalPorsi(d)
  const terpapar = isian ?? porsi
  const sumber = isian !== null ? 'isian' : porsi !== null ? 'porsi' : null
  const ar = kasus !== null && terpapar !== null && terpapar > 0 && kasus <= terpapar ? round1((kasus / terpapar) * 100) : null
  const cfr = kasus !== null && meninggal !== null && kasus > 0 && meninggal <= kasus ? round1((meninggal / kasus) * 100) : null
  const a = dt(d, 'jam_makan'), b = dt(d, 'jam_gejala')
  const ink = a !== null && b !== null && b >= a ? round1((b - a) / 60) : null
  const pt = PETUGAS.map(([k]) => cnt(d, k)).filter((x): x is number => x !== null)
  const pj = cnt(d, 'penjamah_total'), ps = cnt(d, 'penjamah_sertifikasi')
  return {
    kasus, meninggal, terpapar, terpapar_sumber: sumber, ar, cfr, inkubasi_saran: ink,
    total_petugas: pt.length ? pt.reduce((x, y) => x + y, 0) : null,
    pct_penjamah: pj !== null && ps !== null && pj > 0 && ps <= pj ? round1((ps / pj) * 100) : null,
    lab_status: labStatus(d), sekolah: rows(d, 'sekolah').length,
  }
}

// ─── validasi ────────────────────────────────────────────────────────────────
function s1(i: Iss, d: Data, today: string): [number | null, number | null] {
  if (i.req(d, 's1', 'tgl_kejadian', 'Tanggal kejadian')) i.datetime(d, 's1', 'tgl_kejadian', 'Tanggal kejadian', today)
  const makan = i.datetime(d, 's1', 'jam_makan', 'Tanggal & jam makan', today)
  const gejala = i.datetime(d, 's1', 'jam_gejala', 'Tanggal & jam mulai bergejala', today)
  if (makan !== null && gejala !== null) {
    if (gejala < makan) i.e('s1', 'jam_gejala', 'Jam mulai bergejala harus sesudah jam makan')
    else if (gejala - makan > 14 * 24 * 60 + 59) i.w('s1', 'jam_gejala', 'Selang makan → gejala lebih dari 14 hari; periksa kembali tanggalnya')
  }
  i.req(d, 's1', 'provinsi_id', 'Provinsi')
  if (filled(d, 'provinsi_id') && !filled(d, 'kabkota_id')) i.w('s1', 'kabkota_id', 'Kab/Kota belum diisi')
  const hp = str(d, 'pelapor_hp')
  if (hp !== null) {
    const core = hp.replace(/[ \-.()]/g, '').replace(/^\++/, '')
    if (!/^\d{8,15}$/.test(core)) i.e('s1', 'pelapor_hp', 'Nomor HP pelapor tidak valid')
  }
  const m = str(d, 'pelapor_email')
  if (m !== null && (!m.includes('@') || m.startsWith('@') || m.endsWith('@') || m.includes(' '))) i.e('s1', 'pelapor_email', 'Email pelapor tidak valid')
  const seen = new Set<string>()
  rows(d, 'sekolah').forEach((o, n) => {
    const x = n + 1
    const nm = str(o, 'nama')
    if (nm === null) i.e('s1', 'sekolah', `Sekolah ke-${x}: nama sekolah wajib diisi`)
    else {
      if ([...nm].length > 200) i.e('s1', 'sekolah', `Sekolah ke-${x}: nama maksimal 200 karakter`)
      const low = nm.toLowerCase()
      if (seen.has(low)) i.w('s1', 'sekolah', `Sekolah "${nm}" tercatat lebih dari sekali`)
      seen.add(low)
    }
    ;([['siswa', 'jumlah siswa'], ['porsi', 'jumlah porsi']] as const).forEach(([k, l]) => { if (filled(o, k) && cnt(o, k) === null) i.e('s1', 'sekolah', `Sekolah ke-${x}: ${l} harus bilangan bulat ≥ 0`) })
    const a = cnt(o, 'siswa'), b = cnt(o, 'porsi')
    if (a !== null && b !== null && b > a && a > 0) i.w('s1', 'sekolah', `Sekolah ke-${x}: jumlah porsi (${b}) melebihi jumlah siswa (${a})`)
    ;['uks', 'organoleptik', 'ctps'].forEach((k) => { const v = str(o, k); if (v !== null && !YA_TIDAK.includes(v)) i.e('s1', 'sekolah', `Sekolah ke-${x}: pilihan ${k} tidak valid`) })
  })
  const kasus = i.count(d, 's1', 'jumlah_kasus', 'Jumlah kasus', true)
  const mati = i.count(d, 's1', 'jumlah_meninggal', 'Jumlah meninggal', true)
  if (kasus !== null && mati !== null && mati > kasus) i.e('s1', 'jumlah_meninggal', 'Jumlah meninggal tidak boleh melebihi jumlah kasus')
  if (kasus === 0) i.w('s1', 'jumlah_kasus', 'Jumlah kasus 0 — pastikan kejadian memang dilaporkan tanpa kasus')
  return [kasus, mati]
}

function s2(i: Iss, d: Data, kasus: number | null, mati: number | null) {
  const sub = (key: string, label: string) => {
    const v = i.count(d, 's2', key, label, false)
    if (v !== null && kasus !== null && v > kasus) i.e('s2', key, `${label} (${v}) melebihi jumlah kasus (${kasus})`)
    return v
  }
  const inap = sub('rawat_inap', 'Rawat inap'), jalan = sub('rawat_jalan', 'Rawat jalan'), sembuh = sub('sembuh', 'Sembuh/pulang')
  const pria = sub('pria', 'Jumlah pria'), wanita = sub('wanita', 'Jumlah wanita')
  const usia = USIA.map(([k]) => sub(k, ({ usia_lt5: 'Usia <5', usia_5_9: 'Usia 5-9', usia_10_14: 'Usia 10-14', usia_15_19: 'Usia 15-19', usia_gt19: 'Usia >19' } as Record<string, string>)[k]))
  ;([['ibu_hamil', 'Ibu hamil'], ['ibu_menyusui', 'Ibu menyusui'], ['balita', 'Balita']] as const).forEach(([k, l]) => sub(k, l))
  ;([['kloter', 'Kloter pengantaran'], ['jumlah_sekolah', 'Jumlah sekolah']] as const).forEach(([k, l]) => i.count(d, 's2', k, l, false))
  const nSek = rows(d, 'sekolah').length
  const js = cnt(d, 'jumlah_sekolah')
  if (js !== null && nSek > 0 && js !== nSek) i.w('s2', 'jumlah_sekolah', `Jumlah sekolah (${js}) berbeda dengan daftar sekolah (${nSek})`)
  const terpapar = i.count(d, 's2', 'jumlah_terpapar', 'Jumlah terpapar', false)
  if (kasus !== null) {
    const p = totalPorsi(d)
    if (terpapar !== null && terpapar < kasus) i.e('s2', 'jumlah_terpapar', `Jumlah terpapar (${terpapar}) tidak boleh kurang dari jumlah kasus (${kasus})`)
    else if (terpapar === null && p !== null && p < kasus) i.w('s2', 'jumlah_terpapar', `Total porsi sekolah (${p}) lebih kecil dari jumlah kasus (${kasus}) — isi Jumlah terpapar agar attack rate benar`)
    if (pria !== null || wanita !== null) { const t = (pria ?? 0) + (wanita ?? 0); if (t !== kasus) i.w('s2', 'pria', `Pria + wanita (${t}) ≠ jumlah kasus (${kasus})`) }
    if (usia.some((x) => x !== null)) { const t = usia.reduce<number>((a, x) => a + (x ?? 0), 0); if (t !== kasus) i.w('s2', 'usia_lt5', `Jumlah per kelompok umur (${t}) ≠ jumlah kasus (${kasus})`) }
    if (inap !== null || jalan !== null || sembuh !== null) {
      const t = (inap ?? 0) + (jalan ?? 0) + (sembuh ?? 0) + (mati ?? 0)
      if (t !== kasus) i.w('s2', 'rawat_inap', `Rawat inap + rawat jalan + sembuh + meninggal (${t}) ≠ jumlah kasus (${kasus})`)
    }
  }
  const gseen = new Set<string>()
  rows(d, 'gejala').forEach((o, n) => {
    const nm = str(o, 'nama')
    if (nm === null) i.e('s2', 'gejala', `Gejala ke-${n + 1}: nama gejala wajib dipilih`)
    else if ([...nm].length > 100) i.e('s2', 'gejala', `Gejala ke-${n + 1}: maksimal 100 karakter`)
    else if (gseen.has(nm.toLowerCase())) i.e('s2', 'gejala', `Gejala "${nm}" dipilih lebih dari sekali`)
    else if (!GEJALA.includes(nm)) i.w('s2', 'gejala', `Gejala "${nm}" di luar daftar SKDR Kemkes (gejala lain)`)
    if (nm !== null) gseen.add(nm.toLowerCase())
    const label = nm ?? `ke-${n + 1}`
    if (!filled(o, 'jumlah')) i.e('s2', 'gejala', `Gejala ${label}: jumlah kasus wajib diisi`)
    else {
      const v = cnt(o, 'jumlah')
      if (v === null) i.e('s2', 'gejala', `Gejala ${label}: jumlah harus bilangan bulat ≥ 0`)
      else if (kasus !== null && v > kasus) i.e('s2', 'gejala', `Gejala ${label}: jumlah (${v}) melebihi jumlah kasus (${kasus})`)
    }
  })
  const ink = ([['inkubasi_min', 'Inkubasi terpendek'], ['inkubasi_max', 'Inkubasi terpanjang'], ['inkubasi_rata', 'Inkubasi rata-rata'], ['inkubasi_median', 'Inkubasi median']] as const)
    .map(([k, l]) => i.dec(d, 's2', k, l, 0, 720))
  if (ink[0] !== null && ink[1] !== null && ink[0] > ink[1]) i.e('s2', 'inkubasi_min', 'Inkubasi terpendek tidak boleh lebih dari terpanjang')
  ;([[ink[2], 'inkubasi_rata', 'rata-rata'], [ink[3], 'inkubasi_median', 'median']] as const).forEach(([v, k, l]) => {
    if (v !== null && ((ink[0] !== null && v < ink[0]) || (ink[1] !== null && v > ink[1]))) i.e('s2', k, `Inkubasi ${l} harus di antara terpendek dan terpanjang`)
  })
}

function s4(i: Iss, d: Data) {
  i.choice(d, 's4', 'ikl', 'Hasil IKL', ['Memenuhi Syarat', 'Tidak Memenuhi Syarat'])
  YA_TIDAK_KEYS.forEach(([k, l]) => i.choice(d, 's4', k, l, YA_TIDAK))
  i.choice(d, 's4', 'sampah_tipe', 'Tipe tempat sampah', ['Terbuka', 'Tertutup'])
  i.choice(d, 's4', 'sampah_lokasi', 'Lokasi tempat penampungan sampah', ['di Dalam Gedung', 'di Luar Gedung'])
  PETUGAS.forEach(([k]) => i.count(d, 's4', k, 'Jumlah petugas', false))
  ;([['cuci_petugas', 'Jumlah petugas penjamah (pencucian)'], ['bahan_jumlah', 'Jumlah bahan pangan'], ['sampah_kapasitas', 'Kapasitas tempat sampah'], ['sampah_frekuensi', 'Frekuensi pengambilan sampah']] as const)
    .forEach(([k, l]) => i.count(d, 's4', k, l, false))
  const pj = i.count(d, 's4', 'penjamah_total', 'Total penjamah pangan', false)
  const ps = i.count(d, 's4', 'penjamah_sertifikasi', 'Penjamah tersertifikasi/terlatih', false)
  if (pj !== null && ps !== null && ps > pj) i.e('s4', 'penjamah_sertifikasi', 'Penjamah tersertifikasi tidak boleh melebihi total penjamah')
  i.dec(d, 's4', 'bahan_suhu', 'Suhu bahan pangan', -50, 150)
  i.dec(d, 's4', 'simpan_suhu', 'Suhu tempat penyimpanan', -50, 150)
  rows(d, 'sumber_air').forEach((o, n) => {
    const v = str(o, 'sumber')
    if (v === null) i.e('s4', 'sumber_air', `Sumber air ke-${n + 1}: jenis sumber wajib dipilih`)
    else if (!SUMBER_AIR.includes(v)) i.e('s4', 'sumber_air', `Sumber air ke-${n + 1}: pilihan tidak valid`)
    const kp = str(o, 'keperluan')
    if (kp !== null && [...kp].length > 200) i.e('s4', 'sumber_air', `Sumber air ke-${n + 1}: keperluan maksimal 200 karakter`)
  })
  rows(d, 'sop').forEach((o) => {
    const nm = str(o, 'nama') ?? ''
    if (!SOP.includes(nm)) { i.e('s4', 'sop', `SOP "${nm}" tidak dikenal`); return }
    const ada = str(o, 'ada'), lak = str(o, 'dilakukan')
    if ((ada !== null && !['Ada', 'Tidak Ada'].includes(ada)) || (lak !== null && !['Dilakukan', 'Tidak Dilakukan'].includes(lak))) i.e('s4', 'sop', `SOP "${nm}": pilihan tidak valid`)
    if (ada === 'Tidak Ada' && lak === 'Dilakukan') i.w('s4', 'sop', `SOP "${nm}": tercatat Tidak Ada tetapi Dilakukan`)
  })
  ;([['jadwal_olah', 'Jadwal pengolahan'], ['jadwal_porsi', 'Pemorsian'], ['jadwal_distribusi', 'Pendistribusian'], ['jadwal_saji', 'Penyajian']] as const).forEach(([key, label]) => {
    rows(d, key).forEach((o, n) => {
      if (filled(o, 'porsi') && cnt(o, 'porsi') === null) i.e('s4', key, `${label} baris ${n + 1}: jumlah porsi harus bilangan bulat ≥ 0`)
      ;['ket', 'rute', 'kendaraan', 'waktu'].forEach((k) => { const v = str(o, k); if (v !== null && [...v].length > 200) i.e('s4', key, `${label} baris ${n + 1}: isian maksimal 200 karakter`) })
      ;['organoleptik', 'himbauan'].forEach((k) => { const v = str(o, k); if (v !== null && !YA_TIDAK.includes(v)) i.e('s4', key, `${label} baris ${n + 1}: pilihan tidak valid`) })
    })
  })
}

function s5(i: Iss, d: Data, today: string) {
  const ambil = i.datetime(d, 's5', 'lab_tgl_ambil', 'Tanggal sampel diambil', today)
  const kirim = i.datetime(d, 's5', 'lab_tgl_kirim', 'Tanggal sampel dikirim', today)
  const keluar = i.datetime(d, 's5', 'lab_tgl_hasil', 'Tanggal keluar hasil', today)
  if (ambil !== null && kirim !== null && kirim < ambil) i.e('s5', 'lab_tgl_kirim', 'Tanggal dikirim ke lab tidak boleh sebelum tanggal sampel diambil')
  const base = kirim ?? ambil
  if (base !== null && keluar !== null && keluar < base) i.e('s5', 'lab_tgl_hasil', 'Tanggal keluar hasil tidak boleh sebelum sampel diambil/dikirim')
  const samples = rows(d, 'sampel')
  samples.forEach((o, n) => {
    const k = str(o, 'kategori')
    if (k === null) i.e('s5', 'sampel', `Sampel ke-${n + 1}: kategori wajib dipilih`)
    else if (!SAMPEL_KATEGORI.includes(k)) i.e('s5', 'sampel', `Sampel ke-${n + 1}: kategori tidak valid`)
    ;['mikro', 'kimia'].forEach((x) => { const v = str(o, x); if (v !== null && !HASIL_LAB.includes(v)) i.e('s5', 'sampel', `Sampel ke-${n + 1}: hasil ${x} tidak valid`) })
    ;['sampel', 'sumber'].forEach((x) => { const v = str(o, x); if (v !== null && [...v].length > 200) i.e('s5', 'sampel', `Sampel ke-${n + 1}: isian maksimal 200 karakter`) })
  })
  if (keluar !== null && !samples.length) i.w('s5', 'sampel', 'Tanggal hasil sudah diisi tetapi belum ada daftar sampel')
}

export function validate(d: Data, today: string): { errors: Issue[]; warnings: Issue[] } {
  const i = new Iss()
  const [kasus, mati] = s1(i, d, today)
  s2(i, d, kasus, mati)
  s4(i, d)
  s5(i, d, today)
  TEXT_200.forEach(([st, k, l]) => i.maxLen(d, st, k, l, 200))
  TEXT_500.forEach(([st, k, l]) => i.maxLen(d, st, k, l, 500))
  return { errors: i.errors, warnings: i.warnings }
}

/** hanya isian wajib Laporan Cepat (langkah 1) */
export const quickErrors = (d: Data, today: string) => validate(d, today).errors.filter((e) => e.step === 's1')

/** Saran diagnosa banding dari pola gejala & masa inkubasi — hanya saran, keputusan tetap pada petugas. */
export function saranDiagnosa(d: Data): { nama: string; alasan: string }[] {
  const g = new Set(rows(d, 'gejala').map((o) => str(o, 'nama')).filter(Boolean) as string[])
  const h = hasil(d)
  const ink = numOf(d.inkubasi_median) ?? numOf(d.inkubasi_rata) ?? h.inkubasi_saran
  const out: { nama: string; alasan: string }[] = []
  const has = (...x: string[]) => x.some((k) => g.has(k))
  if (has('Mual', 'Muntah') && ink !== null && ink <= 6) out.push({ nama: 'Intoksikasi Staphylococcus aureus / Bacillus cereus (tipe emetik)', alasan: `muntah/mual dengan inkubasi pendek (${ink} jam)` })
  if (has('Diare', 'Sakit Perut', 'Perut Melilit') && ink !== null && ink > 6 && ink <= 24) out.push({ nama: 'Clostridium perfringens / B. cereus (tipe diare)', alasan: `diare/nyeri perut dengan inkubasi ${ink} jam` })
  if (has('Diare', 'Demam') && (ink === null || ink >= 12)) out.push({ nama: 'Salmonella / Shigella / E. coli', alasan: 'diare disertai demam' + (ink !== null ? `, inkubasi ${ink} jam` : '') })
  if (has('Gangguan Penglihatan', 'Lemah', 'Sesak Napas') && has('Gangguan Penglihatan')) out.push({ nama: 'Botulisme (rujuk segera)', alasan: 'gangguan penglihatan/kelemahan' })
  if (has('Kemerahan pada wajah', 'Gatal', 'Sakit Kepala') && ink !== null && ink <= 2) out.push({ nama: 'Keracunan histamin (scombroid)', alasan: `kemerahan/gatal, inkubasi sangat pendek (${ink} jam)` })
  if (has('Cynocis/Kebiruan')) out.push({ nama: 'Keracunan nitrit/bahan kimia (methemoglobinemia)', alasan: 'kebiruan (sianosis)' })
  if (has('Pusing', 'Mual') && ink !== null && ink < 1) out.push({ nama: 'Keracunan bahan kimia/pestisida', alasan: `inkubasi < 1 jam` })
  return out
}

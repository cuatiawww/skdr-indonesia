// PR 031: Form Individu IBS (per pasien) — padanan skdr.kemkes.go.id/form-individu-agregat (4 tab resmi: Info Dasar, Info Pasien,
// Penyakit Agregat, Pemeriksaan) sebagai wizard 5 langkah: Unit & Periode, Info Pasien, Penyakit, Pemeriksaan, Tinjau & Kirim.
// Label teknis diganti (Id Unit → Jenis Unit, Id Prop → Provinsi, Id Distrik → Kecamatan, Pekerjaan No → Pekerjaan, Akhir No → Status Akhir,
// Diagnosa 1 → Diagnosa, ICD-X 1 + ICD-X Terpilih → ICD-X). Umur tidak lagi default 0 (kosong = belum diisi). Peta Google & Lat/Lng
// tidak dibuat (rusak di form resmi). Validasi mencerminkan services/backend-rust/src/laporan.rs validate_individu.
import { addDays, Collector, isFilled, validHp, weekStart, weeksInYear, type Data, type FormDef, type Refs } from './engine'
import { periode } from './ibs'

export const UMUR_PARTS: { key: string; label: string; unit: string; max: number }[] = [
  { key: 'umur_tahun', label: 'Umur (tahun)', unit: 'th', max: 150 },
  { key: 'umur_bulan', label: 'Umur (bulan)', unit: 'bl', max: 11 },
  { key: 'umur_hari', label: 'Umur (hari)', unit: 'hr', max: 30 },
]
export const PERIKSA: { key: string; label: string; lo: number; hi: number }[] = [
  { key: 'tinggi', label: 'Tinggi badan (cm)', lo: 30, hi: 250 },
  { key: 'berat', label: 'Berat badan (kg)', lo: 0.5, hi: 300 },
  { key: 'imt', label: 'IMT', lo: 5, hi: 80 },
  { key: 'sistole', label: 'Sistole (mmHg)', lo: 50, hi: 250 },
  { key: 'diastole', label: 'Diastole (mmHg)', lo: 30, hi: 150 },
  { key: 'suhu', label: 'Suhu (°C)', lo: 30, hi: 45 },
]

const blank = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
/** decimal typed with comma or dot; null = empty, NaN = invalid */
export const dec = (v: any): number | null => {
  if (blank(v)) return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
export const umurFilled = (d: Data) => UMUR_PARTS.some((p) => !blank(d[p.key]))
export function umurText(d: Data): string | null {
  const parts = UMUR_PARTS.filter((p) => Number(d[p.key]) > 0).map((p) => `${Number(d[p.key])} ${p.unit}`)
  return parts.length ? parts.join(' ') : null
}
/** IMT = berat (kg) / (tinggi (m))², 1 desimal */
export function imtOf(d: Data): number | null {
  const t = dec(d.tinggi), b = dec(d.berat)
  if (!t || !b || Number.isNaN(t) || Number.isNaN(b) || t <= 0 || b <= 0) return null
  return Math.round((b / ((t / 100) ** 2)) * 10) / 10
}
export function imtKategori(v: number): string {
  return v < 18.5 ? 'Berat badan kurang' : v < 25 ? 'Normal' : v < 27 ? 'Berat badan lebih' : 'Obesitas'
}
const diseaseCodes = (refs: Refs) => refs.ibs_penyakit.filter((p) => !p.is_total).map((p) => p.kode)
const meninggal = (d: Data) => d.status_akhir === 'Meninggal'
const wilayahReset = ['kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode']

export const INDIVIDU_FORM: FormDef = {
  jenis: 'individu',
  title: 'Form Individu (IBS)',
  short: 'Individu',
  eyebrow: 'SKDR-IBS · Form Individu',
  listHref: '/ibs/individu',
  listTitle: 'Form Individu',
  addLabel: 'Pasien Baru',
  searchPlaceholder: 'Cari nomor, pasien, No Epid, diagnosa, unit…',
  prefillKeys: ['jenis_unit', 'provinsi_id', 'kabkota_id', 'kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode', 'petugas', 'hp_petugas'],
  nameKey: 'petugas',
  defaultWeek: true,
  derive: (d) => {
    const v = imtOf(d)
    if (v !== null) return d.imt === v && d.imt_auto ? {} : { imt: v, imt_auto: true }
    return d.imt_auto ? { imt: null, imt_auto: false } : {}
  },
  steps: [
    { id: 's1', title: 'Unit & Periode', desc: 'Umumnya terisi otomatis dari data terakhir Anda.', sections: [
      { id: 's1-unit', title: 'Unit pelapor', fields: [
        { key: 'jenis_unit', label: 'Jenis Unit', type: 'select', options: 'jenis_unit', required: true, resets: ['unit_pelapor', 'unit_kode'], hint: 'Biasanya Puskesmas. (Form resmi: Id Unit)' },
        { key: 'provinsi_id', label: 'Provinsi', type: 'province', required: true, resets: ['kabkota_id', ...wilayahReset] },
        { key: 'kabkota_id', label: 'Kab/Kota', type: 'kabkota', depends: 'provinsi_id', required: true, resets: wilayahReset },
        { key: 'kecamatan', label: 'Kecamatan', type: 'kecamatan', depends: 'kabkota_id', resets: ['unit_pelapor', 'unit_kode'], hint: 'Opsional — mempersempit daftar Puskesmas.' },
        { key: 'unit_pelapor', label: 'Puskesmas/Unit', type: 'unit', required: true },
        { key: 'petugas', label: 'Nama Petugas', type: 'text', required: true, maxLen: 150, hint: 'Default nama akun Anda.' },
        { key: 'hp_petugas', label: 'Telp Petugas', type: 'tel', placeholder: '08xx atau +628xx' },
      ] },
      { id: 's1-periode', title: 'Periode', fields: [
        { key: 'tahun', label: 'Tahun', type: 'tahun', required: true, resets: ['minggu'] },
        { key: 'minggu', label: 'Minggu Epid', type: 'epiweek', required: true, hint: 'Default: minggu laporan berjalan. Tanggal Pemeriksaan sebaiknya di dalam minggu ini.' },
      ] },
    ] },
    { id: 's2', title: 'Info Pasien', sections: [
      { id: 's2-pasien', title: 'Identitas pasien', fields: [
        { key: 'nama_pasien', label: 'Nama Pasien', type: 'text', required: true, maxLen: 150 },
        { key: 'no_epid', label: 'No Epid', type: 'text', maxLen: 50, hint: 'Opsional — nomor epidemiologi bila sudah ada.' },
        { key: 'umur', label: 'Umur', type: 'umur', required: true, filled: (d) => umurFilled(d) && UMUR_PARTS.some((p) => Number(d[p.key]) > 0),
          hint: 'Isi minimal satu: tahun, bulan, atau hari. Bayi < 1 tahun: kosongkan/0 tahun lalu isi bulan atau hari.' },
        { key: 'kelamin', label: 'Jenis Kelamin', type: 'select', options: 'kelamin', required: true },
        { key: 'pekerjaan', label: 'Pekerjaan', type: 'select', options: 'pekerjaan' },
        { key: 'alamat', label: 'Alamat', type: 'textarea', maxLen: 500, placeholder: 'Alamat domisili pasien (jalan, RT/RW, desa/kelurahan)…' },
      ] },
    ] },
    { id: 's3', title: 'Penyakit', sections: [
      { id: 's3-penyakit', title: 'Penyakit agregat & pemeriksaan', fields: [
        { key: 'penyakit', label: 'Penyakit Agregat', type: 'select', options: 'ibs_penyakit', required: true, wide: true, hint: 'Salah satu dari 24 penyakit tabel agregat IBS (kode SMS — nama).' },
        { key: 'tgl_periksa', label: 'Tanggal Pemeriksaan', type: 'date', required: true, epi: true, shortcuts: true },
        { key: 'status_akhir', label: 'Status Akhir', type: 'select', options: 'status_akhir' },
        { key: 'tgl_meninggal', label: 'Tanggal Meninggal', type: 'date', child: true, visible: meninggal, required: true },
        { key: 'status_imunisasi', label: 'Status Imunisasi', type: 'select', options: 'status_imunisasi' },
      ] },
      { id: 's3-klinis', title: 'Keluhan & diagnosa', fields: [
        { key: 'keluhan', label: 'Keluhan Utama', type: 'text', maxLen: 500, placeholder: 'Contoh: demam 3 hari, mual' },
        { key: 'lama_sakit', label: 'Lama Sakit', type: 'text', maxLen: 100, placeholder: 'Contoh: 3 hari' },
        { key: 'icdx', label: 'ICD-X', type: 'text', maxLen: 20, placeholder: 'Contoh: A09', hint: 'Opsional — kode ICD-10.' },
        { key: 'diagnosa', label: 'Diagnosa', type: 'text', maxLen: 500 },
      ] },
    ] },
    { id: 's4', title: 'Pemeriksaan', desc: 'Semua opsional. Angka desimal boleh pakai koma (36,5).', sections: [
      { id: 's4-vital', title: 'Tanda vital & antropometri', fields: [
        { key: 'tinggi', label: 'Tinggi Badan', type: 'decimal', unit: 'cm' },
        { key: 'berat', label: 'Berat Badan', type: 'decimal', unit: 'kg' },
        { key: 'imt', label: 'IMT', type: 'decimal', unit: 'kg/m²', locked: (d) => (imtOf(d) !== null ? 'Dihitung otomatis dari tinggi & berat badan' : null),
          hint: 'Terisi otomatis bila tinggi & berat diisi.' },
        { key: 'suhu', label: 'Suhu', type: 'decimal', unit: '°C' },
        { key: 'sistole', label: 'Sistole', type: 'decimal', unit: 'mmHg' },
        { key: 'diastole', label: 'Diastole', type: 'decimal', unit: 'mmHg' },
      ] },
      { id: 's4-soap', title: 'Catatan SOAP', fields: [
        { key: 'soap_s', label: 'SOAP Subjective', type: 'textarea', maxLen: 500, placeholder: 'Keluhan menurut pasien…' },
        { key: 'soap_o', label: 'SOAP Objective', type: 'textarea', maxLen: 500, placeholder: 'Hasil pemeriksaan fisik/penunjang…' },
        { key: 'soap_a', label: 'SOAP Assessment', type: 'textarea', maxLen: 500, placeholder: 'Penilaian / diagnosis kerja…' },
        { key: 'soap_p', label: 'SOAP Planning', type: 'textarea', maxLen: 500, placeholder: 'Rencana terapi / rujukan / edukasi…' },
      ] },
    ] },
    { id: 's5', title: 'Tinjau & Kirim', review: true, sections: [] },
  ],
  validate: (d, refs) => validateIndividu(d, refs.today, diseaseCodes(refs)),
}

/** mirrors laporan.rs validate_individu */
export function validateIndividu(d: Data, today: string, rows: string[]) {
  const c = new Collector(d)
  const maxLen = (step: string, key: string, label: string, max: number) => {
    if (typeof d[key] === 'string' && [...d[key]].length > max) c.e(step, key, `${label} maksimal ${max} karakter`)
  }
  c.req('s1', 'jenis_unit', 'Jenis Unit')
  c.req('s1', 'provinsi_id', 'Provinsi')
  c.req('s1', 'kabkota_id', 'Kab/Kota')
  c.req('s1', 'unit_pelapor', 'Puskesmas/Unit')
  c.req('s1', 'petugas', 'Nama Petugas')
  if (isFilled(d.hp_petugas) && !validHp(String(d.hp_petugas))) c.e('s1', 'hp_petugas', 'Format No. Telp tidak valid (contoh: 0812xxxxxxx atau +62812xxxxxxx)')
  periode(c, d, 's1', today)

  c.req('s2', 'nama_pasien', 'Nama Pasien')
  c.req('s2', 'kelamin', 'Jenis Kelamin')
  let any = false, nonzero = false
  for (const p of UMUR_PARTS) {
    const v = d[p.key]
    if (blank(v)) continue
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > p.max) { c.e('s2', p.key, `${p.label} harus bilangan bulat 0–${p.max}`); continue }
    any = true; if (n > 0) nonzero = true
  }
  if (!any) c.e('s2', 'umur_tahun', 'Umur wajib diisi (tahun, bulan, atau hari)')
  else if (!nonzero) c.e('s2', 'umur_tahun', 'Umur tidak boleh 0 semua — isi bulan/hari untuk bayi')
  maxLen('s2', 'alamat', 'Alamat', 500)

  if (c.req('s3', 'penyakit', 'Penyakit Agregat') && rows.length && !rows.includes(String(d.penyakit))) c.e('s3', 'penyakit', 'Penyakit Agregat tidak ada di daftar penyakit IBS')
  if (c.req('s3', 'tgl_periksa', 'Tanggal Pemeriksaan')) {
    const t = String(d.tgl_periksa)
    if (t > today) c.e('s3', 'tgl_periksa', 'Tanggal Pemeriksaan tidak boleh di masa depan')
    else {
      const th = Number(d.tahun), m = Number(d.minggu)
      if (th && m >= 1 && m <= weeksInYear(th)) {
        const a = weekStart(th, m)
        if (t < a || t > addDays(a, 6)) c.w('s3', 'tgl_periksa', 'Tanggal Pemeriksaan di luar Minggu Epid yang dipilih')
      }
    }
  }
  if (meninggal(d) && c.req('s3', 'tgl_meninggal', 'Tanggal Meninggal')) {
    if (d.tgl_meninggal > today) c.e('s3', 'tgl_meninggal', 'Tanggal Meninggal tidak boleh di masa depan')
    if (d.tgl_periksa && d.tgl_meninggal < d.tgl_periksa) c.w('s3', 'tgl_meninggal', 'Tanggal Meninggal lebih awal dari Tanggal Pemeriksaan')
  }
  maxLen('s3', 'keluhan', 'Keluhan Utama', 500)
  maxLen('s3', 'lama_sakit', 'Lama Sakit', 100)
  maxLen('s3', 'icdx', 'ICD-X', 20)
  maxLen('s3', 'diagnosa', 'Diagnosa', 500)

  for (const p of PERIKSA) {
    const n = dec(d[p.key])
    if (n === null) continue
    if (Number.isNaN(n) || n <= 0) c.e('s4', p.key, `${p.label} harus angka lebih dari 0`)
    else if (n < p.lo || n > p.hi) c.w('s4', p.key, `${p.label} ${n} di luar rentang wajar (${p.lo}–${p.hi}) — periksa kembali`)
  }
  const sy = dec(d.sistole), di = dec(d.diastole)
  if (sy && di && !Number.isNaN(sy) && !Number.isNaN(di) && di >= sy) c.w('s4', 'diastole', 'Diastole sama atau lebih tinggi dari Sistole — periksa kembali')
  for (const [k, l] of [['soap_s', 'SOAP Subjective'], ['soap_o', 'SOAP Objective'], ['soap_a', 'SOAP Assessment'], ['soap_p', 'SOAP Planning']]) maxLen('s4', k, l, 500)
  return { errors: c.errors, warnings: c.warnings }
}

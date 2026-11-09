// PR 030: Form SKDR-IBS (data agregat mingguan) — 4 langkah: Unit & Wilayah, Periode Laporan, Data Kasus, Tinjau & Kirim.
// Label teknis diganti (Id Unit → Jenis Unit, Id Prop → Provinsi, Id Distrik → Kecamatan, Time Unit Value → Minggu Epid,
// Data Entry Date → Tanggal Entri, Form Date → Tanggal Formulir).
import { Collector, epiLabel, toNum, weekStart, weeksInYear, type Data, type FormDef, type Refs } from './engine'

export const IBS_COLS: { key: 'kasus' | 'kematian' | 'lab'; label: string; hint: string }[] = [
  { key: 'kasus', label: 'Kasus', hint: 'Jumlah kasus' },
  { key: 'kematian', label: 'Kematian', hint: 'Jumlah kematian (≤ kasus)' },
  { key: 'lab', label: 'Lab', hint: 'Jumlah Lab: kasus dengan pemeriksaan laboratorium (definisi perlu konfirmasi Kemkes)' },
]

export function ibsTotals(d: Data, rows: { kode: string }[]) {
  const r = d.rows || {}
  const sum = (k: string) => rows.reduce((a, x) => a + (Number(r[x.kode]?.[k]) > 0 ? Number(r[x.kode][k]) : 0), 0)
  return { kasus: sum('kasus'), kematian: sum('kematian'), lab: sum('lab') }
}

const diseaseRows = (refs: Refs) => refs.ibs_penyakit.filter((p) => !p.is_total)

export const IBS_FORM: FormDef = {
  jenis: 'ibs',
  title: 'Entri Data Agregat Mingguan (IBS)',
  short: 'IBS',
  eyebrow: 'SKDR-IBS · Laporan Agregat',
  listHref: '/ibs/laporan',
  steps: [
    { id: 's1', title: 'Unit & Wilayah', desc: 'Umumnya terisi otomatis dari laporan terakhir Anda.', sections: [
      { id: 's1-unit', title: 'Unit pelapor', fields: [
        { key: 'jenis_unit', label: 'Jenis Unit', type: 'select', options: 'jenis_unit', required: true, resets: ['unit_pelapor', 'unit_kode'] },
        { key: 'kelompok', label: 'Kelompok', type: 'select', options: 'kelompok_unit' },
        { key: 'provinsi_id', label: 'Provinsi', type: 'province', required: true, resets: ['kabkota_id', 'kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode'] },
        { key: 'kabkota_id', label: 'Kab/Kota', type: 'kabkota', depends: 'provinsi_id', required: true, resets: ['kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode'] },
        { key: 'kecamatan', label: 'Kecamatan', type: 'kecamatan', depends: 'kabkota_id', resets: ['unit_pelapor', 'unit_kode'], hint: 'Opsional — mempersempit daftar Puskesmas.' },
        { key: 'unit_pelapor', label: 'Puskesmas/Unit', type: 'unit', required: true, hint: 'Laporan IBS dicatat per unit (wajib, usulan).' },
        { key: 'petugas', label: 'Petugas', type: 'text', required: true, hint: 'Default nama akun Anda; ganti bila melapor atas nama petugas lain.', maxLen: 150 },
      ] },
    ] },
    { id: 's2', title: 'Periode Laporan', sections: [
      { id: 's2-periode', title: 'Periode', fields: [
        { key: 'tahun', label: 'Tahun', type: 'tahun', required: true, resets: ['minggu'] },
        { key: 'minggu', label: 'Minggu Epid', type: 'epiweek', required: true, hint: 'Default: minggu laporan berjalan (minggu epid terakhir yang sudah selesai).' },
        { key: 'tgl_entri', label: 'Tanggal Entri', type: 'info', info: (d) => d.tgl_entri || 'Hari ini (diisi sistem)' },
        { key: 'tgl_formulir', label: 'Tanggal Formulir', type: 'info', info: (d) => (d.tgl_formulir ? `${d.tgl_formulir} · ${epiLabel(d.tgl_formulir)}` : 'Hari ini (diisi sistem)') },
      ] },
    ] },
    { id: 's3', title: 'Data Kasus', desc: 'Isi angka per penyakit; kosong dihitung 0.', sections: [
      { id: 's3-grid', title: 'Kasus per penyakit', fields: [{ key: 'rows', label: 'Tabel kasus mingguan', type: 'ibsgrid', wide: true }] },
      { id: 's3-total', title: 'Total kunjungan & konfirmasi', fields: [
        { key: 'total_kunjungan', label: 'Total Kunjungan', type: 'number', required: true, hint: 'Seluruh kunjungan pasien di unit pada minggu ini (penyebut proporsi).' },
        { key: 'konfirmasi_nihil', label: 'Saya konfirmasi tidak ada kasus untuk semua penyakit pada minggu ini (laporan nihil)', type: 'check', wide: true,
          visible: (d) => !Object.values(d.rows || {}).some((r: any) => Number(r?.kasus) > 0), required: true },
      ] },
    ] },
    { id: 's4', title: 'Tinjau & Kirim', review: true, sections: [] },
  ],
  validate: (d, refs) => validateIbs(d, refs.today, diseaseRows(refs).map((r) => r.kode)),
}

/** mirrors laporan.rs validate_ibs */
export function validateIbs(d: Data, today: string, rows: string[]) {
  const c = new Collector(d)
  c.req('s1', 'jenis_unit', 'Jenis Unit')
  c.req('s1', 'provinsi_id', 'Provinsi')
  c.req('s1', 'kabkota_id', 'Kab/Kota')
  c.req('s1', 'unit_pelapor', 'Puskesmas/Unit')
  c.req('s1', 'petugas', 'Petugas')
  c.req('s2', 'tahun', 'Tahun')
  if (c.req('s2', 'minggu', 'Minggu Epid')) {
    const t = Number(d.tahun), m = Number(d.minggu)
    if (t && m) {
      if (m < 1 || m > weeksInYear(t)) c.e('s2', 'minggu', 'Minggu Epid tidak valid untuk tahun ini')
      else if (weekStart(t, m) > today) c.e('s2', 'minggu', 'Minggu Epid belum dimulai')
    }
  }
  let tk = 0
  const data = d.rows || {}
  for (const kode of rows) {
    const r = data[kode] || {}
    for (const [k, l] of [['kasus', 'Jumlah Kasus'], ['kematian', 'Jumlah Kematian'], ['lab', 'Jumlah Lab']] as const) {
      const n = toNum(r[k])
      if (n !== null && (Number.isNaN(n) || n < 0 || !Number.isInteger(n))) c.e('s3', `rows.${kode}.${k}`, `${l} (${kode}) harus bilangan bulat ≥ 0`)
    }
    const ks = Math.max(0, toNum(r.kasus) || 0), km = Math.max(0, toNum(r.kematian) || 0), lb = Math.max(0, toNum(r.lab) || 0)
    if (km > ks) c.e('s3', `rows.${kode}.kematian`, `Kematian melebihi Kasus (${kode})`)
    if (lb > ks) c.w('s3', `rows.${kode}.lab`, `Jumlah Lab melebihi Jumlah Kasus (${kode})`)
    tk += ks
  }
  if (c.req('s3', 'total_kunjungan', 'Total Kunjungan')) {
    c.nonneg('s3', 'total_kunjungan', 'Total Kunjungan')
    const t = toNum(d.total_kunjungan)
    if (t !== null && t < tk) c.w('s3', 'total_kunjungan', 'Total Kunjungan lebih kecil dari total kasus semua penyakit')
  }
  if (tk === 0 && d.konfirmasi_nihil !== true) c.e('s3', 'konfirmasi_nihil', 'Semua kasus bernilai 0: centang konfirmasi nihil kasus')
  return { errors: c.errors, warnings: c.warnings }
}

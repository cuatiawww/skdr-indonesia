// PR 030: Form SKDR-EBS (Surveilans Berbasis Kejadian) — 7 langkah, sesuai tab "Usulan Alur Step" (analisis before/after).
// Label dirapikan dari form resmi (SumberVerifikasi → Sumber Verifikasi, label ganda "Pengendalian faktor risiko", dll.).
import { Collector, epiLabel, isFilled, toNum, validHp, ya, type Data, type FormDef } from './engine'

export const USIA_BANDS: { key: string; label: string }[] = [
  { key: '0_7hr', label: '0–7 hr' }, { key: '8_28hr', label: '8–28 hr' }, { key: 'lt1th', label: '< 1 th' }, { key: '1_4th', label: '1–4 th' },
  { key: '5_9th', label: '5–9 th' }, { key: '10_14th', label: '10–14 th' }, { key: '15_19th', label: '15–19 th' }, { key: '20_44th', label: '20–44 th' },
  { key: '45_54th', label: '45–54 th' }, { key: '55_69th', label: '55–69 th' }, { key: 'gt70th', label: '≥ 70 th' },
]
export const SEXES: { key: 'pria' | 'wanita'; label: string }[] = [{ key: 'pria', label: 'Laki-laki' }, { key: 'wanita', label: 'Perempuan' }]

export function usiaTotals(d: Data) {
  const u = d.usia || {}
  const row = (s: string) => USIA_BANDS.reduce((a, b) => a + (Number(u[s]?.[b.key]) > 0 ? Number(u[s][b.key]) : 0), 0)
  const col = (b: string) => SEXES.reduce((a, s) => a + (Number(u[s.key]?.[b]) > 0 ? Number(u[s.key][b]) : 0), 0)
  const pria = row('pria'), wanita = row('wanita')
  return { pria, wanita, total: pria + wanita, col }
}

const klb = (d: Data) => ya(d, 'klb')
const wilayahReset = ['kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode']

export const EBS_FORM: FormDef = {
  jenis: 'ebs',
  title: 'Formulir Surveilans Berbasis Kejadian (EBS)',
  short: 'EBS',
  eyebrow: 'SKDR-EBS · Laporan',
  listHref: '/ebs/laporan',
  steps: [
    { id: 's1', title: 'Pelapor & Wilayah', desc: 'Umumnya terisi otomatis dari akun atau laporan terakhir Anda.', sections: [
      { id: 's1-id', title: 'Identitas laporan', fields: [
        { key: 'no_laporan', label: 'Nomor EBS', type: 'info', info: (_d, c) => c.no || 'Dibuat otomatis saat draf pertama tersimpan' },
        { key: 'tgl_laporan', label: 'Tanggal Laporan', type: 'info', info: (d) => (d.tgl_laporan ? `${d.tgl_laporan} · ${epiLabel(d.tgl_laporan)}` : 'Hari ini (diisi sistem)') },
      ] },
      { id: 's1-pelapor', title: 'Unit & wilayah pelapor', fields: [
        { key: 'jenis_unit', label: 'Jenis Unit Pelapor', type: 'select', options: 'jenis_unit', required: true, resets: ['unit_pelapor', 'unit_kode'] },
        { key: 'provinsi_id', label: 'Provinsi', type: 'province', required: true, resets: ['kabkota_id', ...wilayahReset] },
        { key: 'kabkota_id', label: 'Kab/Kota', type: 'kabkota', depends: 'provinsi_id', required: true, resets: wilayahReset },
        { key: 'kecamatan', label: 'Kecamatan', type: 'kecamatan', depends: 'kabkota_id', required: true, resets: ['unit_pelapor', 'unit_kode'] },
        { key: 'unit_pelapor', label: 'Unit Pelapor', type: 'unit', required: true, hint: 'Daftar mengikuti Jenis Unit + Kecamatan (Puskesmas) atau Kab/Kota (unit lain).' },
        { key: 'nama_pelapor', label: 'Nama dan Institusi Pelapor', type: 'text', required: true, placeholder: 'Contoh: Budi Santoso – Puskesmas Pantai Labu', maxLen: 200 },
        { key: 'hp_pelapor', label: 'No. HP Pelapor', type: 'tel', placeholder: '08xx atau +628xx', hint: 'Dipakai untuk verifikasi rumor.' },
      ] },
    ] },
    { id: 's2', title: 'Informasi Rumor', sections: [
      { id: 's2-rumor', title: 'Rumor & sumber', fields: [
        { key: 'penyakit_rumor', label: 'Penyakit Rumor', type: 'select', options: 'penyakit', required: true },
        { key: 'tgl_rumor', label: 'Tanggal Rumor Diketahui', type: 'date', required: true, epi: true, shortcuts: true },
        { key: 'status_kejadian', label: 'Status Kejadian', type: 'select', options: 'status_kejadian' },
        { key: 'penyakit_terverifikasi', label: 'Penyakit Terverifikasi', type: 'select', options: 'penyakit',
          required: (d) => String(d.status_kejadian || '').startsWith('Terverifikasi'), hint: 'Wajib bila Status Kejadian "Terverifikasi…" (aturan usulan).' },
        { key: 'sumber_informasi', label: 'Sumber Informasi', type: 'select', options: 'sumber_informasi' },
        { key: 'sumber_informasi_lain', label: 'Sebutkan sumber informasi lainnya', type: 'text', child: true, visible: (d) => d.sumber_informasi === 'lainnya', required: true },
        { key: 'sumber_verifikasi', label: 'Sumber Verifikasi', type: 'select', options: 'sumber_informasi' },
      ] },
    ] },
    { id: 's3', title: 'Kasus & Klinis', sections: [
      { id: 's3-jumlah', title: 'Jumlah kasus', fields: [
        { key: 'jml_kasus', label: 'Jumlah Kasus', type: 'number', required: true, stepper: true, hint: 'Minimal 1.' },
        { key: 'jml_kematian', label: 'Jumlah Kematian', type: 'number', stepper: true, hint: 'Kosong = 0. Tidak boleh melebihi Jumlah Kasus.' },
        { key: 'usia', label: 'Data Berdasarkan Usia dan Jenis Kelamin', type: 'agegrid', wide: true },
      ] },
      { id: 's3-domisili', title: 'Domisili kasus', fields: [
        { key: 'dom_sama', label: 'Domisili kasus sama dengan wilayah pelapor', type: 'domsama', wide: true },
        { key: 'dom_provinsi_id', label: 'Provinsi Domisili Kasus', type: 'province', resets: ['dom_kabkota_id'] },
        { key: 'dom_kabkota_id', label: 'Kab/Kota Domisili Kasus', type: 'kabkota', depends: 'dom_provinsi_id', direct: 'dom_provinsi_id',
          hint: 'Bisa langsung cari dari 514 kab/kota; provinsi terisi otomatis.' },
      ] },
      { id: 's3-klinis', title: 'Klinis & kronologi', fields: [
        { key: 'gejala', label: 'Gejala', type: 'textarea', placeholder: 'Contoh: demam, ruam, batuk, diare…', maxLen: 2000 },
        { key: 'tgl_onset', label: 'Tanggal Mulai Bergejala', type: 'date', epi: true },
        { key: 'tgl_meninggal', label: 'Tanggal Meninggal', type: 'date', visible: (d) => (toNum(d.jml_kematian) || 0) > 0, required: true, child: true },
        { key: 'tgl_faskes', label: 'Tanggal Datang ke Faskes', type: 'date' },
        { key: 'kronologi', label: 'Informasi dan Kronologi Kejadian', type: 'richtext', wide: true,
          placeholder: 'Apa yang terjadi, siapa yang terdampak, kapan, di mana, bagaimana kejadiannya dan tindakan awal…' },
      ] },
    ] },
    { id: 's4', title: 'Lab & Tata Laksana', sections: [
      { id: 's4-lab', title: 'A. Dukungan Laboratorium', fields: [
        { key: 'spesimen', label: 'Pengambilan Spesimen', type: 'yatidak', required: true, hint: 'Jika Ya, lengkapi detail spesimen di bawahnya.' },
        { key: 'lab_jml_diperiksa', label: 'Jumlah Orang Diperiksa', type: 'number', child: true, visible: (d) => ya(d, 'spesimen') },
        { key: 'lab_tgl_ambil', label: 'Tanggal Pengambilan Spesimen', type: 'date', child: true, visible: (d) => ya(d, 'spesimen'), required: true },
        { key: 'lab_tgl_kirim', label: 'Tanggal Pengiriman Spesimen', type: 'date', child: true, visible: (d) => ya(d, 'spesimen') },
        { key: 'lab_tgl_hasil', label: 'Tanggal Hasil Lab', type: 'date', child: true, visible: (d) => ya(d, 'spesimen') },
        { key: 'lab_hasil', label: 'Hasil Laboratorium', type: 'select', options: 'hasil_lab', child: true, visible: (d) => ya(d, 'spesimen') },
        { key: 'lab_jml_positif', label: 'Jumlah Orang Hasil Lab Positif', type: 'number', child: true, visible: (d) => ya(d, 'spesimen') },
      ] },
      { id: 's4-tl', title: 'B. Tata Laksana Kasus', fields: [
        { key: 'tatalaksana', label: 'Dilakukan tata laksana kasus?', type: 'yatidak', required: true, hint: 'Jika Ya, isi tanggal dan jenis tata laksana.' },
        { key: 'tatalaksana_tgl', label: 'Tanggal Tata Laksana Kasus', type: 'date', child: true, visible: (d) => ya(d, 'tatalaksana'), required: true },
        { key: 'tatalaksana_jenis', label: 'Jenis Tata Laksana Kasus', type: 'multiselect', options: 'tatalaksana', child: true, visible: (d) => ya(d, 'tatalaksana'), required: true,
          hint: 'Boleh lebih dari satu (usulan; perlu konfirmasi aturan).' },
      ] },
    ] },
    { id: 's5', title: 'Status KLB & Tindakan', sections: [
      { id: 's5-klb', title: 'C. Status KLB', fields: [
        { key: 'klb', label: 'Apakah memenuhi kriteria Kejadian Luar Biasa (KLB)?', type: 'yatidak', required: true, wide: true, hint: 'Jika Ya, detail KLB muncul di bawahnya.' },
        { key: 'w1', label: 'Formulir W1', type: 'yatidak', child: true, visible: klb, required: true },
        { key: 'w1_sumber', label: 'Sumber W1', type: 'select', options: 'sumber_w1', child: true, visible: (d) => klb(d) && ya(d, 'w1') },
        { key: 'w1_tgl', label: 'Tanggal Formulir W1', type: 'date', child: true, visible: (d) => klb(d) && ya(d, 'w1'), required: true },
        { key: 'sk_klb', label: 'SK KLB', type: 'yatidak', child: true, visible: klb, required: true },
        { key: 'klb_tgl_mulai', label: 'Tanggal KLB Dimulai', type: 'date', child: true, visible: klb, required: (d) => ya(d, 'sk_klb') },
        { key: 'tgl_pe', label: 'Tanggal Penyelidikan Epidemiologi (PE)', type: 'date', child: true, visible: klb },
        { key: 'tgc', label: 'Mobilisasi TGC', type: 'yatidak', child: true, visible: klb, required: true },
        { key: 'tgc_tgl', label: 'Tanggal Mobilisasi TGC', type: 'date', child: true, visible: (d) => klb(d) && ya(d, 'tgc'), required: true },
        { key: 'klb_status', label: 'Status KLB Saat Ini', type: 'select', options: 'status_klb', child: true, visible: klb, required: true },
        { key: 'klb_tgl_berakhir', label: 'Tanggal KLB Berakhir', type: 'date', child: true, visible: (d) => klb(d) && d.klb_status === 'Berakhir', required: true },
        { key: 'klb_no_id', label: 'No. ID KLB', type: 'text', child: true, visible: klb, hint: 'Nomor/ID KLB bila sudah ada.' },
      ] },
      { id: 's5-tindakan', title: 'D. Tindakan yang Sudah Dilakukan', fields: [
        { key: 'pfr', label: 'Pengendalian Faktor Risiko', type: 'yatidak', required: true },
        { key: 'pfr_tgl', label: 'Tanggal Pengendalian Faktor Risiko', type: 'date', child: true, visible: (d) => ya(d, 'pfr'), required: true },
        { key: 'pfr_uraian', label: 'Uraian Pengendalian Faktor Risiko', type: 'textarea', child: true, visible: (d) => ya(d, 'pfr'), maxLen: 1000 },
        { key: 'komrisk', label: 'Komunikasi Risiko', type: 'yatidak', required: true },
        { key: 'komrisk_tgl', label: 'Tanggal Penyuluhan (Komunikasi Risiko)', type: 'date', child: true, visible: (d) => ya(d, 'komrisk'), required: true },
        { key: 'koordinasi', label: 'Koordinasi Lintas Sektor/LP', type: 'yatidak', required: true },
        { key: 'koordinasi_tgl', label: 'Tanggal Koordinasi Rapat LS/LP', type: 'date', child: true, visible: (d) => ya(d, 'koordinasi'), required: true },
      ] },
    ] },
    { id: 's6', title: 'Lampiran', desc: 'Opsional. Unggah tidak memicu validasi langkah lain.', sections: [
      { id: 's6-file', title: 'Lampiran', fields: [{ key: 'lampiran', label: 'File lampiran', type: 'lampiran', wide: true }] },
    ] },
    { id: 's7', title: 'Tinjau & Kirim', review: true, sections: [] },
  ],
  validate: (d, refs) => validateEbs(d, refs.today),
}

/** mirrors laporan.rs validate_ebs */
export function validateEbs(d: Data, today: string) {
  const c = new Collector(d)
  const tglLap = d.tgl_laporan || today
  c.req('s1', 'jenis_unit', 'Jenis Unit Pelapor')
  c.req('s1', 'provinsi_id', 'Provinsi')
  c.req('s1', 'kabkota_id', 'Kab/Kota')
  c.req('s1', 'kecamatan', 'Kecamatan')
  c.req('s1', 'unit_pelapor', 'Unit Pelapor')
  c.req('s1', 'nama_pelapor', 'Nama dan Institusi Pelapor')
  if (isFilled(d.hp_pelapor) && !validHp(String(d.hp_pelapor))) c.e('s1', 'hp_pelapor', 'Format No. HP tidak valid (contoh: 0812xxxxxxx atau +62812xxxxxxx)')

  c.req('s2', 'penyakit_rumor', 'Penyakit Rumor')
  if (c.req('s2', 'tgl_rumor', 'Tanggal Rumor Diketahui')) c.notAfter('s2', 'tgl_rumor', 'Tanggal Rumor Diketahui', tglLap)
  if (String(d.status_kejadian || '').startsWith('Terverifikasi')) c.req('s2', 'penyakit_terverifikasi', 'Penyakit Terverifikasi (status Terverifikasi)')
  if (d.sumber_informasi === 'lainnya') c.req('s2', 'sumber_informasi_lain', 'Sumber informasi lainnya')

  const kasus = toNum(d.jml_kasus)
  if (kasus === null || Number.isNaN(kasus) || kasus < 1 || !Number.isInteger(kasus)) c.e('s3', 'jml_kasus', 'Jumlah Kasus tidak boleh 0 atau kosong')
  c.nonneg('s3', 'jml_kematian', 'Jumlah Kematian')
  const mati = toNum(d.jml_kematian) || 0
  if (kasus !== null && !Number.isNaN(kasus) && mati > kasus) c.e('s3', 'jml_kematian', 'Jumlah Kematian tidak boleh melebihi Jumlah Kasus')
  if (mati > 0) c.req('s3', 'tgl_meninggal', 'Tanggal Meninggal')
  let badUsia = false
  for (const s of ['pria', 'wanita']) for (const [, v] of Object.entries(d.usia?.[s] || {})) {
    const n = toNum(v); if (n !== null && (Number.isNaN(n) || n < 0 || !Number.isInteger(n))) badUsia = true
  }
  if (badUsia) c.e('s3', 'usia', 'Isian usia & jenis kelamin harus bilangan bulat ≥ 0')
  const tu = usiaTotals(d).total
  if (kasus !== null && !Number.isNaN(kasus) && tu > 0 && tu !== kasus) c.w('s3', 'usia', `Total usia & jenis kelamin (${tu}) tidak sama dengan Jumlah Kasus (${kasus})`)
  if (isFilled(d.dom_kabkota_id) && !isFilled(d.dom_provinsi_id)) c.e('s3', 'dom_provinsi_id', 'Pilih Provinsi Domisili Kasus')
  c.notAfter('s3', 'tgl_onset', 'Tanggal Mulai Bergejala', tglLap)
  c.notAfter('s3', 'tgl_meninggal', 'Tanggal Meninggal', tglLap)
  c.notAfter('s3', 'tgl_faskes', 'Tanggal Datang ke Faskes', tglLap)
  if (d.tgl_onset && d.tgl_meninggal && d.tgl_meninggal < d.tgl_onset) c.e('s3', 'tgl_meninggal', 'Tanggal Meninggal tidak boleh sebelum Tanggal Mulai Bergejala')
  if (d.tgl_onset && d.tgl_faskes && d.tgl_faskes < d.tgl_onset) c.w('s3', 'tgl_faskes', 'Tanggal Datang ke Faskes lebih awal dari Tanggal Mulai Bergejala')

  if (c.req('s4', 'spesimen', 'Pengambilan Spesimen') && ya(d, 'spesimen')) {
    c.req('s4', 'lab_tgl_ambil', 'Tanggal Pengambilan Spesimen')
    c.nonneg('s4', 'lab_jml_diperiksa', 'Jumlah Orang Diperiksa')
    c.nonneg('s4', 'lab_jml_positif', 'Jumlah Orang Hasil Lab Positif')
    const p = toNum(d.lab_jml_positif), t = toNum(d.lab_jml_diperiksa)
    if (p !== null && t !== null && p > t) c.e('s4', 'lab_jml_positif', 'Jumlah positif tidak boleh melebihi Jumlah Orang Diperiksa')
    if (d.lab_tgl_ambil && d.lab_tgl_kirim && d.lab_tgl_kirim < d.lab_tgl_ambil) c.e('s4', 'lab_tgl_kirim', 'Tanggal Pengiriman tidak boleh sebelum Tanggal Pengambilan')
    const after = d.lab_tgl_kirim || d.lab_tgl_ambil
    if (after && d.lab_tgl_hasil && d.lab_tgl_hasil < after) c.e('s4', 'lab_tgl_hasil', 'Tanggal Hasil Lab tidak boleh sebelum Tanggal Pengiriman/Pengambilan')
    c.notAfter('s4', 'lab_tgl_ambil', 'Tanggal Pengambilan Spesimen', tglLap)
    c.notAfter('s4', 'lab_tgl_kirim', 'Tanggal Pengiriman Spesimen', tglLap)
    c.notAfter('s4', 'lab_tgl_hasil', 'Tanggal Hasil Lab', tglLap)
  }
  if (c.req('s4', 'tatalaksana', 'Dilakukan Tata Laksana Kasus?') && ya(d, 'tatalaksana')) {
    c.req('s4', 'tatalaksana_tgl', 'Tanggal Tata Laksana Kasus')
    c.req('s4', 'tatalaksana_jenis', 'Jenis Tata Laksana Kasus')
    if (d.tgl_onset && d.tatalaksana_tgl && d.tatalaksana_tgl < d.tgl_onset) c.w('s4', 'tatalaksana_tgl', 'Tanggal Tata Laksana lebih awal dari Tanggal Mulai Bergejala')
  }

  if (c.req('s5', 'klb', 'Memenuhi kriteria KLB?') && ya(d, 'klb')) {
    if (c.req('s5', 'w1', 'Formulir W1') && ya(d, 'w1')) c.req('s5', 'w1_tgl', 'Tanggal Formulir W1')
    if (c.req('s5', 'sk_klb', 'SK KLB') && ya(d, 'sk_klb')) c.req('s5', 'klb_tgl_mulai', 'Tanggal KLB Dimulai')
    if (c.req('s5', 'tgc', 'Mobilisasi TGC') && ya(d, 'tgc')) c.req('s5', 'tgc_tgl', 'Tanggal Mobilisasi TGC')
    if (c.req('s5', 'klb_status', 'Status KLB Saat Ini') && d.klb_status === 'Berakhir') c.req('s5', 'klb_tgl_berakhir', 'Tanggal KLB Berakhir')
    if (d.klb_tgl_mulai && d.klb_tgl_berakhir && d.klb_tgl_berakhir < d.klb_tgl_mulai) c.e('s5', 'klb_tgl_berakhir', 'Tanggal KLB Berakhir tidak boleh sebelum Tanggal KLB Dimulai')
    if (d.tgl_rumor && d.tgl_pe && d.tgl_pe < d.tgl_rumor) c.w('s5', 'tgl_pe', 'Tanggal PE lebih awal dari Tanggal Rumor Diketahui')
  }
  for (const [q, t, l] of [['pfr', 'pfr_tgl', 'Pengendalian Faktor Risiko'], ['komrisk', 'komrisk_tgl', 'Komunikasi Risiko'], ['koordinasi', 'koordinasi_tgl', 'Koordinasi Lintas Sektor/LP']]) {
    if (c.req('s5', q, `${l}?`) && ya(d, q)) c.req('s5', t, `Tanggal ${l}`)
  }
  return { errors: c.errors, warnings: c.warnings }
}

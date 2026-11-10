// PR 033: definisi langkah wizard Pengawasan Gizi MBG (identitas kunjungan + Formulir 1–13).
// Field bertipe 'mbg' dirender oleh components/pengawasan-gizi/MbgFields.tsx (mbg.kind).
import type { Data, FieldDef, SectionDef, StepDef } from '@/lib/laporan/engine'
import { ALERGI_Q, CEK_NASKAH, F1, F2, F9, REK_HINT, REKAP, SISA_RULE, type CekNaskah, type Komponen } from './naskah'
import { f9Item, has, sasaranOf, sisaItem, SAMPEL, TIDAK, validateF1 } from './rules'

export interface MbgDef { key: string; no: number | null; title: string; short: string; steps: StepDef[] }

const mbg = (key: string, label: string, kind: string, extra: Partial<FieldDef> = {}, p: Record<string, any> = {}): FieldDef =>
  ({ key, label, type: 'mbg', wide: true, ...extra, mbg: { kind, ...p } })
const tinjau: StepDef = { id: 'tinjau', title: 'Tinjau & Kirim', review: true, sections: [] }
const dokumen = (list: string[]): FieldDef => mbg('_dokumen', 'Dokumen yang dilihat', 'dokumen', {}, { list })
const lampiran = (): FieldDef => mbg('_lampiran', 'Bukti dokumen/foto (opsional)', 'lampiran', {}, { item: '' })
const hasil = (label: string, p: Record<string, any> = {}): FieldDef => mbg('_hasil_view', label, 'hasil', {}, p)

/** Rekomendasi 1–4; nomor 1 wajib bila `perlu(d)` */
const rekFields = (prefix: string, perlu: (d: Data) => boolean): FieldDef[] =>
  [1, 2, 3, 4].map((x) => mbg(`${prefix}${x}`, `${x}.`, 'rek', x === 1 ? { required: perlu } : {}))

// ─── identitas ────────────────────────────────────────────────────────────────
const wilayahReset = ['kecamatan', 'kecamatan_nama', 'unit_pelapor', 'unit_kode']
export const IDENTITAS: MbgDef = {
  key: 'identitas', no: null, title: 'Identitas Kunjungan', short: 'Identitas',
  steps: [
    { id: 's1', title: 'Puskesmas & Wilayah', desc: 'Diisi sekali per kunjungan — dipakai di kepala Formulir 1–13.', sections: [{ id: 'tpg', title: 'Tenaga Pelaksana Gizi & Puskesmas', fields: [
      { key: 'nama_tpg', label: 'Nama TPG', type: 'text', required: true, maxLen: 200, hint: 'Terisi dari akun yang sedang login; boleh diubah.' },
      { key: 'provinsi_id', label: 'Provinsi', type: 'province', required: true, resets: ['kabkota_id', ...wilayahReset] },
      { key: 'kabkota_id', label: 'Kab/Kota', type: 'kabkota', depends: 'provinsi_id', required: true, resets: wilayahReset },
      { key: 'kecamatan', label: 'Kecamatan', type: 'kecamatan', depends: 'kabkota_id', resets: ['unit_pelapor', 'unit_kode'], hint: 'Opsional — mempersempit daftar puskesmas.' },
      { key: 'unit_pelapor', label: 'Puskesmas', type: 'unit', required: true, hint: 'Pilih dari daftar puskesmas wilayah ini, atau ketik bila belum ada.' },
    ] }] },
    { id: 's2', title: 'SPPG & Kunjungan', sections: [{ id: 'sppg', title: 'SPPG yang dikunjungi', fields: [
      { key: 'nama_sppg', label: 'Nama SPPG', type: 'text', required: true, maxLen: 200 },
      { key: 'nama_pengawas', label: 'Nama Pengawas Gizi', type: 'text', required: true, maxLen: 200, hint: 'Pengawas gizi SPPG yang ditemui.' },
      { key: 'tanggal', label: 'Hari/Tanggal', type: 'date', required: true, shortcuts: true },
    ] }] },
    tinjau,
  ],
}

// ─── checklist F3–F8, F10, F11 ────────────────────────────────────────────────
function komponenStep(spec: { no: number; sisa?: boolean; foto?: boolean }, g: Komponen, kind: 'cek' | 'f9'): StepDef {
  return {
    id: g.step, title: `${g.kode}. ${g.title.length > 48 ? `${g.title.slice(0, 46)}…` : g.title}`,
    sections: [{ id: g.step, title: `${g.kode}. ${g.title}`, desc: spec.sisa && g.step === 'kB' ? SISA_RULE : undefined, fields: g.items.map((it) => {
      const label = `${it.k}. ${it.label}`
      if (kind === 'f9') return mbg(`i${it.k}`, label, 'f9item', { required: true, filled: (d) => !!f9Item(d, it.k) }, { k: it.k })
      if (spec.sisa && it.k >= 3) return mbg(`i${it.k}`, label, 'sisa', { required: true, filled: (d) => sisaItem(d, it.k).filled === SAMPEL }, { k: it.k })
      return mbg(`i${it.k}`, label, 'cek', { required: true }, { k: it.k, note: it.note, foto: spec.foto })
    }) }],
  }
}
const anyTidak = (spec: CekNaskah) => (d: Data) => spec.komponen.some((g) => g.items.some(({ k }) => (spec.sisa && k >= 3 ? sisaItem(d, k).val === TIDAK : d[`i${k}`] === TIDAK)))

function cekDef(spec: CekNaskah): MbgDef {
  const dokFields: FieldDef[] = [...(spec.header || []).map((h): FieldDef => ({ key: h.key, label: h.label, type: 'text', required: true, maxLen: 200, wide: false })), dokumen(spec.dokumen)]
  if (spec.foto) dokFields.push(mbg('_foto_note', 'Dokumentasi foto', 'note', {}, { text: 'Unggah foto potongan bahan pangan langsung pada setiap butir penilaian (langkah berikutnya).' }))
  else dokFields.push(lampiran())
  const kesFields: FieldDef[] = [hasil(spec.kesLabel, { skor: spec.skorLabel }), ...rekFields('rek', anyTidak(spec))]
  const sections: SectionDef[] = [{ id: 'kes', title: 'Skor & Kesimpulan', fields: [kesFields[0]] }, { id: 'rek', title: 'Rekomendasi', desc: REK_HINT, fields: kesFields.slice(1) }]
  if (spec.alergi) sections.push({ id: 'alergi', title: 'Catatan tambahan', desc: ALERGI_Q, fields: [
    mbg('alergi', 'Ada sasaran yang alergi makanan?', 'choice', { required: true }, { opts: ['Ya', 'Tidak'] }),
    { key: 'alergi_detail', label: 'Jenis alergi & penanganannya', type: 'textarea', maxLen: 500, required: (d) => d.alergi === 'Ya', visible: (d) => d.alergi === 'Ya', wide: true },
  ] })
  return {
    key: `f${spec.no}`, no: spec.no, title: spec.title, short: spec.short,
    steps: [
      { id: 'dok', title: spec.header ? 'Lokasi & Dokumen' : 'Dokumen', sections: [{ id: 'dok', title: spec.header ? 'Lokasi pengamatan & dokumen yang dilihat' : 'Dokumen yang dilihat', fields: dokFields }] },
      ...spec.komponen.map((g) => komponenStep(spec, g, 'cek')),
      { id: 'kes', title: 'Kesimpulan & Rekomendasi', sections },
      tinjau,
    ],
  }
}

// ─── F1 ───────────────────────────────────────────────────────────────────────
const f1Hasil = (key: string, label: string, rule: string) => hasil(label, { f1: key, rule })
const F1_DEF: MbgDef = {
  key: 'f1', no: 1, title: F1.title, short: F1.short,
  steps: [
    { id: 'a1', title: 'A.1 Pendidikan Pengawas Gizi', sections: [{ id: 'a1', title: 'A. Pengawas Gizi — A.1 Jumlah dan latar belakang pendidikan', desc: 'Isi kolom 3 dengan angka sesuai jenis pendidikan, bila tidak ada beri angka \'0"', fields: [
      ...F1.a1.map((l, x) => mbg(`a1_r${x + 1}`, `${x + 1}. ${l}`, 'count', { required: true }, { suffix: 'orang' })),
      { key: 'a1_r7_jenis', label: 'Keterangan — jenis pendidikan Lainnya', type: 'text', maxLen: 200, required: (d) => Number(d.a1_r7) > 0, visible: (d) => Number(d.a1_r7) > 0, wide: true },
      f1Hasil('a1', 'Kesimpulan A.1. Jumlah dan latar belakang pendidikan pengawas gizi', F1.a1Rule),
    ] }] },
    { id: 'a2', title: 'A.2 Pelatihan Pengawas Gizi', sections: [{ id: 'a2', title: 'A.2 Pelatihan/pembekalan/sosialisasi pengawas gizi mengenai standar gizi MBG', desc: 'Pilih Belum/Sudah mengikuti, isi nomor sertifikat atau surat tugas', fields: [
      ...F1.a2.map((l, x) => mbg(`a2_p${x + 1}`, `${x + 1}. ${l}`, 'a2row', { required: true }, { n: x + 1 })),
      f1Hasil('a2', 'Kesimpulan A.2. Pelatihan/pembekalan/sosialisasi pengawas gizi mengenai standar gizi MBG', F1.a2Rule),
      f1Hasil('a', 'Kesimpulan Kesesuaian Pengawas Gizi', F1.aRule),
    ] }] },
    { id: 'b1', title: 'B.1 Penjamah Makanan', sections: [{ id: 'b1', title: 'B. Penjamah Makanan — B.1 Jumlah dan latar belakang pendidikan', desc: 'Isi kolom 3 dengan angka sesuai jenis pendidikan, bila tidak ada beri angka \'0"', fields: [
      ...F1.b1.map((l, x) => mbg(`b1_r${x + 1}`, `${x + 1}. ${l}`, 'count', { required: true }, { suffix: 'orang' })),
      mbg('_b1_total', 'Total', 'b1total'),
      mbg('wilayah_3t', 'SPPG berada di wilayah 3T?', 'choice', { required: true }, { opts: ['Ya', 'Tidak'], hint: 'catatan : pengecualian jumlah minimal penjamah makanan pada SPPG di wilayah 3T' }),
      mbg('penerima', 'Jumlah penerima manfaat', 'count', { required: (d) => d.wilayah_3t === 'Ya', visible: (d) => d.wilayah_3t === 'Ya' }, { suffix: 'orang', catatan: F1.b1Catatan }),
      f1Hasil('b1', 'Kesimpulan B.1. Jumlah penjamah makanan', F1.b1Rule),
    ] }] },
    { id: 'b2', title: 'B.2 Pelatihan Penjamah', sections: [
      { id: 'b2', title: 'B.2 Pelatihan/pembekalan/sosialisasi penjamah makanan mengenai standar gizi MBG', desc: 'Isi kolom 3 dan 4 dengan angka sesuai jumlah penjamah makanan yang sudah/belum mengikuti', fields: [
        ...F1.b2.map((l, x) => mbg(`b2_p${x + 1}_belum`, `${x + 1}. ${l}`, 'b2row', { required: true, filled: (d) => has(d, `b2_p${x + 1}_belum`) && has(d, `b2_p${x + 1}_sudah`) }, { pre: `b2_p${x + 1}` })),
      ] },
      { id: 'b2lain', title: `4. ${F1.b2Lain}`, fields: [1, 2, 3, 4, 5].map((r) => mbg(`b2_l${r}_nama`, `Pelatihan …... (${r})`, 'b2lain', {}, { pre: `b2_l${r}` })) },
      { id: 'b2bukti', title: 'Sertifikat atau bukti dokumen', fields: [lampiran()] },
      { id: 'b2kes', title: 'Kesimpulan B.2', fields: [f1Hasil('b2', 'Kesimpulan B.2. Pelatihan/pembekalan/sosialisasi penjamah makanan mengenai standar gizi MBG', F1.b2Rule)] },
    ] },
    { id: 'kes', title: 'Kesimpulan & Rekomendasi', sections: [
      { id: 'kes', title: 'Ringkasan kesimpulan', fields: [hasil('Kesimpulan Formulir 1 (Ketenagaan)', { f1: 'all', rule: 'Sesuai apabila Kesimpulan Pengawas Gizi, B.1 dan B.2 = "sesuai"' })] },
      { id: 'rekA', title: 'Rekomendasi A (Pengawas Gizi)', desc: F1.rekA, fields: rekFields('rekA', (d) => validateF1(d).hasil.a === TIDAK) },
      { id: 'rekB', title: 'Rekomendasi B (Penjamah Makanan)', desc: F1.rekB, fields: rekFields('rekB', (d) => { const h = validateF1(d).hasil; return h.b1 === TIDAK || h.b2 === TIDAK }) },
    ] },
    tinjau,
  ],
}

// ─── F2 ───────────────────────────────────────────────────────────────────────
const F2_DEF: MbgDef = {
  key: 'f2', no: 2, title: F2.title, short: F2.short,
  steps: [
    { id: 'a', title: 'A. Ketersediaan SOP', sections: [
      { id: 'dok', title: 'Dokumen yang dilihat', fields: [dokumen(F2.dokumen), lampiran()] },
      { id: 'a', title: F2.aTitle, desc: `Pilih salah satu jawaban; ${F2.aRule}`, fields: F2.sop.slice(0, 7).map((l, x) => mbg(`a${x + 1}`, `${x + 1}. ${l}`, 'cek', { required: true }, { k: x + 1, keyBase: `a${x + 1}` })) },
    ] },
    { id: 'b', title: 'B. Sosialisasi SOP', sections: [{ id: 'b', title: F2.bTitle, desc: `Sesuai / Tidak Sesuai: ${F2.bRule}`, fields: F2.sop.map((l, x) => mbg(`b${x + 1}`, `${x + 1}. ${l}`, 'f2b', { required: true, filled: (d) => has(d, `b${x + 1}_sos`) && has(d, `b${x + 1}`) }, { r: x + 1 })) }] },
    { id: 'kes', title: 'Kesimpulan & Rekomendasi', sections: [
      { id: 'kes', title: 'Kesimpulan Pemantauan SOP', fields: [hasil('Kesimpulan Pemantauan SOP', { rule: F2.kesRule })] },
      { id: 'rek', title: 'Rekomendasi', desc: F2.rek, fields: rekFields('rek', (d) => [1, 2, 3, 4, 5, 6, 7].some((r) => d[`a${r}`] === TIDAK) || [1, 2, 3, 4, 5, 6, 7, 8].some((r) => d[`b${r}`] === TIDAK)) },
    ] },
    tinjau,
  ],
}

// ─── F9 ───────────────────────────────────────────────────────────────────────
const F9_DEF: MbgDef = {
  key: 'f9', no: 9, title: F9.title, short: F9.short,
  steps: [
    { id: 'dok', title: 'Dokumen & Standar Porsi', sections: [{ id: 'dok', title: 'Dokumen yang dilihat', fields: [dokumen(F9.dokumen), lampiran(), mbg('_sp', 'STANDAR PORSI/MAKANAN SATUAN PENUKAR (SP)*', 'sptabel')] }] },
    { id: 'sas', title: 'Kelompok Sasaran', sections: [{ id: 'sas', title: 'Kelompok sasaran yang diamati', desc: 'Naskah menyediakan kolom Sasaran 1–3; tambahkan sesuai kelompok sasaran SPPG (boleh lebih atau kurang dari 3).', fields: [
      mbg('sasaran', 'Kelompok sasaran', 'sasaran', { required: true, filled: (d) => sasaranOf(d).length > 0 && sasaranOf(d).every((s) => s.nama) }),
    ] }] },
    ...F9.komponen.map((g) => komponenStep({ no: 9 }, g, 'f9')),
    { id: 'kes', title: 'Kesimpulan & Rekomendasi', sections: [
      { id: 'kes', title: 'Skor & Kesimpulan', desc: F9.rule, fields: [hasil(F9.kesLabel, { skor: F9.skorLabel })] },
      { id: 'rek', title: 'Rekomendasi', desc: REK_HINT, fields: rekFields('rek', (d) => [1, 2, 3, 4, 5, 6].some((k) => f9Item(d, k) === TIDAK)) },
    ] },
    tinjau,
  ],
}

// ─── F12 / F13 ────────────────────────────────────────────────────────────────
const rekapDef = (no: 12 | 13): MbgDef => ({
  key: `f${no}`, no, title: REKAP[no].title, short: REKAP[no].short,
  steps: [
    { id: 'rekap', title: 'Rekapitulasi', desc: 'Nilai setiap aspek diambil otomatis dari kesimpulan formulir sumber yang sudah dikirim (tidak diisi ulang).', sections: [
      { id: 'rekap', title: REKAP[no].title, fields: [mbg('_rekap', 'Aspek', 'rekap', {}, { no })] },
      { id: 'cat', title: 'Catatan', fields: [{ key: 'catatan', label: 'Catatan (opsional)', type: 'textarea', maxLen: 1000, wide: true }] },
    ] },
    tinjau,
  ],
})

export const FORM_DEFS: Record<number, MbgDef> = {
  1: F1_DEF, 2: F2_DEF, 9: F9_DEF, 12: rekapDef(12), 13: rekapDef(13),
  ...Object.fromEntries(CEK_NASKAH.map((c) => [c.no, cekDef(c)])),
}
export const defFor = (key: string): MbgDef | null => (key === 'identitas' ? IDENTITAS : /^f(\d{1,2})$/.test(key) ? FORM_DEFS[Number(key.slice(1))] || null : null)

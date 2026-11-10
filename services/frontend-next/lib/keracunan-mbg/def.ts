// PR 034: definisi wizard Keracunan Pangan MBG — 113 isian form-mbg SKDR Kemkes diringkas menjadi 6 langkah.
// Hanya 4 isian wajib (sama seperti form resmi: tanggal kejadian, provinsi, jumlah kasus, jumlah meninggal) → "Laporan Cepat" bisa
// dikirim dari langkah 1; langkah lain boleh dilengkapi bertahap setelah laporan masuk (update, hasil lab, dst).
import type { Data, FieldDef, SectionDef, StepDef } from '@/lib/laporan/engine'
import { USIA } from './rules'

const n = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'number', ...extra })
const t = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'text', maxLen: 200, ...extra })
const ta = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'textarea', maxLen: 500, ...extra })
const m = (key: string, label: string, kind: string, p: Record<string, any> = {}, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'mbg', mbg: { kind, ...p }, ...extra })
const ch = (key: string, label: string, options: string[], extra: Partial<FieldDef> = {}) => m(key, label, 'chips', { options }, extra)
const YT = ['Ya', 'Tidak']
const sec = (id: string, title: string, fields: FieldDef[], extra: Partial<SectionDef> = {}): SectionDef => ({ id, title, fields, ...extra })

export const KP_STEPS: StepDef[] = [
  {
    id: 's1', title: 'Laporan Cepat', desc: 'Cukup 4 isian bertanda * untuk mengirim laporan cepat. Isian lain dapat dilengkapi kemudian.',
    sections: [
      sec('wajib', 'Kejadian', [
        m('tgl_kejadian', 'Tanggal & jam kejadian', 'datetime', { now: true }, { required: true }),
        { key: 'provinsi_id', label: 'Provinsi', type: 'province', required: true, resets: ['kabkota_id', 'kecamatan', 'kecamatan_nama'] },
        { key: 'kabkota_id', label: 'Kab/Kota', type: 'kabkota', depends: 'provinsi_id', direct: 'provinsi_id', resets: ['kecamatan', 'kecamatan_nama'], hint: 'Bisa langsung dicari — provinsi terisi otomatis' },
        n('jumlah_kasus', 'Jumlah kasus (sakit)', { required: true, stepper: true }),
        n('jumlah_meninggal', 'Jumlah meninggal', { required: true, stepper: true, hint: 'Isi 0 bila tidak ada' }),
        m('_ringkas', 'Dihitung otomatis', 'hasil', { compact: true }, { wide: true }),
      ], { tone: 'accent', desc: 'Isian wajib form resmi (no. 7, 10, 15, 16)' }),
      sec('lokasi', 'Lokasi & SPPG', [
        { key: 'kecamatan', label: 'Kecamatan', type: 'kecamatan', depends: 'kabkota_id' },
        t('desa', 'Desa/Kelurahan'),
        m('nama_sppg', 'Nama SPPG', 'sppg', {}, { hint: 'Ketik untuk mencari SPPG dari laporan/pengawasan sebelumnya — yayasan & kode terisi otomatis' }),
        t('yayasan_sppg', 'Yayasan SPPG'),
        t('kode_sppg', 'Kode SPPG'),
      ]),
      sec('waktu', 'Waktu makan & gejala', [
        m('jam_makan', 'Tanggal & jam makan (MBG)', 'datetime'),
        m('jam_gejala', 'Tanggal & jam gejala pertama', 'datetime'),
        m('_inkubasi', 'Perkiraan masa inkubasi', 'inkubasi', {}, { wide: true }),
      ], { desc: 'Selisih keduanya menjadi saran masa inkubasi di langkah 2' }),
      sec('sekolah', 'Sekolah / penerima MBG', [m('sekolah', 'Daftar sekolah', 'sekolah', {}, { wide: true })],
        { desc: 'Satu baris per sekolah. Total porsi dipakai sebagai jumlah terpapar bila Jumlah terpapar tidak diisi.' }),
      sec('pelapor', 'Petugas pelapor', [
        t('pelapor_nama', 'Nama petugas pelapor'),
        { key: 'pelapor_hp', label: 'No. HP', type: 'tel', maxLen: 20, placeholder: '08…' },
        t('pelapor_email', 'Email'),
      ]),
    ],
  },
  {
    id: 's2', title: 'Kasus & Gejala', desc: 'Rincian kasus. Angka yang tidak cocok dengan jumlah kasus hanya memberi peringatan, kecuali melebihi total.',
    sections: [
      sec('rawat', 'Perawatan', [
        n('rawat_inap', 'Rawat inap'), n('rawat_jalan', 'Rawat jalan'), n('sembuh', 'Sembuh/pulang'),
        m('_sum_rawat', 'Cek jumlah', 'sum', { keys: ['rawat_inap', 'rawat_jalan', 'sembuh', 'jumlah_meninggal'], label: 'Inap + jalan + sembuh + meninggal' }, { wide: true }),
      ]),
      sec('paparan', 'Paparan', [
        n('jumlah_terpapar', 'Jumlah terpapar (yang makan)', { hint: 'Kosongkan untuk memakai total porsi sekolah' }),
        n('kloter', 'Jumlah kloter pengantaran'), n('jumlah_sekolah', 'Jumlah sekolah terdampak'),
        m('_ar', 'Attack rate & CFR', 'hasil', {}, { wide: true }),
      ]),
      sec('demografi', 'Jenis kelamin & umur', [
        n('pria', 'Laki-laki'), n('wanita', 'Perempuan'),
        m('_sum_jk', 'Cek jumlah', 'sum', { keys: ['pria', 'wanita'], label: 'Laki-laki + perempuan' }, { wide: true }),
        ...USIA.map(([k, l]) => n(k, `Usia ${l}`)),
        m('_sum_usia', 'Cek jumlah', 'sum', { keys: USIA.map(([k]) => k), label: 'Total kelompok umur' }, { wide: true }),
        n('balita', 'Balita'), n('ibu_hamil', 'Ibu hamil'), n('ibu_menyusui', 'Ibu menyusui'),
      ]),
      sec('gejala', 'Gejala', [m('gejala', 'Gejala yang dialami', 'gejala', {}, { wide: true })], { desc: 'Centang gejala lalu isi jumlah kasusnya; persentase dihitung otomatis.' }),
      sec('inkubasi', 'Masa inkubasi (jam)', [
        { key: 'inkubasi_min', label: 'Terpendek', type: 'decimal', unit: 'jam' }, { key: 'inkubasi_max', label: 'Terpanjang', type: 'decimal', unit: 'jam' },
        { key: 'inkubasi_rata', label: 'Rata-rata', type: 'decimal', unit: 'jam' }, { key: 'inkubasi_median', label: 'Median', type: 'decimal', unit: 'jam' },
        m('_inkubasi2', 'Saran dari jam makan → gejala', 'inkubasi', { apply: true }, { wide: true }),
      ]),
    ],
  },
  {
    id: 's3', title: 'Menu & Penanganan', desc: 'Menu MBG yang disantap dan penanganan kasus.',
    sections: [
      sec('menu', 'Menu yang dikonsumsi', [t('menu_karbo', 'Karbohidrat'), t('menu_protein1', 'Protein 1 (hewani)'), t('menu_protein2', 'Protein 2 (nabati)'), t('menu_sayur', 'Sayur'), t('menu_buah', 'Buah/susu')]),
      sec('tangani', 'Penanganan', [
        t('faskes', 'Faskes penanganan kasus', { placeholder: 'mis. Puskesmas X, RSUD Y' }),
        ta('diagnosa_banding', 'Diagnosa banding', { wide: true }),
        m('_saran', 'Saran diagnosa banding', 'saran', {}, { wide: true }),
      ]),
    ],
  },
  {
    id: 's4', title: 'Kesehatan Lingkungan', desc: 'Hasil penyelidikan di SPPG. Semua opsional — isi yang sudah diperiksa.',
    sections: [
      sec('sppg', 'Status SPPG & petugas', [
        ch('slhs', 'Sertifikat SLHS-SPPG', YT), ch('ikl', 'Hasil Inspeksi Kesehatan Lingkungan (IKL)', ['Memenuhi Syarat', 'Tidak Memenuhi Syarat']),
        m('_petugas', 'Jumlah petugas SPPG', 'petugas', {}, { wide: true }),
      ]),
      sec('air', 'Sumber air', [m('sumber_air', 'Sumber air yang digunakan', 'rows', { cols: [{ k: 'sumber', l: 'Sumber', opt: 'sumber_air' }, { k: 'keperluan', l: 'Keperluan (masak, cuci, minum…)' }], add: 'Tambah sumber air' }, { wide: true })]),
      sec('sop', 'Standar Operasional Prosedur (26 SOP)', [m('sop', 'SOP', 'sop', {}, { wide: true })], { desc: 'Klik Ada/Tidak Ada dan Dilakukan/Tidak Dilakukan untuk setiap SOP.' }),
      sec('bangunan', 'Bangunan & pencucian', [
        ta('bangunan_gambar', 'Gambaran umum bangunan'), ta('bangunan_tata_letak', 'Tata letak ruang'),
        ta('cuci_tempat', 'Tempat pencucian peralatan'), ta('cuci_proses', 'Proses pencucian'), ta('cuci_pengeringan', 'Pengeringan peralatan'), n('cuci_petugas', 'Petugas pencucian'),
      ]),
      sec('penjamah', 'Penjamah pangan', [
        n('penjamah_total', 'Total penjamah pangan'), n('penjamah_sertifikasi', 'Tersertifikasi/terlatih'), m('_pct', 'Persentase terlatih', 'pct', {}, { wide: true }),
        ta('penjamah_kesehatan', 'Kondisi kesehatan penjamah'), ta('penjamah_pemeriksaan', 'Pemeriksaan kesehatan rutin'), ta('penjamah_apd', 'Kepatuhan penggunaan APD'),
      ]),
      sec('bahan', 'Bahan pangan & penyimpanan', [
        ta('bahan_supplier', 'Supplier bahan pangan'), ta('bahan_kondisi', 'Kondisi bahan pangan'),
        { key: 'bahan_suhu', label: 'Suhu bahan pangan', type: 'decimal', unit: '°C' }, n('bahan_jumlah', 'Jumlah jenis bahan'),
        { key: 'simpan_suhu', label: 'Suhu tempat penyimpanan', type: 'decimal', unit: '°C' }, ta('simpan_jenis', 'Jenis bahan yang disimpan'),
        ta('simpan_pemisahan', 'Pemisahan penyimpanan'), ta('simpan_keadaan', 'Keadaan tempat penyimpanan'), ta('simpan_wadah', 'Wadah bahan pangan'),
      ]),
      sec('angkut', 'Pengangkutan', [
        ta('angkut_kebersihan', 'Kebersihan alat angkut'), ta('angkut_frekuensi', 'Frekuensi pembersihan'),
        ch('angkut_box_sekat', 'Mobil box dengan sekat', YT), ch('angkut_box_tanpa', 'Mobil box tanpa sekat', YT), ch('angkut_motor', 'Motor', YT),
        t('angkut_lain', 'Kendaraan lain'), ch('angkut_lain_status', 'Kendaraan lain digunakan', YT, { visible: (d: Data) => !!d.angkut_lain, child: true }),
      ]),
      sec('jadwal', 'Pengolahan, pemorsian, distribusi & penyajian', [
        m('jadwal_olah', 'Jadwal pengolahan', 'rows', { cols: [{ k: 'ket', l: 'Keterangan/menu' }, { k: 'waktu', l: 'Waktu', time: true }, { k: 'porsi', l: 'Porsi', num: true }], add: 'Tambah baris' }, { wide: true }),
        ta('cara_olah', 'Cara pengolahan', { wide: true }),
        m('jadwal_porsi', 'Pemorsian', 'rows', { cols: [{ k: 'ket', l: 'Keterangan' }, { k: 'waktu', l: 'Waktu', time: true }, { k: 'porsi', l: 'Porsi', num: true }], add: 'Tambah baris' }, { wide: true }),
        m('jadwal_distribusi', 'Pendistribusian', 'rows', { cols: [{ k: 'ket', l: 'Tujuan' }, { k: 'rute', l: 'Rute' }, { k: 'kendaraan', l: 'Kendaraan' }, { k: 'waktu', l: 'Waktu', time: true }, { k: 'porsi', l: 'Porsi', num: true }], add: 'Tambah baris' }, { wide: true }),
        m('jadwal_saji', 'Penyajian di sekolah', 'rows', { cols: [{ k: 'ket', l: 'Sekolah' }, { k: 'organoleptik', l: 'Uji organoleptik', yt: true }, { k: 'himbauan', l: 'Himbauan', yt: true }, { k: 'waktu', l: 'Waktu', time: true }, { k: 'porsi', l: 'Porsi', num: true }], add: 'Tambah baris' }, { wide: true }),
        ch('bank_sampel', 'Ada bank sampel makanan', YT),
      ]),
      sec('sampah', 'Sampah & limbah', [
        n('sampah_kapasitas', 'Kapasitas tempat sampah (liter)'), ch('sampah_tipe', 'Tipe tempat sampah', ['Terbuka', 'Tertutup']),
        ch('sampah_lokasi', 'Lokasi penampungan', ['di Dalam Gedung', 'di Luar Gedung']), ta('sampah_jarak', 'Jarak tempat sampah dari dapur'),
        n('sampah_frekuensi', 'Pengambilan sampah (kali/minggu)'), ta('saluran_limbah', 'Keadaan saluran limbah'),
        ch('limbah_pencatatan', 'Ada pencatatan limbah sisa makanan harian', YT), ta('limbah_meningkat', 'Limbah sisa makanan pada hari kejadian'),
      ]),
      sec('aduan', 'Pengaduan', [
        ch('aduan_hari_h', 'Ada pengaduan dari sekolah pada hari H', YT), ta('aduan_kondisi', 'Kondisi pangan yang tidak sesuai'),
        ta('aduan_alur', 'Alur pengaduan'), ta('aduan_kompensasi', 'Kompensasi'),
      ]),
    ],
  },
  {
    id: 's5', title: 'Laboratorium', desc: 'Isi saat sampel dikirim — status otomatis menjadi Menunggu Lab, lalu Hasil Lab setelah hasil diisi.',
    sections: [
      sec('lab', 'Pengiriman sampel', [
        t('lab_nama', 'Laboratorium tujuan', { placeholder: 'mis. BBLKM / Labkesda' }),
        m('_labstatus', 'Status laboratorium', 'labstatus'),
        m('lab_tgl_ambil', 'Sampel diambil', 'datetime'), m('lab_tgl_kirim', 'Sampel dikirim', 'datetime'), m('lab_tgl_hasil', 'Hasil keluar', 'datetime'),
      ]),
      sec('sampel', 'Sampel & hasil', [
        m('sampel', 'Daftar sampel', 'rows', { cols: [{ k: 'kategori', l: 'Kategori', opt: 'sampel_kategori' }, { k: 'sampel', l: 'Sampel (mis. nasi, ayam)' }, { k: 'sumber', l: 'Asal' }, { k: 'mikro', l: 'Mikrobiologi', opt: 'hasil_lab' }, { k: 'kimia', l: 'Kimia', opt: 'hasil_lab' }], add: 'Tambah sampel', quick: 'sampel_kategori' }, { wide: true }),
        m('_lamp_lab', 'File hasil laboratorium', 'lampiran', { kategori: 'lab' }, { wide: true }),
      ]),
    ],
  },
  {
    id: 's6', title: 'Lampiran & Kirim', desc: 'Lampirkan dokumentasi, tinjau ringkasan, lalu kirim.',
    sections: [
      sec('lampiran', 'Lampiran', [
        m('_lamp_umum', 'Dokumen pendukung (laporan, foto lokasi)', 'lampiran', { kategori: 'umum' }, { wide: true }),
        m('_lamp_gejala', 'Dokumentasi gejala/kasus', 'lampiran', { kategori: 'gejala' }, { wide: true }),
        ta('catatan', 'Catatan tambahan', { wide: true }),
      ]),
    ],
  },
]

export const STEP_IDS = KP_STEPS.map((s) => s.id)

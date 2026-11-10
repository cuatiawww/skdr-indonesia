// PR 033: Pengawasan Gizi MBG — teks butir penilaian Formulir 1–13 dikutip dari naskah formulir (spreadsheet tim gizi).
// Perbaikan salin-tempel yang disengaja (lihat docs/PR/033-pengawasan-gizi-mbg.md):
//  * F4: baris duplikat "1.2./1.1./1.2. Cara perhitungan …" bukan butir penilaian → 13 butir unik (pembagi 13)
//  * F5 butir 3: "Pokopk" → "Pokok"
//  * F7: pembagi /4 → /5 (ada 5 butir); judul kesimpulan "Penyimpanan" → "Persiapan Bahan Pangan"
//  * F11: "di sekolah … guru" → "di Posyandu … kader"; kolom "Baik / Kurang" → "Sesuai / Tidak Sesuai"
//  * F13: kesimpulan "sudah" → "baik"

export interface Item { k: number; label: string; note?: string }
export interface Komponen { step: string; kode: string; title: string; items: Item[] }

export interface CekNaskah {
  no: number
  title: string
  short: string
  dokumen: string[]
  komponen: Komponen[]
  skorLabel: string
  kesLabel: string
  header?: { key: string; label: string }[]
  sisa?: boolean
  alergi?: boolean
  /** F7: unggah foto per butir */
  foto?: boolean
}

export const REK_HINT = 'Lakukan perbaikan pada : (tuliskan rekomendasi berdasarkan hasil yang "tidak sesuai")'
export const SKOR_RULE = 'sesuai dengan standar gizi apabila skor ≥ 80'

const sisaItems = (start: number): Item[] => [
  { k: start, label: 'Rerata sisa makanan pokok dari 5 sampel < 20%' },
  { k: start + 1, label: 'Rerata sisa makanan Lauk Protein Hewani dari 5 sampel < 20%' },
  { k: start + 2, label: 'Rerata sisa makanan Lauk Nabati dari 5 sampel < 20%' },
  { k: start + 3, label: 'Rerata sisa makanan Sayur dari 5 sampel < 20%' },
  { k: start + 4, label: 'Rerata sisa makanan Buah dari 5 sampel < 20%' },
]
export const SISA_JENIS = ['Makanan pokok', 'Lauk hewani', 'Lauk nabati', 'Sayur', 'Buah']
export const SISA_RULE = 'Cara menghitung rerata sisa makanan : sesuai apabila 3 sampel atau lebih sisa makanannya <20%'

export const CEK_NASKAH: CekNaskah[] = [
  {
    no: 3, title: 'Formulir 3. Pengawasan Penerapan SOP Perencanaan menu', short: 'Perencanaan Menu',
    dokumen: ['Master menu', 'Standar resep', 'Standar porsi'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Master menu', items: [
        { k: 1, label: 'Tersedia Master Menu' },
        { k: 2, label: 'Menu sudah divalidasi oleh Petugas Puskesmas' },
        { k: 3, label: 'Menu memiliki siklus' },
        { k: 4, label: 'Menu beragam (bahan makanan pokok, lauk hewani, lauk nabati, sayur, buah)' },
        { k: 5, label: 'Menu yang berlaku tidak menggunakan Ultra Process Food' },
        { k: 6, label: 'Menu yang berlaku tidak menggunakan produk susu UHT berperisa, minuman rasa susu' },
        { k: 7, label: 'Menu diinformasikan kepada orang tua/wali murid (untuk sasaran anak sekolah yang memiliki alergi, intoleransi dan disabilitas) melalui pihak Sekolah dan Tim Pembina Posyandu (untuk sasaran kelompok 3B)' },
      ] },
      { step: 'kB', kode: 'B', title: 'Resep & standar porsi', items: [
        { k: 8, label: 'Resep tersedia sesuai siklus menu' },
        { k: 9, label: 'Resep memiliki ukuran standar porsi bahan pangan sesuai kelompok penerima manfaat' },
        { k: 10, label: 'Resep memiliki nilai gizi' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Perencanaan Menu = (jumlah jawaban "sesuai"/10)x 100', kesLabel: 'Kesimpulan : Perencanaan Menu', alergi: true,
  },
  {
    no: 4, title: 'Formulir 4. Pengawasan Penerapan SOP Pemesanan Bahan Pangan', short: 'Pemesanan Bahan Pangan',
    dokumen: ['Formulir pemesanan bahan makanan', 'Spesifikasi bahan pangan', 'Data jumlah sasaran', 'Data stok bahan pangan'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Dokumen Pemesanan Bahan Pangan', items: [
        { k: 1, label: 'Terdapat Formulir Pemesanan Bahan Pangan yang sudah berjalan' },
        { k: 2, label: 'Formulir Pemesanan Bahan Pangan divalidasi oleh Pengawas Gizi dan Kepala SPPG' },
        { k: 3, label: 'Terdapat spesifikasi seluruh kelompok bahan pangan (makanan pokok, bahan pangan hewani, bahan pangan nabati, sayuran, buah dan bahan pangan lainnya misalnya bumbu, tepung panir dll)' },
        { k: 4, label: 'Terdapat data jumlah sasaran' },
        { k: 5, label: 'Terdapat data stok bahan pangan' },
      ] },
      { step: 'kB', kode: 'B', title: 'Perhitungan kebutuhan bahan pangan hewani sesuai kelompok sasaran', items: [
        { k: 6, label: 'Jumlah Bahan Pangan Hewani yang dipesan mempertimbangkan jumlah sasaran' },
        { k: 7, label: 'Jumlah Bahan Pangan Hewani yang dipesan mempertimbangkan spesifikasi bahan pangan' },
        { k: 8, label: 'Jumlah Bahan Pangan Hewani yang dipesan mempertimbangkan sisa stok bahan pangan' },
        { k: 9, label: 'Jumlah Bahan Pangan Hewani yang dipesan mempertimbangkan standar porsi' },
      ] },
      { step: 'kC', kode: 'C', title: 'Perhitungan kebutuhan bahan pangan nabati sesuai kelompok sasaran', items: [
        { k: 10, label: 'Jumlah Bahan Pangan Nabati yang dipesan mempertimbangkan jumlah sasaran' },
        { k: 11, label: 'Jumlah Bahan Pangan Nabati yang dipesan mempertimbangkan spesifikasi bahan pangan' },
        { k: 12, label: 'Jumlah Bahan Pangan Nabati yang dipesan mempertimbangkan sisa stok bahan pangan' },
        { k: 13, label: 'Jumlah Bahan Pangan Nabati yang dipesan mempertimbangkan standar porsi' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Pemesanan Bahan Pangan = (jumlah jawaban "sesuai"/13)x 100', kesLabel: 'Kesimpulan : Pemesanan Bahan Pangan',
  },
  {
    no: 5, title: 'Formulir 5. Pengawasan Penerapan SOP Penerimaan Bahan Pangan', short: 'Penerimaan Bahan Pangan',
    dokumen: ['Dokumen penerimaan bahan pangan (formulir pemesanan pembelian/nota surat jalan)', 'Berita acara penerimaan bahan pangan'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Prosedur Penerimaan Bahan Pangan', items: [
        { k: 1, label: 'Terdapat dokumen Penerimaan Bahan Pangan (formulir pemesanan pembelian, nota dari pihak rekanan/surat jalan dari rekanan, dan sebagainya)' },
        { k: 2, label: 'Terdapat pencatatan Berita Acara Penerimaan Bahan Pangan atau catatan sejenis lainnya yang divalidasi oleh Pengawas Gizi dan atau pihak yang berwenang sesuai SOP' },
        { k: 3, label: 'Pencatatan Penerimaan Bahan Pangan memuat seluruh kebutuhan Bahan Pangan Makanan Pokok, Lauk Hewani, Lauk Nabati, Sayur dan Buah' },
      ] },
      { step: 'kB', kode: 'B', title: 'Tindakan koreksi apabila ada ketidaksesuaian', items: [
        { k: 4, label: 'Jumlah dan kualitas bahan pangan makanan pokok yang diterima sesuai dengan surat pesanan. Jika tidak sesuai, ada tindakan koreksi yang dilakukan',
          note: 'contoh tindakan koreksi: jika bahan pangan yang dipesan datang tidak sesuai spesifikasi, pengawas gizi menolak dan minta rekanan untuk segera mengirimkan kembali bahan pangan yang sesuai spesifikasi jika bahan pangan yang dipesan datang dengan jumlah tidak sesuai pesanan, pengawas gizi meminta rekanan untuk segera mengirim kekurangannya. jika bahan pangan yang dipesan tidak tersedia, pengawas gizi meminta rekanan untuk membawakan bahan pangan lain yang setara sebagai pengganti . misalnya jika daging sapi tidak tersedia, dapat diganti dengan daging ayam;' },
        { k: 5, label: 'Jumlah dan kualitas bahan pangan Lauk Hewani yang diterima sesuai dengan surat pesanan. Jika tidak sesuai, ada tindakan koreksi yang dilakukan' },
        { k: 6, label: 'Jumlah dan kualitas bahan pangan Lauk Nabati yang diterima sesuai dengan surat pesanan Jika tidak sesuai, ada tindakan koreksi yang dilakukan' },
        { k: 7, label: 'Jumlah dan kualitas bahan pangan Sayuran yang diterima sesuai dengan surat pesanan Jika tidak sesuai, ada tindakan koreksi yang dilakukan' },
        { k: 8, label: 'Jumlah dan kualitas bahan pangan Buah yang diterima sesuai dengan surat pesanan Jika tidak sesuai, ada tindakan koreksi yang dilakukan' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Penerimaan Bahan Pangan = (jumlah jawaban "sesuai"/8)x 100', kesLabel: 'Kesimpulan : Penerimaan Bahan Pangan',
  },
  {
    no: 6, title: 'Formulir 6. Pengawasan Penerapan SOP Penyimpanan Bahan Pangan', short: 'Penyimpanan Bahan Pangan',
    dokumen: ['Catatan pemantauan suhu dan kelembaban', 'PMK 2 Tahun 2023 tentang Kesehatan Lingkungan'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Observasi Penyimpanan Bahan Pangan sesuai Standar Gizi', items: [
        { k: 1, label: 'Bahan Pangan Pokok tersimpan dalam ruangan dan suhu yang sesuai dan tidak tercampur bahan pangan lain' },
        { k: 2, label: 'Bahan Pangan Hewani tersimpan dalam suhu yang sesuai dan tidak tercampur bahan pangan lain' },
        { k: 3, label: 'Bahan Pangan Nabati tersimpan dalam suhu yang sesuai dan tidak tercampur bahan pangan lain' },
        { k: 4, label: 'Bahan Pangan Sayuran tersimpan dalam suhu yang sesuai dan tidak tercampur bahan pangan lain' },
        { k: 5, label: 'Bahan Pangan Buah tersimpan dalam suhu yang sesuai dan tidak tercampur bahan pangan lain' },
        { k: 6, label: 'Seluruh bahan pangan kering yang disimpan memiliki label tanggal penyimpanan dan/ atau label Expired Date' },
      ] },
      { step: 'kB', kode: 'B', title: 'Pemantauan suhu dan kelembapan', items: [
        { k: 7, label: 'Terdapat dokumen pemantauan suhu dan kelembaban pada ruangan penyimpanan dan alat pendingin bahan pangan' },
        { k: 8, label: 'Dokumen pencatatan suhu dan kelembaban divalidasi Pengawas Gizi' },
        { k: 9, label: 'Terdapat tindakan koreksi bila terjadi kegagalan fungsi alat pendingin atau mati listrik (wawancarai petugas)' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Penyimpanan Bahan Pangan = (jumlah jawaban "sesuai"/9)x 100', kesLabel: 'Kesimpulan : Penyimpanan Bahan Pangan',
  },
  {
    no: 7, title: 'Formulir 7 Pengawasan Penerapan SOP Persiapan Bahan Pangan', short: 'Persiapan Bahan Pangan',
    dokumen: ['Foto potongan bahan pangan hewani', 'Foto potongan pangan nabati', 'Foto potongan sayuran', 'Foto potongan buah'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Pengecekan dokumentasi potongan lauk hewani, lauk nabati, buah dan sayur dengan standar porsi', items: [
        { k: 1, label: 'Foto potongan lauk hewani dengan standar porsi' },
        { k: 2, label: 'Foto potongan lauk nabati dengan standar porsi' },
        { k: 3, label: 'Foto potongan buah dengan standar porsi' },
        { k: 4, label: 'Foto potongan sayur dengan standar porsi' },
        { k: 5, label: 'Foto bentuk potongan sayuran untuk sasaran balita/TK/PAUD lebih kecil dari sasaran lainnya' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Persiapan Bahan Pangan = (jumlah jawaban "sesuai"/5)x 100', kesLabel: 'Kesimpulan : Persiapan Bahan Pangan', foto: true,
  },
  {
    no: 8, title: 'Formulir 8 Pengawasan Penerapan SOP Pengolahan Bahan Pangan', short: 'Pengolahan Bahan Pangan',
    dokumen: ['Dokumen uji organoleptik', 'Dokumen pemantauan suhu dan waktu pengolahan'],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Pengecekan dokumen Uji Organoleptik', items: [
        { k: 1, label: 'Tersedia dokumen uji organoleptik makanan pokok dalam 3 bulan terakhir' },
        { k: 2, label: 'Tersedia dokumen uji organoleptik lauk hewani dalam 3 bulan terakhir' },
        { k: 3, label: 'Tersedia dokumen uji organoleptik lauk nabati dalam 3 bulan terakhir' },
        { k: 4, label: 'Tersedia dokumen uji organoleptik sayuran dalam 3 bulan terakhir' },
      ] },
      { step: 'kB', kode: 'B', title: 'Pengecekan dokumen / wawancara pemantauan suhu dan waktu pengolahan', items: [
        { k: 5, label: 'Tersedia dokumen pemantauan suhu pengolahan dan tervalidasi' },
        { k: 6, label: 'Tersedia dokumen pemantauan waktu pengolahan dan tervalidasi' },
        { k: 7, label: 'Lama waktu maksimal dari selesai proses pengolahan sampai selesai pemorsian ≤ 2 jam (cek dengan sampling saat kunjungan)' },
      ] },
    ],
    skorLabel: 'Skor Penerapan SOP Pengolahan Bahan Pangan = (jumlah jawaban "sesuai"/7)x 100', kesLabel: 'Kesimpulan : Pengolahan Bahan Pangan',
  },
  {
    no: 10, title: 'Formulir 10 Pengawasan Daya Terima MBG Anak Sekolah', short: 'Daya Terima Anak Sekolah',
    dokumen: ['Dokumen uji organoleptik di sekolah'],
    header: [{ key: 'nama_sekolah', label: 'Nama Sekolah' }, { key: 'nama_guru', label: 'Nama Guru Pendamping' }],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Dokumen uji organoleptik oleh pihak sekolah', items: [
        { k: 1, label: 'Tersedia dokumen uji organoleptik setelah MBG sampai di sekolah' },
        { k: 2, label: 'Dokumen uji organoleptik MBG di sekolah tervalidasi guru yang bertugas sesuai prosedur' },
      ] },
      { step: 'kB', kode: 'B', title: 'Daya Terima MBG', items: sisaItems(3) },
    ],
    skorLabel: 'Skor Daya Terima MBG = (jumlah jawaban "sesuai"/7)x 100', kesLabel: 'Kesimpulan : Daya Terima MBG Anak Sekolah', sisa: true,
  },
  {
    no: 11, title: 'Formulir 11 Pengawasan Daya Terima MBG Ibu Hamil, Ibu Menyusui, dan Balita', short: 'Daya Terima Sasaran Posyandu',
    dokumen: ['Dokumen uji organoleptik di Posyandu'],
    header: [{ key: 'nama_posyandu', label: 'Nama Posyandu' }, { key: 'nama_kader', label: 'Nama Kader Pendamping' }],
    komponen: [
      { step: 'kA', kode: 'A', title: 'Dokumen uji organoleptik oleh kader Posyandu', items: [
        { k: 1, label: 'Tersedia dokumen uji organoleptik setelah MBG sampai di Posyandu' },
        { k: 2, label: 'Dokumen uji organoleptik MBG di Posyandu tervalidasi kader yang bertugas sesuai prosedur' },
      ] },
      { step: 'kB', kode: 'B', title: 'Daya Terima MBG', items: sisaItems(3) },
    ],
    skorLabel: 'Skor Daya Terima MBG = (jumlah jawaban "sesuai"/7)x 100', kesLabel: 'Kesimpulan : Daya Terima MBG Ibu Hamil, Ibu Menyusui, dan Balita', sisa: true,
  },
]

export const ALERGI_Q = 'Tanyakan apakah ada sasaran yang alergi makanan, bila Ya pastikan pengawas gizi mengetahui jenis alergi dan mempertimbangkan dalam perencanaan menu nya (misalnya memisahkan menu khusus untuk sasaran yang memiliki alergi, dan mempertimbangkan penggunaan bahan makanan yang aman) Ini tidak masuk dalam penilaian namun perlu menjadi perhatian'

// ─── F9 Pemorsian ─────────────────────────────────────────────────────────────
export const F9 = {
  title: 'Formulir 9 Pengawasan Penerapan SOP Pemorsian Makanan', short: 'Pemorsian Makanan',
  dokumen: ['Standar porsi', 'Daftar Bahan Makanan Penukar', 'Pedoman Standar Gizi Program MBG'],
  komponen: [
    { step: 'kA', kode: 'A', title: 'Observasi pemorsian makanan di ruang pemorsian (SPPG memberikan contoh satu set makanan lengkap)', items: [
      { k: 1, label: 'Tersedia sampel/contoh satu set MBG yang siap didistribusikan' },
    ] },
    { step: 'kB', kode: 'B', title: 'Kesesuaian porsi makanan dengan standar porsi setiap kelompok sasaran', items: [
      { k: 2, label: 'Ukuran porsi makanan pokok sampel/contoh dalam satu set makanan sesuai dengan standar porsi' },
      { k: 3, label: 'Ukuran porsi lauk hewani sampel/contoh dalam satu set makanan sesuai dengan standar porsi' },
      { k: 4, label: 'Ukuran porsi lauk nabati sampel/contoh satu set makanan sesuai dengan standar porsi' },
      { k: 5, label: 'Ukuran porsi sayur sampel/contoh dalam satu set makanan sesuai dengan standar porsi' },
      { k: 6, label: 'Ukuran porsi buah sampel/contoh satu set dalam satu set makanan sesuai dengan standar porsi' },
    ] },
  ] as Komponen[],
  rule: 'Sesuai / Tidak Sesuai (sesuai apabila sasaran 1,2 dan3 sesuai)',
  skorLabel: 'Skor Penerapan SOP Pemorsian Makanan = (jumlah jawaban "sesuai"/6)x 100', kesLabel: 'Kesimpulan : Pemorsian Makanan',
}
/** STANDAR PORSI/MAKANAN SATUAN PENUKAR (SP)* — * SP --> Mengacu pada Daftar Bahan Makanan Penukar */
export const SP_KELOMPOK = ['Balita', 'Anak Usia PAUD/TK/RA', 'Anak Usia SD Kelas 1 – 3', 'Anak Usia SD kelas 4 – 6', 'Anak Usia SMP', 'Anak Usia SMA', 'Ibu Hamil', 'Ibu Menyusui']
export const SP_TABEL: { pangan: string; nilai: string[] }[] = [
  { pangan: 'Sumber karbohidrat (Makanan Pokok)', nilai: ['80 gr', '80 gr', '100 gr', '175 gr', '200 gr', '200 gr', '250gr', '250gr'] },
  { pangan: 'Protein hewani', nilai: ['1p', '1p', '1p', '1,5p', '1,5 p', '2p', '2p', '2p'] },
  { pangan: 'Protein nabati', nilai: ['0,25p', '0,25p', '0,25p', '0,5p', '1p', '1p', '1p', '1p'] },
  { pangan: 'Sayur', nilai: ['0,25p', '0,25p', '0,5p', '0,5p', '0,5p', '1p', '1p', '1p'] },
  { pangan: 'Buah', nilai: ['1p', '1p', '1p', '1p', '1p', '1p', '1p', '1p'] },
]

// ─── F1 Ketenagaan ────────────────────────────────────────────────────────────
export const F1 = {
  title: 'Formulir 1. Pengawasan Standar Gizi - Ketenagaan', short: 'Ketenagaan',
  a1: ['D3 Gizi', 'D4 Gizi', 'S1 Gizi', 'S1 Kesehatan Masyarakat', 'S1 Teknologi Pangan', 'D3/D4/S1 Boga atau Manajemen Industri Jasa Makanan dan Gizi', 'Lainnya (tulis pada kolom keterangan jenis pendidikannya)'],
  a1Rule: 'sesuai apabila minimal ada 1 pengawas gizi dengan kualifikasi pendidikan 1/2/3/4/5/6',
  a2: ['Pelatihan standar gizi MBG', 'Pelatihan penyelenggaraan makanan/ keamanan pangan'],
  a2Rule: 'sesuai apabila pengawas gizi sudah mendapatkan pelatihan 1 dan 2',
  aRule: 'sesuai apabila kesimpulan A.1 dan A.2 = "sesuai" - tidak sesuai apabila terdapat minimal satu kesimpulan yang tidak sesuai',
  b1: ['S1 / D4 Jurusan Boga atau sejenis', 'D3 Jurusan Boga atau sejenis', 'SMK Jurusan Boga/sejenis', 'D3/D4/S1 Jurusan lain', 'SD/SMP/SMA'],
  b1Rule: 'sesuai apabila minimal ada 47 orang penjamah makanan',
  b1Catatan: ['25 orang (penerima manfaat 751 - 999)', '21 orang (penerima manfaat 501 - 750)', '18 orang (penerima manfaat 250 - 500)', '15 orang (penerima manfaat < 250 orang)'],
  b2: ['Pelatihan/pembekalan/sosialisasi tentang standar gizi dan keamanan pangan', 'Pelatihan memasak/kuliner', 'Pelatihan standar porsi'],
  b2Lain: 'Pelatihan lainnya terkait penyelenggaraan makanan (sebutkan pada kolom di bawah ini )',
  b2Rule: 'sesuai apabila minimal 50% penjamah makanan sudah mendapatkan pelatihan standar gizi dan keamanan pangan (baris a kolom 4)',
  b2Bukti: 'Sertifikat atau Bukti dokumen (Beri tanda (V) pada kolom jawaban bila dokumen ada sesuai jumlah penjamah makanan yang sudah mengikuti)',
  rekA: 'tuliskan rekomendasi berdasarkan hasil dari kompomen A.1 dan A.2',
  rekB: 'tuliskan rekomendasi berdasarkan hasil dari kompomen B.1 dan B.2',
}

// ─── F2 SOP ───────────────────────────────────────────────────────────────────
export const F2 = {
  title: 'Formulir 2. Pengawasan Ketersediaan SOP', short: 'Ketersediaan SOP',
  dokumen: ['Petunjuk Teknis Tata Kelola Penyelenggaraan Program MBG', 'SOP penyelenggaraan Pangan dari BGN (perencanaan bahan Pangan sampai pemorsian)', 'Surat undangan, notulen, daftar hadir/presensi sosialisasi SOP'],
  aTitle: 'A. Ketersediaan SOP',
  aRule: 'sesuai jika menggunakan SOP dari Petunjuk Teknis Tata Kelola Penyelenggaraan Program MBG',
  sop: ['Perencanaan Menu', 'Pemesanan Bahan Pangan', 'Penerimaan Bahan Pangan', 'Penyimpanan Bahan Pangan', 'Persiapan Bahan Pangan', 'Pengolahan Bahan Pangan', 'Pemorsian Makanan', 'Distribusi Makanan'],
  bTitle: 'B. Sosialisasi SOP pada seluruh pegawai SPPG dan penjamah makanan/relawan',
  bRule: 'sesuai bila sudah sosialisasi dan dokumen lengkap',
  bukti: [{ key: 'undangan', label: 'Undangan/jadwal briefing' }, { key: 'notulen', label: 'Notulensi' }, { key: 'hadir', label: 'Daftar hadir/presensi' }],
  kesRule: 'sesuai apabila seluruh jawaban di komponen A dan B adalah "sesuai"',
  rek: 'lengkapi dan sosialisasikan SOP :(tuliskan SOP yang belum ada dan belum disosialisasikan)',
}

// ─── F12 / F13 rekap ──────────────────────────────────────────────────────────
export const REKAP = {
  12: {
    title: 'Formulir 12. Rekapitulasi Penilaian Ketaatan Penerapan Standar Gizi MBG', short: 'Rekap Ketaatan Standar Gizi',
    aspek: [[3, 'Perencanaan Menu'], [4, 'Pemesanan Bahan Pangan'], [5, 'Penerimaan Bahan Pangan'], [6, 'Penyimpanan Bahan Pangan'], [7, 'Persiapan Bahan Pangan'], [8, 'Pengolahan Bahan Pangan'], [9, 'Pemorsian Makanan']] as [number, string][],
    kesLabel: 'Kesimpulan: Ketaatan SPPG Terhadap Pemenuhan Standar Gizi', rule: '"baik" apabila nomor 1 sd 7 ternilai "sesuai"',
  },
  13: {
    title: 'Formulir 13. Rekapitulasi Penilaian Daya Terima MBG', short: 'Rekap Daya Terima',
    aspek: [[10, 'Daya Terima MBG di Sekolah'], [11, 'Daya Terima MBG bagi Sasaran Posyandu']] as [number, string][],
    kesLabel: 'Kesimpulan: Daya Terima', rule: '"baik" apabila nomor 1 sd 2 ternilai "sesuai"',
  },
} as const

export const FORM_TITLES: Record<number, { title: string; short: string }> = {
  1: F1, 2: F2, 9: F9, 12: REKAP[12], 13: REKAP[13],
  ...Object.fromEntries(CEK_NASKAH.map((c) => [c.no, { title: c.title, short: c.short }])),
}
export const FORM_GROUPS: { title: string; forms: number[] }[] = [
  { title: 'Standar ketenagaan & SOP', forms: [1, 2] },
  { title: 'Penerapan SOP (dasar Rekap Formulir 12)', forms: [3, 4, 5, 6, 7, 8, 9] },
  { title: 'Daya terima (dasar Rekap Formulir 13)', forms: [10, 11] },
  { title: 'Rekapitulasi', forms: [12, 13] },
]

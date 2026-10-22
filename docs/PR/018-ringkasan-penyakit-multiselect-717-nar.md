# PR 018 — Ringkasan per Penyakit, Filter Multi-pilih, 7-1-7, Modal Sinyal, NAR–SKDR

Status: **belum di-push**

## Ringkasan
- **Filter global multi-pilih.** Penyakit, Provinsi, dan Kab/Kota kini berupa dropdown kotak centang. Setiap dropdown punya kotak cari, tombol "Pilih semua"/"Hapus pilihan", dan label jumlah ("3 provinsi dipilih").
  - Bawaan = semua. Label yang tampil saat tidak dipersempit: "Semua penyakit", "Semua provinsi", "Semua kabupaten/kota". Tombol reset mengembalikan ke Semua.
  - Kab/Kota hanya menampilkan kabupaten/kota dari provinsi yang dicentang, dikelompokkan per provinsi. Menghapus centang provinsi juga membuang kab/kota miliknya.
  - URL: `?penyakit=A,B&prov=11,12&kab=1101,...`. Pilihan terakhir juga disimpan di `sessionStorage`, jadi tetap terbawa saat berpindah halaman (Dasbor, Penyakit, detail penyakit).
  - **Mode terapkan: tombol Terapkan, bukan auto-apply.** Alasannya:
    1. Satu perubahan filter memicu ±6 endpoint agregat yang berat (150 ribu baris EBS).
    2. Multi-pilih butuh banyak klik berturut-turut.
    3. Pola ini sama dengan periode Minggu Epi yang sudah ada.
    4. Tidak ada permintaan yang terbuang di tengah pemilihan.
- **Backend array.**
  - Semua endpoint yang memakai `dashboard::resolve` (`/analytics/overview|summary|diseases/:kode`, `/dashboard/executive`, `/public-dashboard`, `/nar/summary`) menerima daftar koma pada `province_id`, `kabkota_id`, dan `disease`.
  - SQL memakai `cardinality($n::int[]) = 0 OR kolom = ANY($n)`. Penyakit di-resolve sekali menjadi id. Tidak ada N+1.
  - Label cakupan: satu wilayah = namanya; beberapa wilayah = "N provinsi"/"N kab/kota".
- **Peta mengikuti pilihan.** Marker, choropleth, dan popup memakai data yang sudah difilter. Saat provinsi/kab-kota dipersempit, peta *auto-fit* ke batas marker (prop baru `fitTo` di `SpatialOutbreakMap`/`AseanMap`).
- **/penyakit = kartu ringkasan per penyakit** (mockup #s1), dari registri via `/api/v1/analytics/summary`. Kartu mengikuti filter global dan Sumber. Isi tiap kartu:
  - nama dan kategori
  - alert EBS dan Kasus PE (terpisah, tidak dijumlah) dengan sparkline mingguan, tren 4 minggu, dan perubahan 24 jam
  - kematian, CFR PE (kematian ÷ luaran diketahui), dan provinsi terdampak
  - sebaran status kasus PE
  - tanggal data terakhir
  - tautan ke `/penyakit/[kode]`
- **Karusel di bawah peta (Dasbor).** Kartu ringkas yang bergulir otomatis (±30 px/detik).
  - Berhenti saat hover, fokus keyboard, seret, atau tab tersembunyi. Tidak bergerak bila `prefers-reduced-motion`.
  - Ada tombol jeda, sebelumnya, dan berikutnya; bisa diseret dengan mouse dan di-*swipe* di layar sentuh.
  - Daftar dirender dua kali dan digulir melingkar, jadi tidak ada celah kosong.
  - **Dihapus:** panel tabel penyakit PR 016 (`DiseaseTable`, testId `disease-section`) di Dasbor, karena duplikat dengan karusel. Komponen `DiseaseTable.tsx` tetap ada karena helper `Spark`/`Trend` dan tipe `SummaryDisease` dipakai ulang.
- **7-1-7.**
  - Setiap kartu kini punya bar bertumpuk tepat waktu/terlambat/tanggal kosong beserta legendanya.
  - Rincian per penyakit menampilkan bar bertumpuk per baris.
  - Tabel baru "Waktu per sinyal" menampilkan 30 alert EBS terbaru, berisi tanggal laporan, waktu dibuat, dan lama notifikasi dibanding target 1 hari (berwarna), dengan tombol Lihat.
  - Deteksi/Respons tetap "Data belum tersedia" (field A.11/B.x belum ada di umpan EBS).
- **Modal "Lihat" per sinyal.** Data dari `GET /api/v1/signals/:source/:id` (`ebs` = id_ebs, `pe` = id kasus). Isi modal:
  - identitas, status/klasifikasi (label dari skema formulir), dan jumlah kasus/kematian
  - lokasi dengan mini peta (proxy tile OSM; titik laporan, atau pusat kab/kota bila koordinat laporan tidak ada)
  - linimasa tanggal, dan durasi 7-1-7 dibanding target (hijau/merah, "Data belum tersedia" bila tanggal tidak ada)
  - pelapor dan teks sumber. Teks sumber dilipat secara bawaan karena bisa memuat nama, dan tag HTML dibuang.
  - tautan ke formulir PE (untuk EBS: PE yang tertaut lewat `ebs_link`)

  Aksesibilitas: Esc dan klik overlay menutup modal, ada *focus trap*, fokus kembali ke tombol pembuka, serta *skeleton* dan *error* dengan tombol coba lagi. Tombol Lihat dipasang di tabel sinyal 7-1-7 serta daftar EBS/PE terbaru di `/penyakit/[kode]`.
- **NAR–SKDR (No. 76–81)** sebagai bagian Dasbor Utama (sheet No. 10 mencantumkan NAR–SKDR sebagai bagian dasbor). Data dari `GET /api/v1/nar/summary`, mengikuti filter.

## Status NAR per butir
| No | Butir | Status |
|---|---|---|
| 76 | % kasus SKDR dengan NIK terisi (tanpa GHPR) | **Implemented**: Kasus PE terhitung, klasifikasi `ghpr` dikecualikan (konfigurasi `dashboard_executive.nar`, migrasi 030), dengan IK 95% Wilson dan jumlah NIK 16 digit valid |
| 77 | % kasus cocok di NAR (berdasarkan NIK) | **Blocked**: butuh API NAR |
| 78 | Status SKDR perlu diperbarui | **Blocked**: butuh API NAR |
| 79 | Positif di NAR tanpa laporan SKDR | **Blocked**: butuh API NAR |
| 80 | Batang rekonsiliasi per penyakit | **Partial**: hanya segmen "tanpa NIK" (data SKDR); segmen cocok/tidak cocok butuh NAR |
| 81 | Tabel perlu tindak lanjut | **Blocked**: butuh API NAR |

Yang dibutuhkan: integrasi API NAR (hasil laboratorium per NIK) dan kesepakatan aturan pencocokan NIK SKDR–NAR.

## Penyempurnaan visual (pola editorial)
- Token bersama di `globals.css` (`--page-bg` #F7F9F9, `--card-bg`, `--card-border`, `--rule`) dan warna Tailwind `page/card/line/rule`; kelas `.skdr-card`, `.skdr-rule`, `.skdr-eyebrow`; komponen `components/ui/Card.tsx`.
- Grafik, peta, dan tabel tanpa bingkai kartu (label eyebrow + garis tipis); kartu hanya untuk KPI, kartu penyakit, item karusel, dan modal (border 1px terang, tanpa bayangan berat).
- Diterapkan di Beranda, Dasbor Utama, Penyakit, Detail penyakit, Daftar PE, EBS, Dokumentasi.
- Sebelum/sesudah: `/workspace/pr018-screenshots/visual/{before,after}-*-{1440,390}.png`.

## CFR per penyakit: daftar kematian laporan belum konfirmasi
- Tabel CFR yang ada diperluas (tidak diduplikasi): baris konfirmasi berisi penyebut (kondisi akhir diketahui), pembilang (meninggal), CFR, dan IK 95% Wilson; baris bertanda bintang (suspek/probabel/GHPR) ditampilkan "tidak dihitung*" dan disorot bila ada kematian, dengan tombol "Lihat {n} →".
- Tombol membuka modal: No. PE, unit pelapor, kab/kota, minggu epi, status, tanggal laporan, dan tombol "Lihat" per baris yang membuka modal detail sinyal.
- Pemberitahuan "Periksa data" dan catatan kaki pengecualian ditambahkan. Pemetaan status dari registri/konfigurasi (`outcome.dead`, status yang dihitung); mengikuti filter global.
- Endpoint: `GET /api/v1/signals/pe-deaths?form=&classes=` (+ parameter filter dasbor), maks. 500 baris. Baris CFR di `/dashboard/executive` kini memuat `form` dan `codes`.
- Data riil saat ini: seluruh 35 laporan PE final berkondisi akhir "Sembuh", sehingga tidak ada kematian dan tombol tidak tampil (benar). Hitungan endpoint = hitungan tombol (0 = 0) untuk 11 baris. UI modal diuji dengan fixture Playwright (route dimock hanya di konteks uji; data dan aplikasi tidak diubah).

## Penyamaran data pribadi pada teks EBS (sisi server)
- Modul `services/backend-rust/src/privacy.rs`. Teks bebas EBS (kronologi, tindakan, saran) disamarkan di backend sebelum respons dikirim, sehingga nama asli tidak pernah sampai ke browser. Data tersimpan tidak diubah.
- Aturan umum (tanpa penanganan per rekaman):
  - nama setelah kata kunci/sapaan (An., Tn., Ny., Nn., Sdr., Bpk., Bapak, Ibu, pasien, penderita, korban, a.n., atas nama, nama:, bernama, …) diganti inisial ("R. H.") atau label "[nama disamarkan]";
  - NIK 16 digit → "[NIK disamarkan]"; nomor telepon (08…, 62…, +62…) → "[telepon disamarkan]";
  - tag HTML dibiarkan; kata berhuruf kapital yang bukan nama (usia, tahun, desa, RSUD, …) dikecualikan lewat daftar `stop_words`.
- Konfigurasi di DB: `app_settings.privacy_masking` (migrasi `031_privacy_masking.sql`, rollback `rollback/031_rollback.sql`): `enabled`, `style` (`initials`/`label`), `keywords`, `stop_words`, `max_name_words`, `mask_nik`, `mask_phone`.
- Endpoint yang memuat teks bebas EBS: hanya `GET /api/v1/signals/ebs/:id` (modal Lihat). Daftar (terbaru, 7-1-7, CFR) dan endpoint lain tidak mengirim teks bebas; belum ada endpoint ekspor EBS. Respons menambah `privacy: { masked, replacements }`; modal menampilkan catatan "Nama pasien disamarkan".
- Uji unit: 13 kasus dengan contoh sintetis (`cargo test privacy`). Pemeriksaan data riil (300 EBS yang memuat pola sapaan/NIK/telepon): 162 penggantian, 0 sisa pola sapaan+nama, 0 deret 16 digit.
- Batasan: nama yang muncul tanpa kata kunci/sapaan apa pun tidak dapat dikenali dengan aturan; daftar kata kunci bisa diperluas di DB tanpa ubah kode.

## Judul dan jarak antarbagian
- Komponen bersama `SectionHeader` (dipakai `Panel` dan `Section`): eyebrow huruf kapital 12 px, judul `text-2xl` tebal warna gelap Kemenkes, deskripsi opsional 14 px; jarak judul ke isi 16 px.
- Token `.skdr-section` / `--section-pad`: jarak antarbagian ±32 px di ponsel dan ±48 px di ≥1024 px (termasuk jarak tumpukan induk). Karusel, peta Dasbor, dan bagian Beranda memakai kelas yang sama.
- Halaman PE (Daftar PE, daftar per formulir, formulir PE), Sinkronisasi EBS, dan Dokumentasi kini memakai `PageHeader` yang sama (eyebrow 12 px, judul 24 px tebal, deskripsi 14 px, tombol aksi di kanan) dan token tumpukan `.skdr-page` (`--section-gap`: 32 px ponsel, 48 px ≥1024 px; header ke isi 16 px). Sub-bagian EBS (Riwayat sinkronisasi, Pemetaan diagnosa) dan judul bagian formulir PE memakai kelas judul yang sama. Diverifikasi Playwright 1440/390: judul 24px/700, eyebrow 12px, 0 error konsol. Tangkapan layar: `after3-{pe,pe-form-list,pe-form,ebs,dokumentasi}-{1440,390}.png`.
- Heatmap minggu epid × provinsi (komponen `TrendHeatmap`, satu-satunya heatmap; tampil di Dasbor Utama): hanya isi grid + legendanya dibungkus kartu halus `.skdr-card` (border 1px terang, bayangan sangat tipis, kolom provinsi sticky ikut warna kartu); judul/eyebrow bagian tetap di luar kartu. Tangkapan layar: `after4-heatmap-{1440,390}.png`.

## Integrasi NAR–SKDR (tata letak baru)
- Bagian disusun ulang mengikuti mockup: judul "Integrasi NAR–SKDR" + satu kalimat deskripsi; empat kartu KPI ringkas (angka besar + keterangan singkat); panel "Rekonsiliasi per penyakit" dan "Perlu tindak lanjut".
- Kartu "% kasus dengan NIK terisi" memakai data nyata (mis. 100,0% · 29/29). Tiga kartu yang bergantung pada NAR menampilkan "—" dan "Menunggu koneksi NAR"; tidak ada angka perkiraan.
- Rekonsiliasi per penyakit: hanya pembagian nyata Ber-NIK (abu-abu, "Ber-NIK, menunggu NAR") vs Tanpa NIK, dengan "N kasus di SKDR"; legenda empat kategori mockup ditampilkan, kategori yang butuh NAR diredupkan.
- Perlu tindak lanjut: tabel Tindakan/Penyakit/Kab/Kota/Minggu dengan keadaan kosong "Daftar muncul setelah SKDR terhubung ke NAR."
- Label nomor sheet progres ("No. 76", "Sebagian (hanya segmen tanpa NIK)", dst.) dihapus dari UI. Pemindaian seluruh halaman: kolom "No." di tabel indikator Dokumentasi dan kalimat "(sheet indikator No. 1–75)" dihapus; teks konfigurasi "(sheet No. 36)" dihapus lewat migrasi `032_remove_sheet_numbers.sql` (backup `app_settings_bak_032`, rollback `rollback/032_rollback.sql`). Nomor rekaman (No. PE, No. alert) tetap.
- Tangkapan layar: `after5-nar-{1440,390}.png`.

## Peta Sebaran: choropleth lima kelas (kuartil)
- Mengikuti Spesifikasi Dashboard Executive No. 57: "Lima kelas warna: 0, lalu empat kelas berdasarkan kuartil"; "Batas kelas dihitung ulang untuk setiap peta dari wilayah yang punya laporan (nilai > 0) pada tingkat yang sedang ditampilkan: kuartil 25%, 50%, 75%. Jadi ambang provinsi, kab/kota, dan unit berbeda."; legenda di bawah peta, contoh "Jumlah per kab/kota: 0 · 1 · 2-4 · 5-9 · 10+"; "Jika batas sama, tampilkan satu angka, bukan rentang".
- Batas dinamis per peta (kuantil nearest-rank atas wilayah bernilai > 0, mengikuti filter dan tingkat wilayah). Batas yang sama digabung; kelas satu nilai ditulis satu angka.
- `app_settings.map_choropleth` (migrasi 034) menyimpan aturan `{"mode":"quantile","quantiles":[0.25,0.5,0.75]}` + warna kelas 0 dan empat warna ramp teal; tidak ada nilai di kode (`lib/choropleth-classes.ts`). Mode `fixed` (033) tetap didukung.
- Sebaran nyata (2026, M1–42): provinsi semua sumber n=37, kuartil 94/449/1.246, maks 10.542; kab/kota n=391, kuartil 9/36/96, maks 2.992; GHPR/rabies per provinsi n=35, 24/133/349; per kab/kota n=321, 3/9/27; Kasus PE hanya 1 provinsi (29). Ambang tetap tidak mungkin cocok untuk rentang ini, sehingga kuartil dinamis dipakai.
- Semua choropleth (Dasbor Utama, peta EBS/PE Detail Penyakit). Label legenda mengikuti tingkat wilayah. Peta dibungkus kartu halus (`map-card`), judul bagian di luar kartu.
- Tangkapan layar: `after7-map-{1440,detail-1440}.png`, `after9-map-card-{1440,390}.png`.

## Header dan Beranda
- Header semua halaman: latar `public/header-bg.jpg` (rata kanan, cover) dengan pudar putih di kiri; judul teal gelap. Gradien hijau lama dihapus. Tangkapan layar: `after8-header-{1440,390}.png`.
- Beranda: hero penuh dengan `public/home-bg.webp` (≈150 KB, dari home-bg.jpg); panel "Rilis Data Terkini" putih semi-transparan (backdrop-blur, bayangan tipis); pita situasi tidak lagi hijau tua (latar putih, teks teal gelap). Tangkapan layar: `after8-beranda-{1440,390}.png`.
- Beranda tanpa sambungan: header transparan (tanpa border), `home-bg.webp` digambar oleh `AppShell` dari tepi atas (di belakang header) sampai bawah hero (tinggi diukur dari `home-hero`), tanpa padding atas. Halaman lain: header-bg rata dengan konten. Tangkapan layar: `after10-seam-{1440,390}.png`, `after10-seam-dash-{1440,390}.png`.

## Menu bagian Dasbor (Spesifikasi No. 10)
- `components/dashboard/SectionNav.tsx`: bilah pil mengambang (kartu frosted, bayangan tipis) yang muncul setelah bilah filter tergulir lewat. Daftar bagian diambil dari bagian tingkat atas halaman (`section.skdr-section` + judul `h2.skdr-section-title`), tanpa daftar di kode; label = judul bagian tanpa keterangan dalam kurung.
- Klik = gulir halus dengan offset 84 px; bagian aktif disorot lewat IntersectionObserver. Tombol "Sembunyikan" melipat menjadi tombol kecil "Bagian"; status disimpan di localStorage (`skdr_section_nav_collapsed`). Di ponsel bilah dapat digulir horizontal.
- Bilah filter tetap tidak sticky. Breadcrumb dihapus hanya di Dasbor Utama.
- Tangkapan layar: `after11-sectionnav-{1440,390}.png`, `after11-sectionnav-collapsed-{1440,390}.png`.

## Gaya tabel bersama
- Kelas bersama di `globals.css`: `.skdr-table-card` (kartu halus seperti kartu heatmap/peta, gulir horizontal di dalam kartu) dan `.skdr-table` (header berwarna teal muda, baris zebra, sorotan hover; spesifisitas rendah lewat `:where()` sehingga baris khusus seperti baris berbintang CFR tetap berwarna sendiri). Judul bagian tetap di luar kartu. Grid heatmap tidak diubah.
- Tabel yang diubah: Daftar PE; daftar per formulir PE (2 tabel); Dasbor: CFR per penyakit, NAR "Perlu tindak lanjut", 7-1-7 (tabel per tahap dan waktu per sinyal); modal daftar kematian; Detail Penyakit: wilayah teratas, EBS terbaru, Kasus PE terbaru; Sinkronisasi EBS (riwayat dan pemetaan); Dokumentasi (tabel indikator dan tabel Markdown); Master provinsi/kabupaten/penyakit.
- Tangkapan layar: `after12-tables-{pe,dasbor-cfr,penyakit}-{1440,390}.png`.

## Endpoint baru / berubah
- `GET /api/v1/signals/pe-deaths`: daftar kematian per formulir/klasifikasi.
- `GET /api/v1/signals/:source/:id`: detail sinyal.
- `GET /api/v1/nar/summary`: NAR–SKDR.
- `/api/v1/analytics/summary`:
  - per penyakit kini juga berisi `ebs.last_date`, `ebs.d24`, `pe.last_date`, `pe.d24`, dan `pe.known_outcome`
  - `t717.signals`
  - parameter wilayah/penyakit berupa daftar koma
- `/api/v1/analytics/diseases/:kode`: `latest.ebs[].id`.

## Migrasi
- `034_map_choropleth_quartile.sql`: aturan kuartil + warna (backup `app_settings_bak_034`). Rollback: `rollback/034_rollback.sql`.
- `034_map_choropleth_quartile.sql`: aturan kuartil (backup `app_settings_bak_034`). Rollback: `rollback/034_rollback.sql`.
- `033_map_choropleth.sql`: kelas & warna choropleth (`ON CONFLICT DO NOTHING`). Rollback: `rollback/033_rollback.sql`.
- `032_remove_sheet_numbers.sql`: menghapus rujukan nomor sheet dari teks `dashboard_executive`. Rollback: `rollback/032_rollback.sql`.
- `031_privacy_masking.sql`: konfigurasi penyamaran (`ON CONFLICT DO NOTHING`). Rollback: `rollback/031_rollback.sql`.
- `030_nar_skdr.sql`: menambah `nar.exclude_classes = ["ghpr"]` dan `nar.nik_valid_pattern`. Backup di `app_settings_bak_030`. Rollback: `rollback/030_rollback.sql`.

## Catatan
- Popup peta adalah agregat wilayah, bukan sinyal tunggal, sehingga tombol Lihat per sinyal tidak dipasang di popup peta.
- Teks EBS (kronologi) kadang memuat nama pasien. Teks ini ditampilkan terlipat dan perlu keputusan kebijakan privasi.

## Verifikasi
- `tsc --noEmit`: OK. Backend dibangun ulang tanpa error.
- Playwright 1440 dan 390 px, 0 error konsol (termasuk konteks fixture CFR):
  - karusel bergerak (1440: 322→370→418; 390: 242→290→339) dan berhenti saat hover
  - filter multi-pilih: label "2 penyakit dipilih / 3 provinsi dipilih", URL `penyakit=…&prov=…`, reset ke "Semua penyakit / Semua provinsi / Semua kabupaten/kota"
  - 7-1-7, modal sinyal (Esc dan overlay menutup), NAR–SKDR
  - CFR: data riil 0 tombol; fixture 1 tombol "Lihat 2 →", modal 2 baris, modal sinyal bertingkat terbuka, Esc menutup semua
- Tangkapan layar: `/workspace/pr018-screenshots/` (dash-*, carousel-*, filter-*, ref-717, t717-detail, modal-*, nar-skdr, penyakit-*, cfr-real, cfr-fixture-table, cfr-deaths-modal, cfr-nested-signal) dan `visual/`.

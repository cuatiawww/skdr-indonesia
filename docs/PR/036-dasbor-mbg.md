# PR 036 — Dasbor MBG (Pengawasan Gizi MBG & Keracunan Pangan MBG)

Tanggal: 10 Nov 2026 (WIB). Branch: `main`.

## Latar Belakang
Program Makan Bergizi Gratis (MBG) memiliki dua transaksi pelaporan form di modul Transaksi:
1. **Pengawasan Gizi MBG** (`mbg_kunjungan` & `mbg_form` Formulir 1–13: ketenagaan, kepatuhan 8 SOP, daftar periksa F3–F11, rekap standar gizi F12 & daya terima F13).
2. **Keracunan Pangan MBG** (`mbg_keracunan` & `mbg_keracunan_update`: laporan cepat & penyelidikan kejadian, gejala klinis, demografi & kelompok rentan, SLHS/IKL, 26 SOP SPPG, sampel laboratorium, dan perkembangan kasus harian).

PR ini menambahkan halaman **Dasbor MBG** (`/dasbor/mbg`) di bawah grup menu **Dasbor**, bersama dua endpoint analitik backend yang membaca langsung dari tabel transaksi form tersebut — tanpa data dummy, tanpa nilai hardcoded, tanpa fallback palsu, dan tanpa mengekspos PII (`nama_tpg`, `nama_pengawas`, `pelapor_nama`, `pelapor_hp`, `pelapor_email`).

## Arsitektur & Fitur
1. **Satu Halaman dengan 2 Pagination (`Pengawasan Gizi MBG` ↔ `Keracunan Pangan MBG`)**:
   - **Halaman 1 · Pengawasan Gizi MBG (`?tab=gizi`)**:
     - Filter dinamis dari data transaksi `mbg_kunjungan`: Status Kunjungan (`Dikirim`/`Draf`), Rekap Standar Gizi F12 (`BAIK`/`BELUM BAIK`/`belum`), Rentang Tanggal, Provinsi, Kab/Kota, dan Nama SPPG.
     - 6 KPI Cards Eksekutif: Total Kunjungan (`dikirim`/`draf`), Cakupan SPPG/Puskesmas/Wilayah, Rekap Standar Gizi (F12 BAIK vs BELUM BAIK), Rekap Daya Terima (F13 BAIK vs BELUM BAIK), Rata-rata Skor SOP (F3–F11), serta Wilayah 3T & Laporan Alergi.
     - Peta Spasial & Layering Wilayah (OpenLayers 10 via komponen bersama `EbsIbsLayerMap` mode `gizi`): Basemap switcher, Choropleth Provinsi → drill-down Kab/Kota, Spatial Density Heatmap (`ol/layer/Heatmap`), dan Titik Lokasi SPPG/Puskesmas.
     - Matrix Heatmap Mingguan (`GiziMatrixHeatmap`): dapat dialihkan antara **Provinsi × Minggu Epid** dan **Formulir F1–F13 × Minggu Epid**, untuk metrik volume maupun ketidakpatuhan (`F12 Belum Baik` / `Tidak Sesuai`).
     - Visualisasi lanjutan: Tren Mingguan Kunjungan & Mutu F12, Grafik Profil Kepatuhan Formulir 1–13, Ringkasan Form 1 Ketenagaan & Sertifikasi, Kepatuhan 8 SOP Wajib (Form 2), Tabel Lengkap Form F1–F13, Rekap Kinerja per SPPG, serta Tabel Kunjungan Terbaru (non-PII).
   - **Halaman 2 · Keracunan Pangan MBG (`?tab=keracunan`)**:
     - Filter dinamis dari `mbg_keracunan`: Status Kejadian (`Dilaporkan`/`Ditutup`/`Draf`), Status Lab (`Belum`/`Dikirim`/`Ada Hasil`), Hasil IKL, Kepemilikan SLHS, Rentang Tanggal, Provinsi, Kab/Kota, dan Nama SPPG.
     - 6 KPI Cards Epidemiologi & Lingkungan: Total Kejadian, Total Kasus & CFR (%), Attack Rate (%) & Rata-rata Masa Inkubasi (jam), Status Perawatan (`Rawat Inap`/`Rawat Jalan`/`Sembuh`) & Sekolah Terdampak, Kesiapan Sampel Lab, serta SLHS & Kelayakan IKL.
     - Peta Spasial Multi-Layer (mode `keracunan`: Kasus, Kejadian, Meninggal, Terpapar + drill-down Provinsi → Kab/Kota) & Tabel Rekap Wilayah.
     - Matrix Heatmap Mingguan Keracunan (`KeracunanMatrixHeatmap`).
     - Tren Mingguan Kejadian/Kasus/Kematian dan Grafik Perkembangan Kasus Harian langsung dari `mbg_keracunan_update`.
     - Profil 9 Gejala Klinis, Demografi Korban (Jenis Kelamin, 5 Kelompok Umur, Balita, Ibu Hamil, Ibu Menyusui), Checklist Faktor Risiko & Sumber Air, Gap Kepatuhan 26 SOP Dapur SPPG, dan Tabel Uji Sampel Laboratorium per Kategori (Mikrobiologi & Kimia).
     - **Korelasi Lintas-Form SPPG**: Matriks SPPG Terdampak (`sppg_incidents`) disandingkan langsung dengan riwayat Pengawasan Gizi (`pengawasan_kunjungan`, Rekap F12, Rekap F13), ditambah Tabel Kejadian Terbaru (non-PII).

## Backend API
Modul baru `services/backend-rust/src/dasbor_mbg.rs` (menggunakan kembali helper dari `dasbor_ebs_ibs.rs` dan didaftarkan di `services/backend-rust/src/main.rs`):
- `GET /api/v1/dasbor/mbg/pengawasan-gizi`
- `GET /api/v1/dasbor/mbg/keracunan`
- Otorisasi (`auth::classify`): `Need::Login` (sama dengan rute `/api/v1/dasbor/*` lainnya; tidak mengandung PII).

## Database
- `database/init/058_dasbor_mbg.sql` (+ `database/rollback/058_rollback.sql`): menambahkan item menu `mod_dasbor_mbg` ("Dasbor MBG", `/dasbor/mbg`, ikon `Utensils`) ke grup `grp_dasbor` di `app_settings.navigation_menu` secara idempoten dengan backup `app_settings_bak_058`.

## Verifikasi
- `cargo test`: **55/55 lulus** (termasuk `dasbor_mbg::tests::route_access_is_dashboard_login` dan `dasbor_mbg::tests::forms_and_sop_metadata_complete`).
- `npm run typecheck` (`tsc --noEmit` di container `skdr-frontend-next`): **0 error**.
- Build ulang container `skdr-backend-rust` & startup log menunjukkan migrasi `058_dasbor_mbg.sql` berhasil diterapkan.
- Verifikasi E2E (`verify_pr036.py`):
  - Guard otorisasi 401 untuk request tanpa sesi pada kedua endpoint `/api/v1/dasbor/mbg/*`.
  - Kondisi DB kosong mengembalikan `0` / `[]` / `null` tanpa data dummy atau fallback.
  - Halaman SSR `/skdr/dasbor/mbg` dan `/skdr/dasbor/ebs-ibs` mengembalikan HTTP 200 tanpa error boundary.
  - Uji data transaksi sementara (`mbg_kunjungan`, `mbg_form` F1/F2/F3/F12/F13, `mbg_keracunan`, `mbg_keracunan_update`) memverifikasi agregasi KPI, skor SOP, ketenagaan F1, drill-down peta kab/kota, korelasi silang SPPG dengan Pengawasan Gizi, SOP gap, sampel lab, serta nol kebocoran PII (`__TEST_PII_*`, HP, email absen dari respons JSON), lalu seluruh data uji dan sesi sementara dibersihkan kembali.

# PR 035 — Dasbor SKDR EBS & IBS (dari Transaksi Form Laporan EBS, Entri Data Agregat, & Form Individu)

Tanggal: 10 Nov 2026 (WIB). Branch: `main`.

## Latar belakang
Transaksi pelaporan baru telah dibuat pada PR 030 dan PR 031:
- **Laporan EBS** (`laporan_ebs`)
- **Entri Data Agregat (IBS)** (`laporan_ibs`)
- **Form Individu (IBS)** (`laporan_ibs_individu`)

PR ini menambahkan halaman **Dasbor SKDR EBS & IBS** (`/dasbor/ebs-ibs`) di menu grup **Dasbor**, beserta endpoint API backend khusus yang mengambil data analitik langsung dari tabel transaksi form tersebut — tanpa data dummy, tanpa angka hardcoded, dan tanpa fallback palsu.

## Arsitektur & Fitur
1. **Satu Halaman dengan 2 Pagination (`Dasbor EBS` ↔ `Dasbor IBS`)**:
   - **Halaman 1 · Dasbor EBS (`?tab=ebs`)**:
     - Filter dinamis dari data transaksi EBS: Status Laporan (`Semua`, `Dikirim`, `Draf`), Rentang Tanggal, Provinsi, Kab/Kota, Penyakit Rumor, Jenis Unit, Status Kejadian, dan Kriteria KLB.
     - KPI Cards: Total Laporan (Dikirim/Draf), Total Kasus, Total Kematian & CFR (%), KLB (Berlangsung/Berakhir), Dukungan Lab (Spesimen, Diperiksa, Positif), dan Cakupan Pelapor.
     - Peta Spasial & Layering Wilayah (OpenLayers 10): Basemap switcher (`Carto Light`, `OSM`, `Satelit`, `Topografi`, `Dark`), Choropleth Provinsi → klik drill-down ke Kab/Kota, Spatial Density Heatmap (`ol/layer/Heatmap`) dengan kontrol opasitas/radius/blur, dan Layer Titik Lokasi/Fasyankes (berdasarkan koordinat real `master_fasyankes`/`master_kabkota`).
     - Matrix Heatmap Mingguan (Minggu Epid × Provinsi / Penyakit Rumor, metrik Kasus / Laporan).
     - Visualisasi lanjutan: Tren Mingguan Rumor/Kasus/Kematian, Penyakit Rumor Terbanyak, Piramida Usia & Jenis Kelamin (11 kelompok umur dari matriks form EBS), Status Kejadian & Sumber Informasi, Kelengkapan Intervensi & Dukungan Lab/Tata Laksana, Distribusi Jenis Unit, dan Tabel Ringkasan Transaksi Terbaru (non-PII).
   - **Halaman 2 · Dasbor IBS (`?tab=ibs`)**:
     - Filter dinamis dari data transaksi IBS: Sumber Form IBS (`Semua`, `Entri Data Agregat`, `Form Individu`), Status Laporan, Tahun, Minggu Epid Awal–Akhir, Provinsi, Kab/Kota, Penyakit Agregat (`ibs_penyakit`), dan Jenis Unit.
     - 2 Kelompok KPI Transparan (tidak menjumlahkan data agregat mingguan dengan pasien individu):
       - *Entri Data Agregat*: Laporan Agregat (Dikirim/Draf), Total Kasus, Kematian & CFR, Pemeriksaan Lab, Total Kunjungan & Proporsi Kasus (%), Laporan Nihil, Unit Pelapor.
       - *Form Individu*: Total Pasien (Dikirim/Draf), Rasio Kelamin (L/P), Status Akhir (Meninggal, Dalam Perawatan, Sakit, Sehat), Kelengkapan Vital & SOAP.
     - Peta Spasial & Layering Wilayah (Choropleth Provinsi/Kab-Kota, Spatial Density Heatmap, Titik Unit Agregat vs Individu).
     - Matrix Heatmap Mingguan IBS (sel terpisah Agregat biru / Individu ungu, atau mode masing-masing).
     - Visualisasi lanjutan: Tren Mingguan Dual-Axis (Kasus Agregat vs Pasien Form Individu), Profil 24 Penyakit Agregat, Demografi Form Individu (Piramida Umur × Kelamin, Status Akhir, Imunisasi, Pekerjaan, Kategori IMT, Statistik Tanda Vital Min/Avg/Maks), Unit Pelapor Teratas & Jenis/Kelompok Unit, serta 2 Tabel Ringkasan Transaksi Terbaru (non-PII, tanpa nama pasien/alamat/No Epid/HP).

## Backend API
Modul baru `services/backend-rust/src/dasbor_ebs_ibs.rs`:
- `GET /api/v1/dasbor/ebs-ibs/ebs` — agregasi langsung dari `laporan_ebs` (+ `master_locations`, `master_kabkota`, `master_fasyankes`).
- `GET /api/v1/dasbor/ebs-ibs/ibs` — agregasi langsung dari `laporan_ibs`, `laporan_ibs_individu`, dan `ibs_penyakit`.
- Otorisasi (`auth::classify`): `Need::Login` (sama seperti semua dasbor lainnya; semua data bersifat agregat/non-PII).

## Database
- `database/init/057_dasbor_ebs_ibs.sql` (+ `database/rollback/057_rollback.sql`): menambahkan item menu `mod_dasbor_ebs_ibs` ("Dasbor SKDR EBS & IBS", `/dasbor/ebs-ibs`) ke `grp_dasbor` di `app_settings.navigation_menu` secara idempoten (backup `app_settings_bak_057`).

## Verifikasi
- `cargo test` lulus 53/53 (termasuk 3 unit test baru untuk `dasbor_ebs_ibs`: `mmwr_week_of_matches_boundary`, `age_group_computes_infant_and_adult`, `route_access_is_dashboard_login`).
- `tsc --noEmit` 0 error.
- Rebuild Docker backend & restart stack lokal; migrasi `057_dasbor_ebs_ibs.sql` teraplikasi; pengujian end-to-end endpoint `/api/v1/dasbor/ebs-ibs/ebs` & `/api/v1/dasbor/ebs-ibs/ibs` (state kosong maupun dengan data transaksi uji yang dibersihkan/diverifikasi) dan halaman `/dasbor/ebs-ibs` mengembalikan 200 OK.


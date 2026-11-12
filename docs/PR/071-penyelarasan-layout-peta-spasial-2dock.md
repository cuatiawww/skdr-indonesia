# PR 071: Penyelarasan Layout Peta Spasial 2-Dock di Dasbor MBG dan Zoonosis

## Deskripsi Perubahan
Pull Request ini menyelaraskan tata letak (*layouting*) dan pengalaman pengguna (*user experience*) peta spasial di seluruh dasbor SKDR (khususnya **Dasbor MBG** dan **Dasbor Zoonosis**) agar mengadopsi standar emas tata letak **2-Dock Auto-Layout** yang terdapat pada **Dasbor SKDR Ringkasan Utama** (`/dashboard/skdr/ringkasan`), dengan menjaga pemisahan variabel dan konteks data yang independen di setiap domain.

---

## Masalah yang Dipecahkan
1. **Inkonsistensi Tata Letak Peta:**
   - Sebelumnya, peta pada Dasbor MBG (`KeracunanDashboardView`, `GiziDashboardView`) disematkan di dalam grid yang sempit (`xl:col-span-2`), bersanding secara kaku dengan tabel peringkat wilayah sehingga kanvas peta terdesak dan sulit dianalisis.
   - Peta pada Dasbor Zoonosis (`ZoonosisGeneralView`) masih menggunakan kontainer lawas `PetaMultiMode` tanpa fitur dock analisis wilayah, ranking hotspot interaktif, dan pengaturan lapisan terpusat.
2. **Kebutuhan Isolasi Variabel & Konteks Antar-Domain:**
   - Variabel pada Dasbor MBG berfokus pada kejadian keracunan pangan, kasus sakit, korban meninggal, dapur SPPG, dan kepatuhan SOP F1–F13.
   - Variabel pada Dasbor Zoonosis berfokus pada kasus PE, kematian, CFR (%), alert SKDR zoonotik, gigitan hewan (GHPR), dan pelacakan satwa liar.
   - Keduanya memerlukan komponen visualisasi spasial bersatu yang dapat menyesuaikan metrik, ranking hotspot, legenda, dan penanda titik (*markers*) sesuai domain yang aktif tanpa mencampuradukkan data.

---

## Solusi & Arsitektur Implementasi

### 1. Upgrade Komponen Inti `EbsIbsLayerMap.tsx` Menjadi 2-Dock Auto-Layout
- **Header Terpadu**:
  - Eyebrow badge `MapPin` + Judul domain analitis.
  - Quick Metric Pills dinamis per mode (`ebs`, `ibs`, `gizi`, `keracunan`, `zoonosis`).
  - Badge jumlah wilayah/titik yang termuat.
  - Tombol aksi `Analisa Wilayah` (toggle Left Dock) dan `Pengaturan Lapisan` (toggle Right Dock).
- **Left Dock (Collapsible 340px / 40px)**:
  - Mode terbuka (`w-[340px]`): Tab `Hotspot Wilayah` (daftar peringkat nilai tertinggi dengan progress bar proporsional, format angka, dan chevron drilldown `onDrillDown`), Tab `Ringkasan` (kartu KPI ringkas + narasi interpretasi spasial), dan Tab `Daftar Titik` (pencarian titik fasilitas/SPPG/kasus dan klik untuk zoom ke titik).
  - Mode tertutup (`w-10`): Rel vertikal ramping dengan label rotasi `Analisa Wilayah`, ikon `MapPin`, dan tombol buka instan.
- **Center Canvas (`flex-1 h-[640px]`)**:
  - Kanvas OpenLayers responsif dengan navigasi breadcrumb tingkat wilayah (Nasional $\to$ Provinsi $\to$ Kab/Kota), tombol reset level, serta kontrol cepat `Crosshair` (auto-fit extent) dan `Fullscreen`.
- **Right Dock (Collapsible 320px / 40px)**:
  - Mode terbuka (`w-[320px]`): Pengaturan Choropleth (saklar & slider opasitas), Mode Titik (Kluster / Titik Tunggal / Nonaktif), Heatmap Kepadatan Spasial (saklar & slider opasitas), Seleksi Basemap (Terang Satusehat, OSM, Satelit, Polos), serta Legenda Warna kuartil interaktif.
  - Mode tertutup (`w-10`): Rel vertikal ramping dengan label rotasi `Pengaturan Lapisan`, ikon `Settings`, dan tombol buka instan.
- **Dukungan Mode `zoonosis` Baru**:
  - Metrik: Kasus Zoonosis, Kematian, CFR (%), Alert SKDR.
  - Format angka dan satuan khusus epidemiologi zoonosis.

### 2. Refaktor Halaman Dasbor MBG (`KeracunanDashboardView.tsx` & `GiziDashboardView.tsx`)
- Mengubah kontainer peta menjadi lebar penuh (*full-width* `w-full`) menggunakan `MbgKeracunanMap` dan `MbgGiziMap` berarsitektur 2-dock.
- Memindahkan tabel peringkat wilayah dan rekapitulasi pengawasan ke dalam komponen lipat `<MoreDetails>` di bawah peta agar tata letak tetap rapi, luas, dan bebas *overflow*.

### 3. Peta Fleksibel Ringkasan Eksekutif MBG (`MbgSections.tsx`)
- Meningkatkan `MbgMapSection` pada `/dashboard/mbg/ringkasan` dengan tab navigasi sebaris: `[Distribusi Kejadian Keracunan Pangan]` vs `[Cakupan & Skor Pengawasan Gizi SPPG]`, lengkap dengan tombol toggle untuk membandingkan 2 kolom secara berdampingan jika diinginkan.

### 4. Integrasi Dasbor Zoonosis (`ZoonosisGeneralView.tsx`)
- Menggantikan peta lawas dengan `<EbsIbsLayerMap mode="zoonosis" ... />`.
- Memetakan data agregat provinsi menjadi `zoonosisRegions` (kasus, kematian, CFR %, alert SKDR).
- Memetakan lokasi outbreak menjadi `zoonosisPoints` dengan penanda status alert, koordinat lat/lng, dan detail klinis.
- Menghubungkan interaksi `onDrillDown` dan `onResetLevel` ke state filter wilayah halaman.

### 5. Panduan Alur Kerja & Strategi Migrasi Lintas Bidang
- Menyusun dokumen komprehensif `docs/PANDUAN_ALUR_DAN_MIGRASI_SKDR_MBG_ZOONOSIS.md` yang memuat diagram alur Mermaid untuk SKDR, MBG, dan Zoonosis, matriks perbandingan variabel sistem lama vs baru, dan jaminan 100% kelestarian variabel tanpa ada yang hilang.

---

## Berkas yang Diubah / Dibuat
- `services/frontend-next/components/dasbor-ebs-ibs/EbsIbsLayerMap.tsx`
- `services/frontend-next/components/dasbor-mbg/KeracunanDashboardView.tsx`
- `services/frontend-next/components/dasbor-mbg/GiziDashboardView.tsx`
- `services/frontend-next/components/dasbor-mbg/MbgSections.tsx`
- `services/frontend-next/components/dashboard/ZoonosisGeneralView.tsx`
- `docs/PANDUAN_ALUR_DAN_MIGRASI_SKDR_MBG_ZOONOSIS.md`
- `docs/PR/071-penyelarasan-layout-peta-spasial-2dock.md`
- `docs/CHANGE_LOG_MATRIX.md`

---

## Verifikasi & Pengujian
- **TypeScript Compilation:**
  `npx tsc --noEmit` berhasil tanpa error (exit code 0).
- **Docker Container Sync:**
  Semua berkas komponen terdistribusi ke kontainer `skdr-frontend-next` menggunakan `wsl docker cp`.
- **Rute yang Terverifikasi:**
  - `/dashboard/skdr/ringkasan` (Standar Emas Dasbor SKDR)
  - `/dashboard/mbg/ringkasan` (Dasbor MBG Ringkasan Eksekutif 2-Dock)
  - `/dashboard/mbg/keracunan` (Dasbor MBG Keracunan Pangan 2-Dock)
  - `/dashboard/mbg/pengawasan` (Dasbor MBG Pengawasan Gizi 2-Dock)
  - `/dasbor/zoonosis-general` (Dasbor Zoonosis General 2-Dock)

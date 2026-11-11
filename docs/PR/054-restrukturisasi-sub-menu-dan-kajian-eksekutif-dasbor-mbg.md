# PR 054: Restrukturisasi Sub-Menu Navigasi & Kajian Eksekutif Analitis Dasbor MBG

- **Tanggal:** 2026-11-11
- **Lapisan:** Frontend, Database

## Latar Belakang & Permasalahan
1. **Navigasi Sidebar Terpecah & Duplikasi Tab di Halaman:** Sebelumnya terdapat grup sidebar terpisah `DASBOR MBG` (`grp_dasbor_mbg`) yang menampilkan 3 menu tingkat atas sekaligus (`Ringkasan MBG`, `Keracunan Pangan MBG`, `Pengawasan Gizi MBG`), ditambah bilah tab horizontal (`<nav>`) yang berulang di dalam halaman `DasborMbgClient.tsx`. Sesuai arahan pengguna, menu di sidebar grup `DASBOR` harus disatukan menjadi **1 menu induk `Dasbor MBG`** yang memiliki **3 sub-menu** (`Ringkasan Eksekutif`, `Keracunan Pangan`, `Pengawasan Gizi`) tanpa tab duplikat di dalam halaman.
2. **Duplikasi Peta 2-Kolom di Ketiga Sub-Halaman:** Sebelumnya ketiga sub-halaman (`ringkasan`, `keracunan`, `pengawasan`) menampilkan komponen `MbgMapSection` (peta komparatif 2 kolom Keracunan + Pengawasan Gizi) yang identik sehingga ketiga halaman terlihat sama di bagian atas.
3. **Gaya Bahasa Judul Berupa Pertanyaan & Kurangnya Sintesis Komando Eksekutif:** Judul bagian pada halaman menggunakan kalimat tanya informal (*"Di mana terjadinya?"*, *"Siapa korbannya?"*, *"Di mana SPPG yang lemah?"*, *"Bagaimana hasil penilaiannya?"*) dan belum menyediakan ringkasan eksekutif terstruktur bagi pimpinan mengenai **identifikasi permasalahan utama** serta **sumber daya/intervensi yang perlu dikerahkan** (TGC Puskesmas/Dinkes, Labkesda, Tim Pembina Gizi/TPG, inspeksi sanitasi SPPG).

## Perubahan Utama

### 1. Penyatuan Menu `Dasbor MBG` dengan 3 Sub-Menu di Sidebar (`DASBOR`)
- **`services/frontend-next/lib/menu.ts`**:
  - Mengubah struktur `DEFAULT_SIDEBAR_GROUPS` dan `MENU_REGISTRY` sehingga `mod_dasbor_mbg` berada di dalam grup `DASBOR` (`grp_dasbor`, urutan `1.9`) sebagai menu induk yang dapat diperluas (*expandable*) dengan 3 `subItems`:
    1. `Ringkasan Eksekutif` (`/dashboard/mbg/ringkasan`)
    2. `Keracunan Pangan` (`/dashboard/mbg/keracunan`)
    3. `Pengawasan Gizi` (`/dashboard/mbg/pengawasan`)
  - Menambahkan fungsi `normalizeDasborMbgMenu(config)` pada `convertConfigToSidebarGroups` agar konfigurasi menu dari database (`menu_configs`) yang masih menyimpan grup lama `grp_dasbor_mbg` atau item terpisah otomatis dinormalisasi menjadi 1 menu `Dasbor MBG` bersub-menu.
- **`database/init/069_dasbor_mbg_submenu_under_dasbor.sql` & `database/rollback/069_rollback.sql`**:
  - Migrasi SQL idempoten untuk menghapus grup terpisah `grp_dasbor_mbg` pada `menu_configs.config` dan menyisipkan `mod_dasbor_mbg` beserta `subItems` ke dalam grup `grp_dasbor`.
- **`services/frontend-next/components/dasbor-mbg/DasborMbgClient.tsx`**:
  - Menghapus bilah tab `<nav>` di dalam halaman sehingga navigasi antar sub-halaman terpusat di sidebar.
  - Memperbarui judul dan subjudul header (`HEADER_META`) menjadi formal dan spesifik sesuai fungsi masing-masing halaman.

### 2. Pemisahan Fokus Peta & Tata Letak Ketiga Sub-Halaman
- **`services/frontend-next/components/dasbor-mbg/MbgSections.tsx`**:
  - Menambahkan komponen peta tunggal khusus **`MbgKeracunanMap`** untuk halaman `/dashboard/mbg/keracunan` dan **`MbgGiziMap`** untuk halaman `/dashboard/mbg/pengawasan`, sedangkan **`MbgMapSection`** (komparasi spasial 2 kolom) dikhususkan untuk `/dashboard/mbg/ringkasan`.
  - Memperbarui `SectionHead` agar mendukung lencana kategori analitis (`badge`) dengan tipografi eksekutif.
- **`services/frontend-next/components/dasbor-mbg/MbgRingkasan.tsx` (`/dashboard/mbg/ringkasan`)**:
  - Dirancang sebagai **Pusat Komando Eksekutif & Korelasi Risiko Lintas Modul**:
    - Panel **Kajian Eksekutif: Identifikasi Permasalahan & Rekomendasi Pengerahan Sumber Daya** dengan lencana status otomatis (`SIAGA KLB PANGAN` / `WASPADA RISIKO SPPG` / `TERKENDALI`) dan 3 kartu arahan pengerahan:
      1. *Respons Cepat KLB & Diagnostik Lab* (TGC Puskesmas/Dinkes & percepatan sampel Labkesda).
      2. *Audit Lingkungan & Celah Cakupan SPPG* (inspeksi kesehatan lingkungan darurat pada SPPG terdampak KLB yang belum diaudit F1–F13).
      3. *Mitigasi & Pembinaan Pra-KLB* (supervisi TPG pada SPPG skor SOP < 80 atau F12 BELUM BAIK).
    - **Scorecard Indikator Kinerja Utama (3 Pilar)**: Beban KLB Keracunan, Kepatuhan Standar SPPG, dan Integrasi & Mitigasi Risiko.
    - **Peta Komparasi Spasial 2 Kolom (`MbgMapSection`)**, **Distribusi Beban Wilayah vs Dekomposisi Status Pengawasan SPPG Terdampak**, serta **Matriks Korelasi Risiko Lintas Modul per Wilayah**.
- **`services/frontend-next/components/dasbor-mbg/KeracunanDashboardView.tsx` (`/dashboard/mbg/keracunan`)**:
  - Dirancang sebagai **Dasbor Investigasi Epidemiologi & Respons KLB Keracunan Pangan**:
    - Seluruh judul bagian diubah menjadi formal-analitis (tanpa kalimat tanya).
    - Menambahkan **Kajian Epidemiologi & Prioritas Pengerahan Tim Gerak Cepat (TGC)** di bawah 6 kartu KPI.
    - Bagian geospasial menampilkan **peta tunggal `MbgKeracunanMap`** (2/3 lebar) bersanding langsung dengan **Tabel Peringkat Wilayah Terdampak** (1/3 lebar).
- **`services/frontend-next/components/dasbor-mbg/GiziDashboardView.tsx` (`/dashboard/mbg/pengawasan`)**:
  - Dirancang sebagai **Dasbor Audit Kepatuhan Standar & Pembinaan Pengawasan Gizi SPPG (Formulir 1–13)**:
    - Seluruh judul bagian diubah menjadi formal-analitis (tanpa kalimat tanya).
    - Menambahkan **Kajian Audit Standar & Arahan Pengerahan Tim Pembina Gizi (TPG Puskesmas / Dinkes)** di bawah 6 kartu KPI.
    - Bagian geospasial menampilkan **peta tunggal `MbgGiziMap`** (2/3 lebar) bersanding langsung dengan **Tabel Rekap Pengawasan Wilayah** interaktif (1/3 lebar, klik provinsi untuk memfokuskan peta ke kab/kota).

## Verifikasi
- Migrasi SQL `069_dasbor_mbg_submenu_under_dasbor.sql` dan rollback `069_rollback.sql` diuji pada container `skdr-postgres` (apply → rollback → apply → re-apply idempoten).
- Pemeriksaan tipe TypeScript (`docker exec skdr-frontend-next npx tsc --noEmit`) menghasilkan **0 error**.

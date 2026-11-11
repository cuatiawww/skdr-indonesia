# PR 055: Penghapusan Kartu Naratif Keracunan Pangan & Injeksi Data Seed Dasbor MBG

- **Tanggal:** 2026-11-11
- **Lapisan:** Frontend, Database

## Perubahan Utama

### 1. Pembersihan UI Halaman Keracunan Pangan MBG (`/dashboard/mbg/keracunan`)
- **`services/frontend-next/components/dasbor-mbg/KeracunanDashboardView.tsx`**:
  - Menghapus blok 3 kartu ringkasan naratif (*Evaluasi Beban & Keparahan KLB*, *Hambatan Respons Cepat & Lab*, *Sumber Risiko & Tindakan Lapangan*) di bawah 6 kartu KPI utama agar tampilan langsung berfokus pada indikator kuantitatif dan peta geospasial KLB.

### 2. Injeksi Otomatis Data Transaksi Program MBG (`database/init/070_seed_mbg_demo_data.sql`)
- **`database/init/070_seed_mbg_demo_data.sql` & `database/rollback/070_rollback.sql`**:
  - Mempromosikan dataset `dev/seed/mbg_demo.sql` menjadi migrasi SQL idempoten `070` yang dijalankan otomatis oleh *migration runner* backend (`MIGRATIONS_DIR`), berisi:
    - **52 kejadian Keracunan Pangan MBG** (`DEMO-MBG-K001`..`K052`) beserta riwayat pembaruan kasus harian (`mbg_keracunan_update`), profil gejala, kelompok umur, sampel lab & turnaround time (TAT), status SLHS/IKL, dan kepatuhan SOP.
    - **72 kunjungan Pengawasan Gizi MBG** (`DEMO-MBG-P001`..`P072`) dengan **891 isian Formulir 1–13** (`mbg_form`), tersebar pada 15 kab/kota di 5 provinsi dengan koordinat SPPG dan 14 SPPG beririsan di kedua modul.
  - Seluruh baris bertanda `no_laporan`/`no_kunjungan` `DEMO-MBG-%` dan menghapus baris `DEMO-MBG-%` lama terlebih dahulu tanpa menyentuh laporan/kunjungan asli pengguna; dapat dihapus bersih melalui `database/rollback/070_rollback.sql`.

## Verifikasi
- `tsc --noEmit` pada `skdr-frontend-next`: **0 error**.
- Uji migrasi `070_seed_mbg_demo_data.sql` → `070_rollback.sql` → `070_seed_mbg_demo_data.sql` di dalam `--single-transaction` pada `skdr-postgres`: sukses dengan hasil `52` keracunan, `72` kunjungan, dan `891` formulir.


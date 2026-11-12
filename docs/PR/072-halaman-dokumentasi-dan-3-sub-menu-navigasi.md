# PR 072: Portal Halaman Dokumentasi Komparatif & 3 Sub-Menu Navigasi (SKDR, MBG, Zoonosis)

## Deskripsi Perubahan
Pull Request ini menghadirkan portal halaman web dokumentasi modern interaktif (`/dokumentasi`, `/dokumentasi/skdr`, `/dokumentasi/mbg`, `/dokumentasi/zoonosis`) dan menyusun 3 sub-menu terdedikasi di bawah menu **Dokumentasi** pada grup sidebar **LAINNYA** (`grp_bantuan`):
1. **Dokumentasi SKDR** (`/dokumentasi/skdr`): Dokumentasi komparasi sistem lama vs baru untuk Surveilans Berbasis Indikator (IBS) dan Kejadian (EBS).
2. **Dokumentasi MBG** (`/dokumentasi/mbg`): Dokumentasi komparasi sistem lama vs baru untuk Program MBG (Pengawasan Gizi SPPG Form 1–13 dan Investigasi Keracunan Pangan MBG dua-tingkat).
3. **Dokumentasi Zoonosis** (`/dokumentasi/zoonosis`): Dokumentasi sistem baru untuk Form PE Zoonosis One Health (Rabies/GHPR, Leptospirosis, Antraks, Flu Burung H5N1), klasifikasi kasus medis, dan dasbor analitik spasial 2-dock.

---

## Masalah yang Dipecahkan
1. **Ketiadaan Visualisasi Dokumentasi Sistem di Aplikasi:**
   - Sebelumnya, dokumentasi sistem hanya berupa berkas markdown statis di repositori atau halaman dokumentasi lawas (PR 012) yang belum mencakup perkembangan fitur terkini (Program MBG, Form Individu, Dasbor 2-dock, dan Zoonosis One Health).
2. **Ketiadaan Sub-Menu Khusus di Navigasi Sidebar:**
   - Menu `Dokumentasi` di sidebar masih berstatus item tunggal tanpa sub-menu, sehingga pengguna tidak dapat langsung melompat ke dokumentasi bidang spesifik yang ingin dipelajari.

---

## Solusi & Arsitektur Implementasi

### 1. Migrasi Database Navigasi `077_sub_menu_dokumentasi_3bidang.sql`
- Menambahkan 3 sub-item eksplisit pada `mod_dokumentasi` di dalam `app_settings.navigation_menu`:
  - `sub_dok_skdr`: `/dokumentasi/skdr` (ikon `Activity`)
  - `sub_dok_mbg`: `/dokumentasi/mbg` (ikon `Utensils`)
  - `sub_dok_zoonosis`: `/dokumentasi/zoonosis` (ikon `Bug`)
- Memperbarui fallback di `services/frontend-next/lib/menu.ts` agar selaras secara tipe data.

### 2. Komponen Portal Dokumentasi Interaktif (`DokumentasiPortal.tsx`)
- Mengadopsi standar desain **SATUSEHAT v4 DTO Kemenkes RI**:
  - Kanvas *pure white* (`#FFFFFF`), tipografi Manrope, PageHeader 2-Grid (~70/30%) dengan tombol Back terintegrasi di Breadcrumb.
  - Bilah 3 Navigation Pills interaktif di atas konten dengan indikator aktif SATUSEHAT Teal.
  - Filter seksi cepat: `Semua Bagian`, `Sistem Lama`, `Sistem Baru`, `Diagram Alur`, dan `Matriks Variabel`.
  - Kartu perbandingan komparatif dengan badge status `Sistem Eksisting (Lama)` vs `Sistem Baru (SKDR Indonesia)`.
  - Diagram alur Mermaid terintegrasi yang dirender langsung menjadi grafik SVG dinamis.
  - Tabel matriks variabel interaktif dengan penyorotan peningkatan fungsionalitas sistem baru.

### 3. Struktur Rute Next.js 15 App Router
- `/skdr/dokumentasi`: Menampilkan portal dokumentasi dengan default tab SKDR.
- `/skdr/dokumentasi/skdr`: Menampilkan dokumentasi komparatif SKDR (IBS & EBS).
- `/skdr/dokumentasi/mbg`: Menampilkan dokumentasi komparatif Program MBG (Gizi & Keracunan).
- `/skdr/dokumentasi/zoonosis`: Menampilkan dokumentasi komparatif Zoonosis One Health.

---

## Berkas yang Diubah / Dibuat
- `database/init/077_sub_menu_dokumentasi_3bidang.sql`
- `database/rollback/077_rollback.sql`
- `services/frontend-next/lib/menu.ts`
- `services/frontend-next/components/dokumentasi/DokumentasiPortal.tsx`
- `services/frontend-next/app/dokumentasi/page.tsx`
- `services/frontend-next/app/dokumentasi/skdr/page.tsx`
- `services/frontend-next/app/dokumentasi/mbg/page.tsx`
- `services/frontend-next/app/dokumentasi/zoonosis/page.tsx`
- `docs/DOKUMENTASI_SISTEM_EXISTING_DAN_BARU.md`
- `docs/PR/072-halaman-dokumentasi-dan-3-sub-menu-navigasi.md`
- `docs/CHANGE_LOG_MATRIX.md`

---

## Verifikasi & Pengujian
- **Database Migration:**
  Migrasi `077_sub_menu_dokumentasi_3bidang.sql` sukses diterapkan pada database `skdr_indonesia`. Kueri `jsonb_array_elements` mengonfirmasi 3 sub-item aktif di bawah `mod_dokumentasi`.
- **TypeScript Compilation:**
  `npx tsc --noEmit` keluar dengan exit code 0 (ZERO ERRORS).
- **HTTP Endpoints (curl.exe):**
  - `/skdr/dokumentasi` $\to$ **HTTP 200**
  - `/skdr/dokumentasi/skdr` $\to$ **HTTP 200**
  - `/skdr/dokumentasi/mbg` $\to$ **HTTP 200**
  - `/skdr/dokumentasi/zoonosis` $\to$ **HTTP 200**

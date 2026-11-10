# PR 037 — Integrasi SKDR Landing Page sebagai Halaman Pertama (`/` & `/skdr`)

Tanggal: 10 Nov 2026 (WIB). Branch: `main`.

## Latar Belakang
Sebelumnya, ketika pengguna membuka URL aplikasi SKDR (`/` atau `/skdr`), middleware autentikasi langsung mengarahkan ke halaman login (`/skdr/login`) untuk mengakses halaman `Beranda` (`app/page.tsx`). Pengguna menginginkan tampilan **SKDR Landing Page** (`skdr-landing-page`) menjadi halaman pertama yang tampil sebelum pengguna masuk ke dasbor maupun form transaksi.

## Perubahan Utama
1. **Landing Page Publik di `/` (`app/page.tsx` -> `/skdr`)**:
   - Memindahkan tampilan dan aset `skdr-landing-page` ke `services/frontend-next/components/landing/`:
     - `LandingNavbar.tsx` (navigasi landing page, status online, tombol **Akses SKDR** / **Buka Dasbor**).
     - `LandingHero.tsx` (wave header Teal & Lime, ilustrasi dokter `dr.webp`, badge Verifikasi Epidemiologi, CTA **Pantau Dasbor SKDR**, serta 3 kartu fitur interaktif `EBS Terintegrasi`, `24 Jam Respons KLB`, `Laporan Kasus PE`).
     - `LandingAbout.tsx` (profil SKDR, jadwal pemantauan & verifikasi 7x24, layanan Hello Titan 1500 915).
     - `LandingDiseases.tsx` (eksplorasi 6 penyakit prioritas KLB & Zoonosis: Antraks, Rabies, Leptospirosis, Flu Burung, Campak, ISPA/Arbovirus beserta protokol 7-1-7).
     - `LandingRapidResponse.tsx` (narasi respons cepat, koordinasi One Health, TGC).
     - `LandingStats.tsx` (kartu capaian target verifikasi <24 jam, cakupan 38 provinsi / 514 kab/kota, kerangka 7-1-7).
     - `LandingFooter.tsx` (footer resmi Kemenkes RI + tautan cepat ke `/dashboard`, `/dasbor/ebs-ibs`, `/dasbor/mbg`, dan `/beranda`).
     - `LandingModals.tsx` (`FeatureDetailModal`, `DashboardModal` menampilkan ringkasan modul + statistik live `/api/v1/analytics/home` hanya jika user sudah login tanpa angka simulasi dummy, serta `PortalLoginModal` terhubung ke `useAuth().login()`).
   - Menambahkan aset gambar ke `services/frontend-next/public/images/` (`bawah.webp`, `dr.webp`, `header-atas.webp`, `header-bawah.webp`, `Logo-Kemenkes.png`, `logo_kemenkes.png`, `mockup_dr_edi.png`) memakai `PUBLIC_BASE_PATH`.
2. **Akses Publik `/` & Redirect Root**:
   - `services/frontend-next/lib/access.ts`: `routeNeed('/')` menjadi `{ kind: 'public' }` sehingga `middleware.ts` tidak memaksa redirect ke `/login` saat membuka Landing Page.
   - `services/frontend-next/components/layout/LayoutContent.tsx`: path `/` dan `/login` dirender penuh tanpa sidebar `AppShell` dan tanpa `AuthGuard`.
   - `services/frontend-next/next.config.mjs`: saat `NEXT_PUBLIC_BASE_PATH` aktif (`/skdr`), akses ke root `/` (`http://host/`) diarahkan otomatis ke `/skdr`.
   - `services/frontend-next/app/login/page.tsx`: menambahkan tautan kembali `← Halaman Utama` ke Landing Page (`/`).
3. **Pemindahan Beranda Terautentikasi ke `/beranda`**:
   - Memindahkan halaman `Beranda` sebelumnya (PR 016: ringkasan & rilis data surveilans) ke `services/frontend-next/app/beranda/page.tsx` dengan proteksi `{ kind: 'login' }` pada `lib/access.ts` & `lib/auth.ts`.
   - Memperbarui tautan `Beranda` ke `/beranda` di `lib/menu.ts`, `Breadcrumbs.tsx`, `DashboardHeader.tsx`, dan `AppShell.tsx`.
   - Migrasi `database/init/059_landing_page.sql` (+ `database/rollback/059_rollback.sql`) memperbarui item `mod_beranda` pada `app_settings.navigation_menu` dari `/` ke `/beranda` secara idempoten dengan backup `app_settings_bak_059`.

## Verifikasi
- `npm run typecheck` (`tsc --noEmit` di container `skdr-frontend-next`): **0 error**.
- Restart `skdr-backend-rust` & `skdr-frontend-next`: backend log mencatat `applied migration 059_landing_page.sql`.
- Verifikasi E2E (`verify_pr037.py`):
  - `mod_beranda` pada `app_settings.navigation_menu` tercatat `"/beranda"`.
  - `GET /` mengembalikan redirect `307` ke `/skdr`.
  - `GET /skdr` (tanpa login) mengembalikan HTTP `200` dengan konten Landing Page lengkap (tanpa redirect ke `/login` dan tanpa error Next.js).
  - Seluruh 7 aset gambar di `/skdr/images/*` mengembalikan HTTP `200`.
  - Rute terproteksi `/skdr/beranda` dan `/skdr/dashboard` tetap mewajibkan login (`307` -> `/login`), dan sesi aktif dapat mengakses `/skdr/beranda` serta `/skdr/dasbor/mbg` (`200`).

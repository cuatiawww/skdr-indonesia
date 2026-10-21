# PR 014 — Hapus branding lama, ganti dengan SKDR INDONESIA

## Tujuan
Header, sidebar, metadata, dan teks bawaan tidak lagi menampilkan branding lama dari proyek NLP. Pada render pertama, termasuk saat API lambat atau mati, yang tampil langsung judul **SKDR INDONESIA**, subjudul **Sistem Kewaspadaan Dini dan Respons**, dan logo Kemenkes.

## Perubahan
- `lib/settings-context.tsx`: nilai default `app_name`, `app_tagline`, dan `footer_text` diganti ke SKDR, sehingga tidak ada kedipan sebelum `/api/v1/console/settings` termuat. Penggantian nama lama yang di-hardcode dihapus.
- `DashboardHeader.tsx` dan `DashboardSidebar.tsx`:
  - Logo cadangan diganti ke `Logo-Kemenkes.png`.
  - Judul khusus halaman prototype dihapus.
  - Gambar latar lama di header diganti gradasi biru-teal.
- `lib/menu.ts`: `DEFAULT_NAVIGATION_CONFIG` kini sama dengan menu SKDR di `app_settings.navigation_menu`. Menu bawaan lama tidak lagi muncul sesaat.
- `lib/modules.ts`, `lib/auth.ts`, `AppShell.tsx`: entri modul, izin, dan menu konsol untuk halaman lama yang sudah tidak ada dihapus.
- Locale `id` dan `en`:
  - `header.*` dan `skdr.layout.appTagline` diganti ke SKDR.
  - Teks lama di tingkat regional diganti dengan cakupan Indonesia.
  - Copyright `en` diganti ke Kemenkes.
  - Empat key yang tidak dipakai dihapus.
- `app/icon.svg`: favicon baru berupa tanda plus putih di atas latar teal.
- User-Agent pada proxy OSM diganti menjadi `SKDR-Indonesia/1.0`.
- File yang dihapus (tidak dipakai):
  - `public/abvc-logo.webp`
  - `public/bg header_abvc nlp.webp`
  - `public/data/data_crawl_p1` dan `data_crawl_p2` (sekitar 10 MB data NLP)
  - `lib/trend-highlights.mjs`

## Migrasi
- `023_branding_skdr.sql`: mengisi `app_name` = "SKDR INDONESIA", `app_tagline` = "Sistem Kewaspadaan Dini dan Respons", dan `footer_text` = "SKDR Indonesia". Nilai sebelumnya dicadangkan ke tabel `app_settings_bak_023`.
- Rollback: `database/rollback/023_rollback.sql`.

## Uji
- `tsc --noEmit` exit 0.
- Smoke test: `/main-dashboard`, `/penyakit`, `/dokumentasi`, `/ebs` mengembalikan 200, dan `/api/v1/console/settings` mengembalikan 200.
- Playwright pada 1440×900 dengan `/api/v1/*` diblokir dan diperlambat 8 detik, untuk 3 halaman:
  - Tidak ada kata branding lama di DOM.
  - Judul dan subjudul SKDR tampil.
  - Logo `/skdr/Logo-Kemenkes.png` tampil.
- HTML hasil SSR juga bersih, dan `icon.svg` mengembalikan 200.

## Sisa yang sengaja dibiarkan
Identifier internal kode peta tetap dipertahankan karena fungsional dan tidak tampil ke pengguna:
- `AseanMap`, `asean-scope`, `aseanAdminPlaces`
- kode region `ASEAN`/`ASEAN_PLUS_THREE` pada data penerbangan
- field tipe `asean_*` dan token warna tailwind `asean`

Komentar serta seed negara pada migrasi lama (004, 007, 008) juga tidak diubah karena sudah dijalankan.

## Deploy
1. Jalankan `023_branding_skdr.sql`.
2. Rebuild atau restart image frontend.
3. Backend tidak berubah.

# PR 017 — Navigasi Grup (Sidebar Kiri)

Status: **sudah di-push**

## Ringkasan
Navigasi utama disusun ulang menjadi lima grup di sidebar kiri. Struktur menu tetap diambil dari DB (`app_settings.navigation_menu`, migrasi 028).

| Grup | Menu |
|---|---|
| Beranda | Beranda (`/`) |
| Dasbor | Dasbor Utama (`/main-dashboard`), Penyakit (`/penyakit`), Mode TV (`/tv`, "Sedang Dalam Pengembangan") |
| Transaksi | Form PE › sub-menu per penyakit dari registri `pe_form_definitions` (otomatis) + Daftar PE (`/pe`) |
| Integrasi | Sinkronisasi EBS (`/ebs`) |
| Lainnya | Dokumentasi (`/dokumentasi`) |

## Perilaku
- Desktop (≥1024 px): sidebar tetap di kiri. Tombol di bagian atas sidebar menciutkannya menjadi rail ikon dan membukanya kembali. Area konten ikut menyesuaikan lebar, dan statusnya disimpan di `localStorage` (`skdr_sidebar_collapsed`).
- Rail ikon: setiap ikon punya tooltip, dan Form PE tampil sebagai *flyout* berisi sub-menu. Flyout tertutup dengan klik di luar atau tombol Esc.
- Grup dapat dibuka/tutup. Grup dan menu yang aktif disorot dan otomatis terbuka.
- Seluler: hamburger di header membuka laci (drawer) dengan overlay. Laci tertutup dengan overlay, tombol X, Esc, atau saat berpindah halaman.
- Breadcrumb di atas konten mengikuti grup, misalnya `Beranda › Transaksi › Form PE › Leptospirosis › Detail`.
- Halaman baru **Daftar PE** (`/pe`) memuat seluruh laporan PE lintas penyakit, dengan filter penyakit/status/pencarian, aksi lihat/ubah/hapus (hanya Draf), dan Tambah PE per formulir. Backend `GET /api/v1/pe/cases` kini juga mengembalikan `form_key`.
- `/tv` sekarang tampil di shell biasa (sidebar + breadcrumb) selama Mode TV belum dirilis.
- Perbaikan kecil: bar filter di `/penyakit/[kode]` tidak lagi *sticky* (sebelumnya menutupi kartu statistik saat halaman digulir).

## Item yang dikeluarkan dari menu (rutenya tetap ada)
- Grup MASTER DATA: Data Provinsi, Data Kabupaten/Kota, Data Penyakit.
- Pintasan di header: Beranda, Dasbor, Mode TV, Penyakit (sudah ada di sidebar).
- `guestMenu` lama (berbahasa Inggris, tidak terpakai) di `AppShell`.

## Basis data
- `database/init/028_navigasi_grup.sql` (backup ke `app_settings_bak_028`)
- `database/rollback/028_rollback.sql`
- `database/init/029_nav_lainnya.sql` mengganti nama grup "Bantuan & Dokumentasi" menjadi "Lainnya" (backup ke `app_settings_bak_029`), dengan rollback di `database/rollback/029_rollback.sql`

## Berkas
- `services/frontend-next/lib/{menu.ts, nav.ts}`
- `services/frontend-next/components/layout/{AppShell, DashboardSidebar, DashboardHeader, Breadcrumbs, LayoutContent}.tsx`
- `services/frontend-next/app/pe/page.tsx` (baru), `app/penyakit/[kode]/page.tsx`
- `services/backend-rust/src/pe.rs`

## Verifikasi
- `tsc --noEmit` 0 error.
- Playwright 1440 dan 390: sidebar terbuka/tertutup, tooltip, flyout, laci seluler, breadcrumb, 0 console error. Tangkapan layar ada di `/workspace/pr017-screenshots/`.

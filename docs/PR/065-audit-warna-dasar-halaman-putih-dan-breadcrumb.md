# PR 065: Audit Warna Dasar Halaman Murni Putih & Penyelarasan Pill Breadcrumb

## Ringkasan Perubahan
1. **Audit & Standardisasi Warna Dasar Seluruh Halaman (`#FFFFFF` Murni Putih)**:
   - Menyelaraskan seluruh kanvas dasbor dan formulir transaksi agar berlatar belakang murni putih (`#ffffff`), menghilangkan warna abu-abu keperakan (`#F1F2F3` / `#f8fafc`) yang sebelumnya membuat kartu-kartu putih tampak kontras redup dan tidak padu.
   - Memperbarui variabel CSS `--page-bg` di `services/frontend-next/app/globals.css` dari `241 242 243` menjadi `255 255 255`. Seluruh 40+ rute/halaman yang menggunakan kelas Tailwind `bg-page` (seperti Keracunan Pangan MBG, Pengawasan Gizi, Laporan EBS/IBS, Zoonosis, Spasial, Master Data, Tatakelola, dll.) otomatis berlatar putih bersih.
   - Menetapkan deklarasi `background-color: #ffffff;` pada `html, body` di `globals.css` untuk mencegah latar bawaan browser mengaburkan kanvas.
   - Memperbarui elemen pembungkus utama `<main>` pada `services/frontend-next/components/layout/AppShell.tsx` dari `bg-[#f8fafc]` menjadi `bg-white`.

2. **Penyelarasan Desain Breadcrumb (Modern Soft Pill Container)**:
   - Mengemas deretan breadcrumb di `services/frontend-next/components/layout/Breadcrumbs.tsx` ke dalam kontainer pill lembut (`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-1.5 text-xs text-slate-600 shadow-2xs backdrop-blur-xs`).
   - Breadcrumb tidak lagi berupa teks polos yang mengambang canggung di atas halaman putih, melainkan memiliki bingkai yang rapi, lembut, dan elegan.
   - Penyelarasan warna teks dan elemen:
     - Ikon Home: `text-slate-400 group-hover:text-primary` dengan label Beranda `font-medium`.
     - Pemisah: `ChevronRight` berukuran `h-3 w-3 shrink-0 text-slate-300`.
     - Tautan induk: `font-medium text-slate-600 transition-colors hover:text-primary`.
     - Halaman aktif (crumb terakhir): `font-semibold text-slate-900` dengan atribut `aria-current="page"`.
   - Memberikan padding `pt-3.5` yang seimbang antara bilah header dan judul halaman/kartu di bawahnya.

## Berkas yang Diubah
- `services/frontend-next/app/globals.css` (penyetelan `--page-bg: 255 255 255;` dan `background-color: #ffffff` pada `html, body`)
- `services/frontend-next/components/layout/AppShell.tsx` (penggantian `bg-[#f8fafc]` menjadi `bg-white` pada `<main>`)
- `services/frontend-next/components/layout/Breadcrumbs.tsx` (re-styling kontainer breadcrumb pill halus `bg-slate-50/90 border border-slate-200/90 shadow-2xs`)
- `docs/CHANGE_LOG_MATRIX.md` (pencatatan baris PR 065)
- `docs/PR/065-audit-warna-dasar-halaman-putih-dan-breadcrumb.md` (dokumentasi PR)

## Verifikasi & Pengujian
- `npx tsc --noEmit`: 0 error.
- Sinkronisasi file ke container Docker `skdr-frontend-next` via `docker cp`.
- curl `http://127.0.0.1:3200/skdr/login`: HTTP 200 OK.
- curl `http://127.0.0.1:3200/skdr/keracunan-mbg`: HTTP 307 OK (redirect autentikasi terproteksi).

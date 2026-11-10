# PR 043 — Matriks Analisa: Panel Filter Samping (Show/Hide)

Tanggal: 2026-11-11 · Lingkup: Frontend saja (tanpa migrasi, tanpa perubahan API)

## Ringkasan
Bar filter horizontal di halaman **Dasbor Limited → Matriks Analisa** dipindah menjadi **panel filter di sisi kiri** yang bisa disembunyikan/ditampilkan.

## Perubahan
- **Panel kiri (desktop >= 1024 px)**: lebar 280 px, *sticky* saat halaman di-scroll, semua filter tersusun vertikal: Sumber, Rentang minggu epid (+ preset), Provinsi, Kab/Kota, Kecamatan, Penyakit, Agregasi waktu (tab Ringkasan/Matriks), Penyakit menurut (EBS), dan **Filter lanjutan** sebagai bagian yang bisa dibuka-tutup (otomatis terbuka bila ada filter lanjutan aktif).
- **Lencana jumlah filter aktif** di judul panel dan di tombol toggle (rentang minggu tidak dihitung).
- Tombol **Atur ulang filter** di bawah panel (Sumber tetap dipertahankan).
- Tombol **Sembunyikan filter / Tampilkan filter** di header halaman; saat disembunyikan konten memakai lebar penuh. Status disimpan di `localStorage` (`skdr-matriks-analisa-filter-panel`).
- **Layar sempit (< 1024 px)**: panel menjadi *drawer* overlay (klik latar / tombol X untuk menutup); default tertutup.
- **Akses cepat Sumber** (IBS/EBS/Semua) tetap ada di atas konten, memakai state yang sama dengan panel (tidak ada state ganda).
- Parameter URL filter tidak berubah (tautan lama tetap berlaku).

## Berkas
- `services/frontend-next/components/analisa/FilterBar.tsx` — tata letak vertikal, `activeFilterCount()`, tombol reset, Filter lanjutan collapsible.
- `services/frontend-next/components/analisa/MatriksAnalisaClient.tsx` — tata letak dua kolom, toggle + localStorage, drawer mobile, Sumber cepat.

## Verifikasi
- `tsc --noEmit` 0 error.
- Render headless (IBS, Jawa Barat, M40–M44 2026): panel tampil, panel disembunyikan, Filter lanjutan aktif, panel sticky saat scroll, drawer di viewport 390 px.

## Rollback
Revert commit ini (frontend saja).
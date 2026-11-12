# PR 066: Redesign Stepper Kemajuan Wizard: Compact, Non-Sticky, & Bar Progres SATUSEHAT

## Ringkasan Perubahan
1. **Non-Sticky (Tidak Mengambang Saat Halaman Di-Scroll)**:
   - Melepaskan kelas `sticky top-0 z-30` dan `backdrop-blur supports-[backdrop-filter]:bg-white/95` pada pembungkus komponen `Stepper` di `services/frontend-next/components/laporan/LaporanWizard.tsx` dan `services/frontend-next/components/pe/PeFormEditor.tsx`.
   - Stepper kini berposisi statis/alamiah (`relative`) di bagian atas formulir, sehingga saat pengguna menggulir (*scroll*) ke bawah untuk mengisi formulir, bilah kemajuan tidak lagi mengambang menutupi bagian atas layar dan layar memiliki ruang pandang vertikal yang maksimal.
   - Mengurangi aturan CSS `scroll-margin-top` pada elemen isian input dari `240px` menjadi `100px` di `LaporanWizard.tsx`, `MbgWizard.tsx`, `KpWizard.tsx`, dan `PeFormEditor.tsx` agar perpindahan fokus atau fitur "Lompat ke isian belum valid" mendarat tepat dan nyaman di bawah bilah navigasi utama.

2. **Desain Kompak & Hemat Ruang (*Space-Efficient Stepper*)**:
   - Memangkas ketinggian total komponen stepper lebih dari 50% (dari ~195px menjadi ~95px) tanpa mengurangi kelengkapan informasi.
   - **Baris 1 (Header)**: Menyandingkan label "KEMAJUAN" dengan lencana kuantitatif ringkas (`{done}/{total} wajib terisi · {pct}%`) dan tombol aksi "Lompat ke isian belum valid" / "Semua isian valid" dalam satu tingkat yang rapi.
   - **Baris 2 (Bilah Progres)**: Mengubah ketinggian bar progres menjadi lebih ramping (`h-1.5`) dengan margin yang presisi.
   - **Baris 3 (Navigasi Langkah)**:
     - Mengurangi dimensi lingkaran node langkah dari `h-9 w-9` menjadi `h-7 w-7` (lingkaran dalam `h-5 w-5`).
     - Menyelaraskan garis horizontal penghubung langkah agar tepat membelah pusat lingkaran (`top-[15px]`).
     - Mengubah tipografi judul langkah menjadi satu baris bersih berfitur pemotongan otomatis (`line-clamp-1 truncate text-[11px]`).
     - Memberikan penanda fokus langkah aktif yang elegan (`bg-brand-50/80 border border-brand-300/80 rounded-xl shadow-2xs`).

3. **Penyelarasan Bar Progres ke Palet Resmi SATUSEHAT Design System**:
   - Memperbarui gradien animasi `.pe-bar` dari warna legacy lama menjadi palet resmi SATUSEHAT Kemenkes RI (`linear-gradient(90deg, #16B3AC 0%, #128F8A 35%, #3899FE 70%, #16B3AC 100%)`).
   - Mendaftarkan kelas utilitas `.pe-bar` dan `@keyframes peShine` secara sentral di `services/frontend-next/app/globals.css`.
   - Mengubah garis penghubung dan lingkaran SVG langkah aktif/selesai agar konsisten menggunakan warna brand SATUSEHAT (`#16B3AC` / `#128F8A` / `#3899FE`).

## Berkas yang Diubah
- `services/frontend-next/app/globals.css` (definisi sentral `.pe-bar` & `@keyframes peShine` palet SATUSEHAT)
- `services/frontend-next/components/laporan/LaporanWizard.tsx` (redesign komponen `Stepper`, non-sticky, `scroll-margin-top: 100px`, palet SATUSEHAT)
- `services/frontend-next/components/pengawasan-gizi/MbgWizard.tsx` (`scroll-margin-top: 100px`, `.pe-bar` SATUSEHAT)
- `services/frontend-next/components/keracunan-mbg/KpWizard.tsx` (`scroll-margin-top: 100px`)
- `services/frontend-next/components/pe/PeFormEditor.tsx` (redesign stepper Form PE non-sticky, compact, `scroll-margin-top: 100px`, `.pe-bar` SATUSEHAT)
- `docs/CHANGE_LOG_MATRIX.md` (pencatatan baris PR 066)
- `docs/PR/066-redesign-stepper-wizard-compact-satusehat.md` (dokumentasi PR)

## Verifikasi & Pengujian
- `npx tsc --noEmit`: 0 error.
- Sinkronisasi file ke container Docker `skdr-frontend-next` melalui `docker cp`.
- curl `http://127.0.0.1:3200/skdr/login`: HTTP 200 OK.
- Pengecekan visual: stepper tetap berada di atas kanvas formulir dan tidak menempel/mengambang saat scroll, tinggi berkurang drastis, bar progres menampilkan gradien SATUSEHAT Teal & Blue.

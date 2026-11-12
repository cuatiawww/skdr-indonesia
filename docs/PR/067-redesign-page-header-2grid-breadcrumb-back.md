# PR 067: Redesign Page Header 2-Grid (~70/30%), Tombol Back di Breadcrumb & Hapus Eyebrow

**Nomor PR**: 067  
**Tanggal**: 12 November 2026  
**Penulis**: Antigravity  
**Kategori**: Frontend (UI/UX)  
**Status**: Selesai  

---

## 1. Konteks & Latar Belakang
Berdasarkan evaluasi tampilan antarmuka SKDR Indonesia:
1. **Tombol Back (Kembali)**: Sebelumnya tombol back diletakkan sebagai kotak tombol terpisah tepat di sebelah kiri judul pada beberapa halaman formulir/detail, menyebabkan layout header terdorong ke kanan dan tidak seragam dengan halaman lainnya. Tombol back dipindahkan ke samping kontainer pill breadcrumb (`[ <- Kembali ] [ ⌂ Beranda > Group > Item > Detail ]`), sehingga user dapat kembali dengan cepat.
2. **Breadcrumb Interaktif**: Setiap level breadcrumb (termasuk level grup navigasi seperti *Tatakelola* `-> /tatakelola` atau *Dasbor* `-> /dashboard`, hingga menu dan sub-menu) kini aktif dan dapat diklik untuk navigasi balik yang fleksibel.
3. **Pembersihan Teks di Atas Judul (Hapus Eyebrow)**: Teks kecil di atas judul (eyebrow / kicker) dihilangkan di seluruh halaman agar tampilan lebih bersih, profesional, dan fokus langsung pada **Judul Halaman** serta **Deskripsi** kegunaan modul/formulir.
4. **Tata Letak 2-Grid Proporsional (~70% Judul & Deskripsi / ~30% Tombol Aksi)**: Header halaman distandardisasi menggunakan sistem grid responsif (`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-6`):
   - **Kolom Kiri (`lg:col-span-8`, ~70%)**: Menampung Judul (`text-xl sm:text-2xl font-bold`) dan Deskripsi (`text-xs sm:text-sm text-slate-600 leading-relaxed`) beserta badge status / metadata pendukung.
   - **Kolom Kanan (`lg:col-span-4 lg:justify-end`, ~30%)**: Menampung tombol aksi (misal: *Muat ulang*, *Entri Data Mingguan*, *Simpan Draf*, dll.) tersusun rapi, rapat ke kanan, dan tidak saling bertumpuk (overlap) maupun meluber (overflow).

---

## 2. Rincian Perubahan

### A. `services/frontend-next/components/layout/Breadcrumbs.tsx`
- Menambahkan tombol **Kembali** (`button[data-testid="breadcrumb-back"]`) dengan ikon `ArrowLeft` tepat di sebelah kiri pill breadcrumbs. Menggunakan `router.back()` dengan fallback navigasi ke level breadcrumb sebelumnya bila riwayat browser kosong.
- Memberikan tautan `groupHref` pada item breadcrumb pertama (misal: `/tatakelola` atau `/dashboard`), sehingga semua level breadcrumb aktif dan dapat diklik pengguna.

### B. `services/frontend-next/components/PageHeader.tsx`
- Mengubah arsitektur layout dari flexbox sederhana menjadi sistem **2-Grid Responsif** (`lg:grid-cols-12`):
  - Area Judul & Deskripsi menggunakan `lg:col-span-8` (~70% lebar container).
  - Area Tombol Aksi (`actions`) menggunakan `lg:col-span-4 lg:justify-end shrink-0` (~30% lebar container).
- Menghapus rendering teks `eyebrow` di atas judul (namun tetap mempertahankan kompatibilitas tipe prop opsional).
- Menambahkan dukungan slot `meta` untuk metadata/lencana status di bawah deskripsi.

### C. Komponen Formulir & Detail dengan Header Mandiri
Menyelaraskan header mandiri pada seluruh komponen wizard dan detail agar mengadopsi standar 2-grid (~70/30%), menghapus tombol back duplikat (karena sudah ada di breadcrumb), dan menghapus teks eyebrow:
1. `services/frontend-next/components/laporan/LaporanWizard.tsx` (Form Laporan EBS & IBS)
2. `services/frontend-next/components/pengawasan-gizi/MbgWizard.tsx` (Form Pengawasan Gizi MBG 1–13)
3. `services/frontend-next/components/keracunan-mbg/KpWizard.tsx` (Form Keracunan Pangan MBG)
4. `services/frontend-next/components/pe/PeFormEditor.tsx` (Form Penyelidikan Epidemiologi PE)
5. `services/frontend-next/components/keracunan-mbg/KpDetail.tsx` (Ringkasan Kejadian Keracunan Pangan)
6. `services/frontend-next/components/pengawasan-gizi/MbgHub.tsx` (Hub Kunjungan Pengawasan Gizi)

---

## 3. Berkas yang Diubah
- `services/frontend-next/components/layout/Breadcrumbs.tsx`
- `services/frontend-next/components/PageHeader.tsx`
- `services/frontend-next/components/laporan/LaporanWizard.tsx`
- `services/frontend-next/components/pengawasan-gizi/MbgWizard.tsx`
- `services/frontend-next/components/keracunan-mbg/KpWizard.tsx`
- `services/frontend-next/components/pe/PeFormEditor.tsx`
- `services/frontend-next/components/keracunan-mbg/KpDetail.tsx`
- `services/frontend-next/components/pengawasan-gizi/MbgHub.tsx`
- `docs/PR/067-redesign-page-header-2grid-breadcrumb-back.md`
- `docs/CHANGE_LOG_MATRIX.md`

---

## 4. Pengujian & Verifikasi
- `npx tsc --noEmit`: 0 error.
- Sinkronisasi file ke container Docker `skdr-frontend-next` melalui `docker cp`.
- curl `http://127.0.0.1:3200/skdr/login`: HTTP 200 OK.
- Pengecekan visual:
  - Tombol Kembali berada di samping breadcrumb pill dengan rapi.
  - Seluruh crumb aktif dan dapat diklik.
  - Teks eyebrow di atas judul di semua halaman telah hilang.
  - Grid judul (~70%) dan tombol aksi (~30%) tersusun rapi tanpa tumpang tindih maupun horizontal overflow.

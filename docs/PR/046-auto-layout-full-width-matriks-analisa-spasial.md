# PR 046 — Auto Layout Full Width pada Matriks Analisa & Spasial

Tanggal: 11 Nov 2026 (WIB). Branch: `main`.

## Ringkasan
Menghapus pembatasan lebar tetap `max-w-[1760px] mx-auto` pada halaman **Matriks Analisa** (`/dashboard/matriks-analisa`) dan **Spasial** (`/dashboard/spasial`). Sebelumnya, pembatas lebar maksimal dan margin auto menyebabkan konten tidak memenuhi sisa layar dan memunculkan celah kosong (*gap/jarak*) yang canggung di sisi kiri/kanan saat sidebar navigasi ditutup/diciutkan maupun saat panel filter samping disembunyikan.

## Perubahan
1. **`services/frontend-next/components/analisa/MatriksAnalisaClient.tsx`**:
   - Mengubah wrapper container utama dari `mx-auto w-full max-w-[1760px] space-y-4 px-4 pb-10 sm:px-6 lg:px-8` menjadi `w-full space-y-4 px-4 pb-10 sm:px-6 lg:px-8`.
2. **`services/frontend-next/components/spasial/SpasialClient.tsx`**:
   - Mengubah wrapper container utama dari `mx-auto w-full max-w-[1760px] space-y-4 px-4 pb-10 sm:px-6 lg:px-8` menjadi `w-full space-y-4 px-4 pb-10 sm:px-6 lg:px-8`.

## Dampak
- Halaman langsung mengembang penuh (*auto-layout fluid width*) mengikuti lebar viewport yang tersedia, serasi dengan `Breadcrumbs`, header, dan halaman dasbor lainnya di SKDR.
- Saat sidebar navigasi utama diciutkan (`collapsed`), konten memanfaatkan tambahan ruang 208 px secara penuh tanpa celah margin di samping.
- Saat panel filter disembunyikan (*toggle* "Sembunyikan filter"), tabel analisa dan peta OpenLayers langsung mengisi lebar penuh layar secara otomatis.


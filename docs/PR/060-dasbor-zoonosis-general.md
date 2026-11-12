# PR 060 – Penambahan Dasbor Zoonosis General dari Backup Tampilan Utama

## Ringkasan Perubahan
1. **Dasbor Zoonosis General**:
   - Dibuat komponen `services/frontend-next/components/dashboard/ZoonosisGeneralView.tsx` yang bersumber langsung dari backup tampilan utama komprehensif (`main-dashboard/page.tsx.bak`).
   - Komponen ini mencakup seluruh fitur analitik eksekutif mendalam:
     - Header analitik kategori dengan judul "Dasbor Zoonosis General" (atau per nama kategori aktif).
     - Filter Bar SKDR (tahun, minggu epi, penyakit, sumber IBS/EBS/semua, unit pelapor, wilayah provinsi & kabupaten/kota) yang terkunci ke kategori Zoonosis.
     - Section Quick Navigation bar.
     - Ringkasan Eksekutif (Executive Summary): KPI Kasus, Sinyal KLB, CFR, Kematian, Kelengkapan Laporan.
     - Carousel penyakit indikator zoonosis dan tabel komparasi CFR.
     - Status Respon Sinyal SKDR & Indikator Kinerja WHO 7-1-7.
     - Integrasi NAR-SKDR (status konfirmasi lab).
     - Kurva epidemi mingguan (Epi Curve) & Klaster KLB.
     - Pemeriksaan Laboratorium (Lab Section).
     - Peta Spasial Multi-Mode (OpenLayers) dengan marker sebaran faskes dan choropleth per wilayah.
2. **Rute Halaman Baru**:
   - `services/frontend-next/app/dasbor/zoonosis-general/page.tsx`: Rute khusus `/dasbor/zoonosis-general` yang mengunci tampilan ke kategori `ZOONOSIS`.
   - `services/frontend-next/app/dasbor/kategori/[kode]/page.tsx`: Menggunakan `ZoonosisGeneralView` sehingga navigasi kategori penyakit dinamis tetap mempertahankan tampilan analitik komprehensif per kategori.
3. **Pendaftaran Navigasi & Menu**:
   - Di `services/frontend-next/lib/nav.ts` dan `services/frontend-next/lib/menu.ts`, sub-menu di bawah `Dasbor Zoonosis` disusun terstruktur:
     1. **Zoonosis General** (`/dasbor/zoonosis-general`, icon `LayoutDashboard`)
     2. **Zoonosis Lite** (`/dasbor/zoonosis-lite`, icon `Activity`)
     3. Kategori penyakit lainnya dari master data (`PD3I`, `Tular Vektor`, `Menular Langsung`, dll.)
4. **Isolasi Modul**:
   - Menu lain seperti `Dasbor SKDR` (PR 057), `Dasbor MBG` (PR 052), `Spasial`, `Matriks Analisa`, dan modul transaksi tidak terganggu sama sekali.
5. **Git Policy**:
   - Disimpan di git lokal sesuai instruksi (tidak di-push ke remote).

## File Terkait
- `services/frontend-next/components/dashboard/ZoonosisGeneralView.tsx` (baru)
- `services/frontend-next/app/dasbor/zoonosis-general/page.tsx` (baru)
- `services/frontend-next/app/dasbor/kategori/[kode]/page.tsx` (diperbarui)
- `services/frontend-next/lib/nav.ts` (diperbarui)
- `services/frontend-next/lib/menu.ts` (diperbarui)


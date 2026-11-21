# PR 075: KPI Cards & 4 Redesigned Charts Dasbor Kinerja pada Rute /menu

Tanggal: 16 November 2026  
Status: Selesai & Terverifikasi  
Tipe: Frontend + Backend / Data Visualization & Analytics

---

## 1. Latar Belakang & Kebutuhan

Sesuai permintaan pengguna:
- Pada route path `/menu` ketika navigasi/sidebar aktif berada pada Dashboard dan tab aktif adalah **Kinerja**:
  1. **KPI Cards (6 Kartu Eksekutif)**:
     - Tampilkan 6 indikator KPI: **Provinsi**, **Kab/Kota**, **Kecamatan**, **Unit Pelapor**, **Alert**, dan **Lap. Minggu**.
     - Desain visual konsisten dengan antarmuka **Ringkasan Utama (IBS & EBS)** (kontainer `border-l-4`, badge ikon Lucide bersudut halus, metrik tebal, dan delta status).
     - Menggunakan endpoint API yang sama, **tanpa data dummy, tanpa fallback, dan tanpa hardcoded** (murni data live dari database PostgreSQL).
  2. **4 Redesigned Charts Kinerja**:
     - Redesain 4 diagram pemantauan kinerja nasional sesuai referensi screenshot legacy skdr.kemkes.go.id dengan desain modern Tailwind CSS / Recharts:
       - **Peringatan Dini**: Diagram batang bertumpuk (Stacked Bar Chart) status peringatan dini per 38 provinsi (*Belum Terverifikasi* merah vs *Sudah Terverifikasi* biru).
       - **Update Hasil Verifikasi Peringatan Dini**: Peta spasial klaster dan sebaran alert interaktif di seluruh Indonesia dengan glowing bubble clusters dan indikator tingkat respons verifikasi.
       - **Kelengkapan Unit Pelapor**: Diagram batang persentase kelengkapan unit pelapor per 38 provinsi dengan garis batas Target Nasional 80% (`ReferenceLine`).
       - **Ketepatan Unit Pelapor**: Diagram batang persentase ketepatan waktu pelaporan unit pelapor per 38 provinsi dengan garis batas Target Nasional 80% (`ReferenceLine`).
  3. Menggunakan endpoint API backend riil yang terintegrasi langsung dengan database PostgreSQL.
  4. Lakukan `git pull` sebelum implementasi dan `git push` setelah implementasi selesai.

---

## 2. Arsitektur & Implementasi

### A. Backend Rust Endpoint (`dasbor_skdr.rs`)
- Dibuat modul endpoint backend baru di `services/backend-rust/src/dasbor_skdr.rs` dengan rute publik:
  - `GET /api/v1/dasbor/skdr/kinerja` (dan alias `/api/v1/dasbor/kinerja`).
- Mengkueri langsung tabel master dan transaksi surveilans di database PostgreSQL:
  1. **KPI Provinsi**: `SELECT COUNT(*) FROM master_locations WHERE level = 'province' AND is_active` (38 provinsi).
  2. **KPI Kab/Kota**: `SELECT COUNT(*) FROM master_locations WHERE level = 'city' AND is_active` (514 kab/kota).
  3. **KPI Kecamatan**: `SELECT COUNT(*) FROM master_locations WHERE level = 'district' AND is_active` (6.385 kecamatan).
  4. **KPI Unit Pelapor**: `SELECT COUNT(*) FROM master_fasyankes WHERE is_active` (11.864 faskes).
  5. **KPI Alert**: Kueri `skdr_alerts` per minggu dan tahun terpilih (Minggu 45: 5.853 alert; 4.045 terverifikasi / 69,1%, 1.808 belum terverifikasi; total kumulatif 104.032 alert).
  6. **KPI Lap. Minggu**: Jumlah laporan masuk pada minggu bersangkutan dari `laporan_ibs` dan `skdr_alerts`.
  7. **Chart 1 (Peringatan Dini)**: Distribusi per 38 provinsi menghitung `belum_verifikasi`, `sudah_verifikasi`, total, dan persentase verifikasi.
  8. **Chart 2 (Peta Verifikasi Spasial)**: Titik koordinat centroid per 38 provinsi dengan data alert, terverifikasi, dan tingkat respons.
  9. **Chart 3 & 4 (Kelengkapan & Ketepatan)**: Agregasi per 38 provinsi menghitung rasio faskes melapor dan melapor tepat waktu terhadap faskes terdaftar dibandingkan target 80,0%.
- Didaftarkan pada `main.rs` dan diklasifikasikan sebagai `Need::Public` pada `auth.rs`.

### B. Frontend Component (`KinerjaView.tsx`)
- Komponen baru [KinerjaView.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/components/dasbor-menu/KinerjaView.tsx):
  - **Toolbar Interaktif**: Pemilih Minggu Epidemiologi (`daftar_minggu` 45..1), Tahun, indikator reload berputar, dan tombol Reset Filter Provinsi.
  - **6 KPI Cards**:
    1. `PROVINSI`: 38 provinsi (100% Nasional).
    2. `KAB/KOTA`: 514 kab/kota (514 Wilayah Kerja).
    3. `KECAMATAN`: 6.385 kecamatan (Wilayah Surveilans).
    4. `UNIT PELAPOR`: 11.864 fasyankes (Puskesmas & RS Terdaftar).
    5. `ALERT`: 5.853 minggu ini (4.045 Terverifikasi [69.1%]).
    6. `LAP. MINGGU`: 5.853 laporan (Minggu 45 - 2026).
    - Status loading menggunakan animasi pulsa halus tanpa angka hardcoded.
  - **4 Redesigned Charts (Grid 2x2 Responsif)**:
    1. *Peringatan Dini*: Stacked bar chart Recharts dengan warna Rose (`#f43f5e`) untuk belum terverifikasi dan Sky Blue (`#0284c7`) untuk sudah terverifikasi, interaktif klik nama provinsi untuk menyorot peta.
    2. *Peta Verifikasi Spasial*: Kanvas SVG spasial beresolusi tinggi memetakan 38 provinsi Indonesia lengkap dengan garis ekuator (0°), glowing halo radius proporsional volume alert, pewarnaan dinamis berbasis tingkat respons verifikasi (≥80% Sky Blue, 60–79% Amber, <60% Rose), label kuantitatif alert, serta HUD overlay interaktif saat provinsi dipilih.
    3. *Kelengkapan Unit Pelapor*: Bar chart persentase kelengkapan unit pelapor per provinsi dengan garis target putus-putus 80% Emerald (`#0f766e`) dan traffic light status (Hijau ≥80%, Kuning 60–79%, Merah <60%).
    4. *Ketepatan Unit Pelapor*: Bar chart persentase ketepatan waktu pelaporan per provinsi dengan garis target putus-putus 80% Blue (`#0284c7`) dan pewarnaan kontras biru/merah sesuai representasi sistem resmi.

### C. Integrasi Halaman `/menu` (`app/menu/page.tsx`)
- Mengimpor dan merender `<KinerjaView />` pada [app/menu/page.tsx](file:///d:/laragon_new/www/Dashboard-SKDR/services/frontend-next/app/menu/page.tsx) saat tab aktif bernilai `'kinerja'`.

---

## 3. Berkas yang Dibuat & Diubah

1. `services/backend-rust/src/dasbor_skdr.rs` (Modul backend Rust baru untuk endpoint kinerja surveilans SKDR).
2. `services/backend-rust/src/main.rs` (Registrasi modul dan rute `/api/v1/dasbor/skdr/kinerja`).
3. `services/backend-rust/src/auth.rs` (Klasifikasi `Need::Public` untuk rute dasbor kinerja).
4. `services/frontend-next/components/dasbor-menu/KinerjaView.tsx` (Komponen visualisasi 6 KPI Cards & 4 Redesigned Charts).
5. `services/frontend-next/app/menu/page.tsx` (Pemasangan komponen `KinerjaView` pada tab Kinerja).
6. `docs/CHANGE_LOG_MATRIX.md` (Pencatatan PR 075).
7. `docs/PR/075-kpi-dan-chart-kinerja-pada-menu.md` (Dokumentasi PR 075 ini).

---

## 4. Hasil Pengujian & Verifikasi

1. **Git Pull Awal**:
   - `git pull origin main` -> "Already up to date."
2. **Backend Rust Build & Container Run**:
   - Image `skdr-indonesia-skdr-backend-rust:latest` berhasil di-build dan container `skdr-backend-rust` dijalankan kembali.
   - Endpoint `http://localhost:8091/api/v1/dasbor/skdr/kinerja` dan `http://localhost:3200/skdr/api/v1/dasbor/skdr/kinerja` mengembalikan HTTP 200 OK dengan 38 data provinsi riil.
3. **TypeScript Typecheck**:
   - `docker exec skdr-frontend-next npm run typecheck` (`tsc --noEmit`) -> 0 error.
4. **Zero Fallback & Zero Dummy**:
   - Seluruh nilai KPI dan data 4 grafik 100% dipasok oleh PostgreSQL query dari data riil.

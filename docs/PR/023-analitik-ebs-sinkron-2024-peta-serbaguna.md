# PR 023 — Analitik EBS lengkap, sinkron EBS 2024, peta serbaguna

Persetujuan: Yosua 21:35 WIB (bangun semua usulan 022a + sinkron 2024), arahan 21:36 (peta), 22:14 (gabung ke Peta Sinyal Surveilans). Tidak di-commit/push.

## Perubahan
- Migrasi `049_ebs_2024_dasbor_ebs.sql` (+ `database/rollback/049_rollback.sql`): tahun sinkron EBS jadi ["current","previous",2024]; kab/kota EBS kosong dipetakan via `master_kabkota.code = kode_depdagri_kota` (cadangan `ebs_kabkota_bak_049`, `app_settings_bak_049`); `ebs_dashboard_config` (batas 50.000 kasus/laporan, ambang tanda 100, kelas histogram, jendela unit diam 4/12 minggu, top 15 unit, target respons 7 hari, kata kunci kelas tindakan/saran).
- `ebs.rs`: pemetaan fallback kode_depdagri. Backend baru `ebs_dash.rs`: `GET /api/v1/ebs-analitik`, `GET /api/v1/ebs-wilayah?level=prov|kab|kec&parent=`. `lab_klaster.rs`: batas kasus 50.000 (epicurve_config) di Laboratorium dan Klaster.
- Frontend: `EbsPanels.tsx` (donut jenis unit + filter, peringkat unit, unit diam, respons 7-1-7, funnel + tren status, matriks diagnosa awal → verifikasi, histogram + tanda outlier/kematian negatif, KLB belum dinilai/bukan/KLB, kelas tindakan/saran hitungan saja, pembanding tahun lalu), `PetaEbs.tsx`, `PetaMultiMode.tsx` (panel kiri bisa dilipat di Peta Sinyal Surveilans: mode Sinyal surveilans / Laporan EBS rinci, ukuran, chip jenis unit, status laporan dikelompokkan + rincian, status KLB, tombol Tampilkan matriks, chip KPI, drill-down provinsi → kab/kota → kecamatan). Peta EBS terpisah dihapus dari dasbor (kode tetap).
- Tanpa nama pasien; teks bebas tidak pernah dikeluarkan.

## Data
EBS: 2024 = 41.854, 2025 = 107.211, 2026 = 43.570 laporan; kab/kota belum terpetakan 133 → 1.

## Rollback
`database/rollback/049_rollback.sql`, lalu kembalikan berkas di atas.

## Tahap 2 (22:29 WIB) - catatan teknis keluar dari UI
- 21 teks UI diganti kalimat sederhana / dihapus (EbsPanels, PetaEbs, AlertSkdrSections, LabSection, EpiCurve, TrendHeatmap, judul Klaster di main-dashboard, teks 7-1-7 di dash_alert.rs).
- Penjelasan teknis dipindah ke Google Sheet 'Progres Fitur SKDR Indonesia', tab 'Metodologi Data Dasbor' (25 baris).
- Verifikasi: tsc 0, cargo check OK. Rebuild backend + tangkapan layar tertunda: WSL/Docker tidak merespons.

## Tahap 3 (23:08 WIB) - sisa catatan teknis
- Kartu Kinerja 7-1-7 EBS (locales id/en: missingField, detectExplain, notifyExplain, respondExplain, footer) diganti kalimat sederhana; kode form (A.2/A.11/B.xx) dihapus dari label backend (signals.rs, analytics.rs).
- Tabel Penetapan KLB tidak lagi menampilkan kode (1/0/-1).
- cfrPeNote/cfrPeNoteAll: 'Penyebut:' diganti 'Dihitung dari'.
- Penjelasan dipindah ke tab Metodologi Data Dasbor (baris 26-31).
- Verifikasi: tsc 0, cargo check OK, backend dibangun ulang, API 200, halaman 200, tangkapan layar.

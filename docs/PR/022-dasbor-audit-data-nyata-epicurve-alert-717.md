# PR 022 — Audit Dasbor Utama: data nyata, urutan seksi, epi curve, CFR/Alert/7-1-7 dari Alert SKDR

Tanggal: 2026-10-22 (WIB). Status: lokal di PC, belum commit/push.

## Ringkasan
- Audit semua seksi Dasbor Utama dan dasbor kategori: setiap angka berasal dari API/DB. Satu-satunya data contoh yang ditemukan
  adalah titik api (FIRMS) dan satwa liar (GBIF) bawaan di `external_sync.rs` saat sumber hulu gagal. Data contoh itu dihapus;
  kegagalan sekarang mengembalikan `status: "unavailable"` dengan daftar kosong.
- Urutan seksi (dan tab SectionNav) dibaca dari `app_settings.dashboard_sections` (migrasi 047):
  Ringkasan, CFR, Alert, 7-1-7, Laboratorium, Sebaran wilayah, Tren, Klaster dan epi curve, NAR-SKDR.
  Heatmap disembunyikan lewat `hidden: ["heatmap"]` (komponennya tidak dihapus).
- Endpoint baru: `GET /api/v1/epicurve`, `GET /api/v1/alert-skdr`, `GET /api/v1/dashboard/sections`.
  Semuanya mengikuti filter dasbor (periode minggu epid, wilayah, penyakit, kategori, unit).
- Migrasi 046: kolom `sts_verif`, `tgl_verifikasi`, `klb_kode` di `skdr_alert_fakta`, di-backfill dari `skdr_alerts`.
  Tabel ini juga diisi ulang oleh `alert::classify`.

## Seksi
| Seksi | Sumber | Catatan |
|---|---|---|
| Ringkasan | /dashboard/executive, /analytics/summary | KPI + kartu penyakit (sudah data nyata) |
| CFR | /alert-skdr (Alert SKDR) + CFR Kasus PE | IK 95% Wilson. CFR Kasus PE hanya tampil bila ada kasus PE |
| Alert | /alert-skdr | Verifikasi, KLB, respon 24 jam, per minggu, per penyakit |
| 7-1-7 | /analytics/summary (EBS) + /alert-skdr | Deteksi dari Alert tidak tersedia (tanpa tanggal mulai sakit). Notifikasi = tgl_verifikasi − akhir minggu epid. Respons = flag respon 24 jam |
| Laboratorium | /laboratorium | PR 021 |
| Sebaran wilayah | /public-dashboard | Peta |
| Tren | /analytics/overview | Heatmap disembunyikan |
| Klaster dan epi curve | /epicurve + /klaster | Bertumpuk per penyakit/kategori/total, kematian, rata-rata bergerak, ambang rerata+2SD 8 minggu, pembanding tahun lalu, CSV, brush |
| NAR-SKDR | /nar/summary | Tidak berubah |

## Rollback
- `database/rollback/047_rollback.sql` (urutan bawaan, heatmap tampil lagi)
- `database/rollback/046_rollback.sql`
- File kode: kembalikan dengan git (belum di-commit).

## Tahap 2 (2026-10-22 ~21:05–21:40 WIB, disetujui Yosua 21:05 WIB lewat agen induk)
1. Alert SKDR 2025 disinkron (POST /api/v1/integrasi/alert-skdr/sync tahun=2025 minggu 1–53), jadi epi curve sekarang punya garis pembanding tahun lalu.
2. Laboratorium: API tidak punya field jenis spesimen. Daftar diberi label ulang "Nilai spesimen diperiksa" (Ya/Tidak, kode 1/2) dengan catatan.
3. Klaster: daftar klaster KLB dan daftar EBS KLB dipaginasi (15 per halaman), diberi kotak cari dan scroll maks 560 px.
4. Tren EBS: API EBS memang berhenti di 2026-04-09 (lihat lampiran A). Seksi Tren menampilkan catatan cakupan bila seri EBS berakhir sebelum periode.
- Lampiran A: `022a-studi-endpoint-ebs.md` (studi lengkap endpoint EBS).
- Migrasi 048 `epicurve_batas_kasus` (+ rollback): `epicurve_config.max_kasus_per_alert = 50000`. Setelah data 2025 masuk ditemukan entri sumber yang tidak wajar: 21.111.221 kasus ISPA KOTA KUPANG 2025-M52, 3.776.676 ILI KAB. PATI 2025-M31, 202.617 Diare KOTA BINJAI 2026-M39, 202.610 Diare KAB. WAROPEN 2026-M7. Alert dengan kasus di atas batas dikeluarkan dari jumlah epi curve / Alert / CFR dan tampil sebagai "Perlu dicek di sumber". Data sumber tidak diubah. Seksi Laboratorium/Klaster belum memakai batas ini.

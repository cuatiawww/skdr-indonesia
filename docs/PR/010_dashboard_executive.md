# PR 010 — Ringkasan Dashboard Eksekutif (sheet "Spesifikasi Dashboard Executive")

## Ringkasan
- Kartu pipeline NLP (Total Collected/Processed/Health Stored, status crawler, caption pertumbuhan dari crawl, modal crawling) **dihapus** dari `/main-dashboard`, beserta polling `crawling-stats` (15 detik) dan `crawl-history/summary`. Peta sinyal dipertahankan.
- Komponen baru `components/dashboard/ExecutiveSummary.tsx` + endpoint `GET /api/v1/dashboard/executive` (`services/backend-rust/src/exec_dash.rs`), mengikuti filter dasbor (minggu epid, provinsi, kab/kota, penyakit, sumber).
- Definisi indikator di DB: `app_settings.dashboard_executive` (migrasi `019_dashboard_executive.sql`, dibuat oleh `scripts/dashboard/emit_019.py`; rollback `database/rollback/019_rollback.sql`): grup penyakit + warna, pencocokan teks diagnosa/verifikasi EBS, kode status PE, baris CFR, ambang pecahan (< 10), z Wilson, teks catatan, dan daftar status indikator.

## Aturan sheet yang diterapkan
- EBS dan laporan individu selalu diberi label sumber dan tidak dijumlahkan; laporan kasus (formulir) ditampilkan terpisah di keterangan cakupan.
- Denominator < 10 → pecahan (mis. "0/4"); 95% CI metode Wilson (uji unit `wilson_interval`).
- GHPR dan rabies dipisah (EBS: Verifikasi bila terisi, selain itu Diagnosa); kematian EBS GHPR tidak ditampilkan (hanya alert rabies).
- CFR hanya dari kasus konfirmasi (rabies: klinis + konfirmasi) dengan kondisi akhir diketahui (Sembuh/Meninggal); baris suspek/probabel/GHPR bertanda * "tidak dihitung*" + pita "Cek data" bila ada kematian.
- Laporan individu = Form PE berstatus Dikirim/Terverifikasi/Final (konfigurasi `pe_count_statuses`); draf dihitung hanya di kartu Status Form PE.
- 7-1-7: hanya notifikasi ≤ 1 hari yang dihitung (create_date − tgl_laporan). Deteksi & respons ditampilkan "data belum tersedia" (tidak ada angka palsu).

## Status indikator sheet
| No. | Indikator | Status | Alasan |
|---|---|---|---|
| 1–2 | Periode | sebagian | memakai filter minggu epid yang ada |
| 3 | Lihat sebagai (akun) | tertunda | tanpa login (aturan proyek) |
| 4–5, 8 | Provinsi, kab/kota, reset | tersedia | |
| 6 | Unit pelapor | tertunda | master sarana belum ada |
| 7 | Penyakit | sebagian | belum ada pilihan "GHPR saja"/"Rabies saja" |
| 9 | Keterangan cakupan | tersedia | |
| 10 | Menu bagian | tertunda | menunggu bagian 3–9 |
| 11 | Palet Kemenkes | sebagian | warna per penyakit; tema/font penuh belum |
| 12–15 | Card alert EBS | tersedia | asumsi 1 laporan EBS = 1 alert (No. 36 belum disepakati) |
| 16–18 | Card laporan individu | tersedia | dari Form PE |
| 19 | Tautan dashboard penyakit | sebagian | dashboard penyakit belum ada → tautan daftar Form PE |
| 20 | Catatan * | tersedia | |
| 21–35 | CFR + CI + akhir belum diketahui | tersedia | pop-up "Lihat →" belum |
| 36 | Definisi alert | tertunda | perlu konfirmasi Timker/SKD |
| 37–40 | Status tindak lanjut alert | sebagian | % terverifikasi di card; "direspons" tidak terdefinisi & tidak ada di API |
| 41–42, 44–45 | 7-1-7 deteksi/respons/ketiganya | tertunda | API EBS tanpa A.11 & tanggal respons B.20–B.39 |
| 43 | Notifikasi ≤ 1 hari | tersedia | lihat catatan data |
| 46–49 | Laboratorium | tertunda | API EBS tanpa B.12–B.18 |
| 50–58 | Peta per penyakit | tertunda | data ada; PR berikutnya |
| 59–64 | Tren mingguan | tertunda | data ada; PR berikutnya |
| 65–69, 72–75 | Klaster & epi curve | tertunda | data pe_clusters ada; PR berikutnya |
| 70–71 | Populasi berisiko, AR | tertunda | variabel belum tersedia |
| 76 | % kasus dengan NIK | tersedia | |
| 77–81 | NAR-SKDR | tertunda | butuh API NAR |
| tambahan | Status alur PE, cakupan provinsi/kab-kota | tersedia | permintaan Yosua |

## Hasil uji (data lokal, M1–M43 2026)
- Header: 13 laporan individu (Form PE), 10.856 alert EBS zoonosis, 9 laporan kasus; total alert EBS semua penyakit 42.959.
- GHPR: 10.182 alert, 9.904 terverifikasi, 14.844 kasus; Rabies: 21 alert, 20 terverifikasi, 40 kasus, 15 kematian; AI 3/1/1/0; Antraks 2/1/5/0; Leptospirosis 648/562/703/94.
- Cakupan: 37/38 provinsi, 390/514 kab/kota. Filter provinsi + Rabies + sumber EBS: hanya kartu GHPR/Rabies, laporan individu disembunyikan. Penyakit non-zoonosis (Dengue): pesan "bukan bagian dashboard eksekutif".
- Catatan data: notifikasi ≤ 1 hari = 100% untuk semua penyakit karena tgl_laporan dari API EBS praktis sama dengan create_date — indikator ini perlu dikonfirmasi maknanya.
- Laporan individu saat ini hanya baris uji (UJI …) dari PR 006–009.
- tsc OK; Rust build/test OK; /main-dashboard, /pe/lepto, /ebs 200; smoke PASS; screenshot ditinjau: docs/screenshots/skdr-dashboard-executive.png, skdr-dashboard-indicators.png.

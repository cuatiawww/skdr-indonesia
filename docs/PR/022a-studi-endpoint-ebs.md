# PR 022 — Lampiran A: Studi endpoint EBS (`POST https://skdr.surveilans.org/api/ebs`)

Tanggal studi: 2026-10-22 (WIB).
- Probe langsung ke API memakai header `User-Key` dari env; kuncinya tidak dicetak dan tidak disimpan di dokumen ini.
- Statistik isian dihitung dari `ebs_reports.raw`: 150.781 laporan, tahun 2025–2026, hasil sinkronisasi penuh.
- Nama/telepon pelapor dan `informasi` tidak pernah disimpan (`ebs.rs` PRIVATE_FIELDS), jadi tidak ada contoh nilai untuk field itu.
- Teks bebas (kronologi, tindakan, saran) tidak dikutip karena bisa memuat nama orang.

## 1. Protokol
- **Request:** `POST multipart/form-data`, header `User-Key` (case-sensitive).
- **Envelope:** `{"resultEbs": {"status": true, "kode": 200, "paging": {"total", "page", "limit", "total_page"}, "data": [ ... ]}}`.
  Baris datar, tanpa objek/array bersarang. Semua nilai string (angka juga dikirim sebagai string).
- **Urutan:** `tgl_laporan` menurun (terbaru dulu).

| Parameter | Hasil uji |
|---|---|
| `tahun` | Berfungsi. 2024 = 41.854 · 2025 = 107.211 (DB) · 2026 = 43.570 · 2027 = 0. Tanpa `tahun` = 206.464 (semua tahun, 20 detik) |
| `limit`, `page` | Berfungsi. `limit=5000` OK (11 detik). Halaman di luar jangkauan → `data: []` |
| `kode_prop` | Berfungsi sebagai filter provinsi (contoh 32 → 3.848 baris 2026) |
| `bulan`, `minggu`, `tgl_awal`/`tgl_akhir` | Diabaikan (total tetap 43.570) |
| `/api/ebs/detail` | 200, envelope sama |
| `/api/ebs_detail` | 405 |

**Cakupan tanggal:** laporan 2026 di API berhenti di **2026-04-09**. Scan 44 halaman menemukan 43.570 baris, min 2026-01-01, max 2026-04-09.
`update_date` terakhir 2026-10-20, artinya laporan lama masih diperbarui, tapi laporan baru tidak masuk.
Kesimpulan: tren EBS yang jatuh ke 0 setelah sekitar M14/26 berasal dari sumber, bukan bug sinkronisasi.
Dasbor sekarang menampilkan catatan jujur di seksi Tren.

## 2. Matriks field
Isi % = nilai tidak kosong / bukan "-" dari 150.781 baris.

| Field | Tipe | Isi % | Distinct | Contoh / nilai teratas | Dipakai dasbor? | Usulan pemakaian |
|---|---|---|---|---|---|---|
| id | string (int) | 100 | 150.781 | – | Ya (id_ebs, kunci upsert) | – |
| no_ebs | string | 100 | 150.781 | kode laporan | Ya (daftar, modal sinyal) | – |
| tgl_laporan | date string | 100 | 453 hari | 2025-01-01 … 2026-04-09 | Ya (periode, tren, KPI) | – |
| create_date | datetime | 100 | 149.868 | lag ke tgl_laporan p50 0 hari, p90 0 hari | Ya (7-1-7 notifikasi EBS) | Pola jam/hari input per unit (heatmap jam × hari) |
| update_date | datetime | 43,6 | 65.518 | lag dari create: p50 2,3 hari, p90 88 hari | Hanya modal | **7-1-7 Respons EBS**: waktu sampai pembaruan status pertama; seksi 7-1-7 menjadi "median hari sampai tindak lanjut" per penyakit/provinsi |
| propinsi | string | 100 | 38 | – | Ya (dipetakan ke province_id) | – |
| kode_depdagri_prop | string | 100 | 38 | 32, 35, … | Tidak | Kunci join pengganti nama (lebih andal), filter `kode_prop` untuk sinkron per provinsi |
| kota | string | 100 | 465 | – | Ya (kabkota_id; 133 baris belum terpetakan) | – |
| kode_depdagri_kota | string | 100 | 464 | – | Tidak | Pemetaan kab/kota 100% via kode Kemendagri (menutup 133 baris yang belum terpetakan) |
| distrik | string | 100 | 3.794 | kecamatan | Hanya modal | **Sebaran wilayah**: drill-down kecamatan (tabel top kecamatan + titik peta bila ada lat/lng) |
| kode_depdagri_distrik | string | 99,9 | 3.894 | – | Tidak | Kunci drill-down kecamatan / geojson kecamatan |
| kel_unit | string | 100 | 8 | Puskesmas 100.415 · Rumah Sakit 43.407 · Dinkes Kab 4.089 · Klinik 1.376 · BKK 1.144 · Lab 319 · Dinkes Prov 26 · PHEOC 5 | Hanya modal | **Ringkasan / Alert**: donut "Sumber laporan per jenis unit" + filter jenis unit; KPI kontribusi RS vs Puskesmas per penyakit |
| unit | string | 99,0 | 5.982 | nama fasyankes | Ya (filter unit) | Peringkat unit pelapor teraktif + "unit diam" (tidak melapor N minggu) |
| sts_rumor | string | 99,6 | 12 | Terverifikasi 133.415 · Terverifikasi + koordinasi lintas sektor 8.665 · Dalam investigasi 5.816 · Discarded 2.157 · Terverifikasi PIE 54 · Situasi Khusus Banjir 20 | Ya (verified / discarded) | **Alert**: funnel status (Masuk → Investigasi → Terverifikasi → Lintas sektor; Discarded), tren mingguan per status; penanda situasi khusus (PIE/bencana) di epi curve |
| diagnosa | string | 99,8 | 62 | GHPR 41.802 · Dengue 23.826 · Suspek Campak 16.160 · Diare Akut 12.752 · Campak 6.006 | Ya (pemetaan penyakit 99,62%) | – |
| verifikasi | string | 97,3 | 62 | diagnosa hasil verifikasi (GHPR 41.525 · Dengue 23.374 · Suspek Campak 14.958 …) | Sebagian (label) | **Matriks konfirmasi diagnosa awal → hasil verifikasi** (Suspek Campak → Campak/lainnya); % diagnosa berubah per penyakit |
| jml_kasus | string (int) | 100 | 202 | min 0 · median 1 · maks 3.485 · total 342.622 | Ya | Histogram ukuran kejadian; tanda outlier (>100 kasus) di daftar klaster |
| jml_kematian | string (int) | 100 | 11 | 0 = 149.579 · 1 = 1.154 · 2 = 29 · ada nilai −1 (3 baris) | Ya (KPI, CFR) | Validasi data: tampilkan nilai negatif sebagai "perlu dicek" (sekarang dihitung) |
| klb | string | 100 | 3 | −1 = 89.911 · 0 = 58.908 · 1 = 1.962 | Ya (klaster EBS) | Pisahkan "belum dinilai" (−1) vs "bukan KLB" (0) di seksi Klaster |
| kronologi | teks | 88,9 | 124.262 | rata-rata 379 karakter | Hanya modal | NLP kata kunci gejala / hewan penular (sudah ada pipeline NLP); word-cloud anonim per penyakit — wajib masking nama |
| tindakan | teks | 88,6 | 81.861 | rata-rata 148 karakter | Hanya modal | Klasifikasi jenis respons (vaksinasi, PE, penyuluhan, VAR/SAR) → seksi 7-1-7 "jenis tindakan" |
| saran | teks | 70,9 | 56.344 | rata-rata 111 karakter | Hanya modal | Klasifikasi kebutuhan (logistik, vaksin, lab) → tabel "kebutuhan dukungan" per provinsi |
| lat / lng | string | 6,6 | ~5.000 | – | Ya (peta; sebagian besar pakai centroid wilayah) | Indikator kualitas: % laporan bertitik per provinsi |
| nama_pelapor, telp_pelapor, informasi | string | (tidak disimpan) | – | – | Tidak (dibuang saat sinkron) | Tidak diusulkan (data pribadi) |

## 3. Usulan seksi dasbor (konkret)
1. **Alert → "Funnel status EBS"**: batang bertingkat dari `sts_rumor` + tren mingguan per status. Discarded dan Dalam investigasi ditandai.
2. **7-1-7 → "Respons EBS"**: dari `update_date − create_date`. Median dan % ≤ 7 hari per penyakit/provinsi. Tahap Respons EBS yang sekarang kosong jadi terisi (dengan catatan: pembaruan status sebagai proksi).
3. **Ringkasan → "Jenis unit pelapor"**: donut `kel_unit` + filter. Ditambah tabel "unit diam" (unit yang biasanya melapor tetapi 4 minggu terakhir tidak).
4. **Sebaran wilayah → drill-down kecamatan**: `distrik` + `kode_depdagri_distrik`. Pemetaan kab/kota via `kode_depdagri_kota` menutup 133 baris yang belum terpetakan.
5. **Kualitas data**: `diagnosa` ≠ `verifikasi`, kematian negatif, klb −1, % bertitik koordinat. Ditaruh sebagai panel kecil di NAR-SKDR atau seksi baru "Kualitas data".
6. **Klaster**: pisahkan klb −1 / 0 / 1. Outlier `jml_kasus` diberi tanda.
7. **Tren / epi curve EBS tahun lalu**: API punya data 2024 (41.854 baris) yang belum disinkron. Menambah `2024` ke `ebs_sync_config.years` (lewat migrasi) memberi pembanding dua tahun untuk EBS.

## 4. Catatan
- EBS tidak punya tanggal mulai sakit, jadi Deteksi 7-1-7 tetap tidak bisa dihitung dari EBS maupun Alert.
- Tidak ada field bersarang; seluruh 27 field di atas sudah terdaftar.

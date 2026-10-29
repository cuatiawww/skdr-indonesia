# PR 028 (rancangan) — Modal "Analisis Laboratorium" & "Detail Lainnya" di Dasbor Zoonosis Lite

Status: **rancangan saja**, belum ada perubahan kode. Basis: branch `feat/dashboard-zoonosis-lite` @ `ad97efb`.
Tanggal: 29 Okt 2026 (WIB).

## 1. Inventaris seksi Dasbor Utama

Dasbor Utama = `app/main-dashboard/page.tsx` → `ExecutiveSummary` (urutan/label/sembunyi dari
`/api/v1/dashboard/sections`, bawaan: ringkasan, cfr, alert, t717, laboratorium, wilayah, tren, klaster, nar).
Semua seksi menerima `query` yang sama: `disease` (kode, koma), `province_id` (koma), `kabkota_id` (koma), `unit`,
`kategori`, `source`, `start_year/start_week/end_year/end_week`. Backend memakai `dashboard::resolve` → filter
`= ANY($array)`, jadi **multi provinsi / kab-kota / penyakit didukung** di semua endpoint di bawah.

| Seksi | Komponen | Endpoint | Isi | 4 zoonosis + multi wilayah |
|---|---|---|---|---|
| Ringkasan | `ExecutiveSummary` (Kpi, `DiseaseCarousel`, `EbsUnitPanel`) | `/dashboard/executive`, `/analytics/summary`, `/ebs-analitik` | KPI EBS/PE/kematian/wilayah, kartu per penyakit, unit pelapor | Ya |
| CFR | `AlertCfr` + panel CFR exec, `DeathListModal` | `/alert-skdr`, `/dashboard/executive`, `/signals/pe-deaths` | CFR + IK 95% Wilson, daftar kematian PE | Ya (Lite sudah pakai sumber yang sama) |
| Alert | `AlertSection`, `EbsAlertPanel` | `/alert-skdr`, `/ebs-analitik` | Status verifikasi/KLB, funnel EBS, **matriks diagnosa awal → verifikasi**, histogram, kelas tindakan | Ya |
| 7-1-7 | `T717` (EBS), `AlertT717`, `EbsResponsCard` | `/analytics/summary` (`t717`), `/alert-skdr` (`t717`, `by_disease.notify`), `/ebs-analitik` (`respons`) | 3 kartu Deteksi/Notifikasi/Respons, rincian per penyakit, tabel sinyal + `SignalModal` | Ya |
| **Laboratorium** | `LabSection` (juga halaman `/laboratorium`, tidak di menu) | `/api/v1/laboratorium` | 5 KPI (alert, spesimen, ada hasil, positif, negatif), tren mingguan, bar per penyakit (positif/negatif/proses), tabel per provinsi, status spesimen, laporan EBS dengan hasil lab, 50 pemeriksaan terbaru (nama disamarkan) | Ya |
| Sebaran wilayah | `PetaMultiMode` → `SpatialOutbreakMap` / `PetaEbs` (+ matriks wilayah) | `/public-dashboard`, `/ebs-wilayah` | Peta sinyal / EBS rinci per prov-kab-kec | Ya |
| Tren | `TrendHeatmap`, `EbsPrevYear` | `/analytics/overview`, `/ebs-analitik` | Tren + heatmap, banding tahun lalu | Ya |
| Klaster & epi curve | `EpiCurve`, `KlasterSection` | `/epicurve`, `/klaster` | Kurva epidemi + MA/ambang, klaster KLB per kab/kota, KLB EBS | Ya |
| NAR-SKDR | `NarSkdr` | `/nar/summary` | Ringkasan naratif | Ya |

Uji lokal (backend `127.0.0.1:8091`, 4 zoonosis, M1–M43 2026):
- `/laboratorium`: 65.680 alert, 3.019 dengan spesimen, 5.673 ada hasil, 1.552 positif. Per penyakit:
  Leptospirosis 1.803 spesimen / 1.297 positif; Rabies 1.198 / 252; Flu Burung 11 / 1; Antraks kecil.
  `ebs_lab` kosong untuk 4 zoonosis. Filter `province_id=33,35` → scope "2 provinsi" (jalan).
- `/klaster`: 38 klaster, 98 alert KLB; `/alert-skdr` t717: notifikasi tepat waktu 0% (median 9 hari, basis "akhir minggu laporan → verifikasi"), respons 24 jam 63.416/65.680; deteksi belum tersedia.
- `/analytics/summary` t717 (EBS): ada per penyakit (mis. Antraks 4/4, Flu Burung 2/2 tepat waktu).

Catatan data yang perlu disampaikan saat demo:
- Nilai "spesimen diperiksa" bercampur ("Ya", "1", "2") — perlu dirapikan lewat aturan/kamus di `lab_klaster_config`, bukan edit nilai.
- Rabies = GHPR (gigitan), jadi alert & kasusnya jauh lebih besar dari 3 penyakit lain; chart perlu skala/normalisasi per penyakit.
- Notifikasi Alert SKDR 0% karena basis hitungnya; tampilkan teks basis yang sudah dikirim API.

## 2. Rancangan

### Tombol di Lite
Di header kartu peta / di ujung kanan baris kartu penyakit, dua tombol ringkas:
- **"Analisis Laboratorium"** (ikon `FlaskConical`) → modal tab **Laboratorium** aktif.
- **"Detail Lainnya"** (ikon `LayoutGrid`) → modal yang sama, tab **7-1-7** aktif.

Satu komponen baru `components/dashboard/ZoonosisLiteModal.tsx`, layar hampir penuh
(`max-w-[1400px] h-[90vh]`, isi scroll di dalam modal; halaman Lite tetap tanpa scroll). Pakai pola overlay
yang sudah ada (`components/Modal.tsx` dengan `maxWidth` lebar, atau pola `SignalModal`), Esc/klik luar menutup.

### Pewarisan filter
Modal menerima `qs` yang sudah dibangun Lite (`kategori=ZOONOSIS`, `disease=` kode terpilih, `province_id`, `kabkota_id`,
periode minggu epi). Baris atas modal menampilkan chip filter aktif (read-only) + tombol "Ubah filter" (tutup modal).
Klik kartu penyakit di Lite → modal ikut 1 penyakit. Tab dimuat **lazy** (fetch saat tab dibuka, cache per `qs`).

### Tab

| # | Tab | Isi | Sumber data | Reuse | Estimasi |
|---|---|---|---|---|---|
| 1 | **Laboratorium** | 5 KPI, tren mingguan, bar per penyakit, tabel provinsi, status spesimen, pemeriksaan terbaru | `/laboratorium` | `LabSection query={…} showHeader={false}` apa adanya | 0,5 hari |
| 1b | (di tab 1) **Matriks penyakit × hasil** | Baris 4 penyakit, kolom Alert / Spesimen / % diperiksa / Positif / Negatif / Proses / % positif, sel berwarna | `by_disease` dari `/laboratorium` (tanpa endpoint baru) | Tabel baru kecil | 0,5 hari |
| 1c | (opsional) **Matriks provinsi × penyakit (positif)** | Heatmap provinsi teratas × 4 penyakit | Perlu field baru `by_province_disease` di `lab_klaster::laboratorium` | Backend + tabel baru | 1 hari |
| 2 | **7-1-7** | 3 kartu EBS + rincian per penyakit, tabel sinyal (Lihat → SignalModal), Alert SKDR 7-1-7, respons EBS | `/analytics/summary` (t717), `/alert-skdr`, `/ebs-analitik` | `T717 data={summary.t717}`, `AlertT717`, `EbsResponsCard` | 0,5 hari |
| 3 | **Alert & verifikasi** | Status verifikasi/KLB, funnel EBS, matriks diagnosa awal → verifikasi | `/alert-skdr`, `/ebs-analitik` | `AlertSection`, `EbsAlertPanel` | 0,5 hari |
| 4 | **Klaster & epi curve** | Kurva epidemi per penyakit + ambang, daftar klaster KLB | `/epicurve`, `/klaster` | `EpiCurve`, `KlasterSection showHeader={false}` | 0,5 hari |
| 5 | (opsional) **Kematian PE** | Daftar kematian Form PE per penyakit | `/signals/pe-deaths` | `DeathListModal` (isi tabelnya) | 0,5 hari |

Total inti (tab 1, 1b, 2, 3, 4 + modal + tombol + uji typecheck/build + screenshot): **±2,5–3 hari**.
Dengan 1c dan 5: **±4 hari**.

Tidak ada endpoint baru untuk versi inti; semua hanya-baca dan sudah mendukung 4 zoonosis + multi provinsi/kab-kota.

### Risiko
1. **Layout komponen** — `LabSection`, `T717`, `EbsAlertPanel` dirancang untuk lebar halaman penuh (grid `xl:`); di modal 1400px aman, di 1366px perlu dicek, mungkin butuh prop `compact`.
2. **Beban query** — `/laboratorium` menjalankan ±7 query atas `skdr_alert_fakta`; lazy per tab + cache per `qs` agar tidak semua dipanggil sekaligus.
3. **Modal bertumpuk** — `T717` membuka `SignalModal` (z-1000) dari dalam modal; z-index modal Lite harus di bawahnya (mis. z-[980]).
4. **Kualitas data** — nilai spesimen campur, Rabies dominan, notifikasi Alert SKDR 0% (lihat catatan). Perbaikan lewat aturan/kamus + proses ulang, bukan edit nilai.
5. **Hook `useDashboardSections`** tidak dipakai di modal (urutan tab tetap); seksi yang disembunyikan admin di Dasbor Utama tetap tampil di modal — perlu keputusan.
6. **Mode `next dev` di produksi** — modal menambah komponen berat; tetap disarankan pindah ke mode produksi (perubahan terpisah).

### Keputusan yang dibutuhkan
- Tab opsional 1c (matriks provinsi × penyakit, perlu ubahan backend) dan 5 (kematian PE): ikut atau tidak?
- Dua tombol ("Analisis Laboratorium" + "Detail Lainnya") atau satu tombol "Analisis" saja?
- Seksi yang disembunyikan admin di Dasbor Utama ikut disembunyikan di modal?

---

## 3. Implementasi (2026-10-29)

Keputusan yang diambil (disetujui Yosua: "Ya coba di improve da nalar ya tolong"):
- Dua tombol di panel Perbandingan CFR: **Analisis Laboratorium** (buka tab Laboratorium) dan **Detail Lainnya** (buka tab pertama selain Lab yang tampil).
- Tab 1c (provinsi × penyakit) dan tab 5 (Kematian Form PE) **ikut**.
- Seksi yang disembunyikan admin di Dasbor Utama (`app_settings.dashboard_sections`) **ikut menyembunyikan tab** (laboratorium → Lab, t717 → 7-1-7, alert → Alert, klaster → Klaster, cfr → Kematian). Bila semua tersembunyi, tombol tidak tampil.

### Berkas
| Berkas | Isi |
|---|---|
| `services/frontend-next/components/dashboard/ZoonosisLiteModal.tsx` (baru) | Modal `z-[980]`, `max-w-[1400px]`, `h-[90vh]`; chip filter hanya-baca + tombol "Ubah filter" (menutup modal); tablist; Esc (diabaikan bila SignalModal/DeathListModal terbuka), kunci scroll body, focus trap. Tab dimuat saat pertama dilihat lalu tetap ter-mount (cache promise per query, reset bila filter berubah). |
| `services/frontend-next/components/dashboard/ZoonosisLite.tsx` | Tombol, state modal, `useDashboardSections`, query modal mewarisi filter Lite (penyakit terpilih, provinsi/kab-kota, minggu epi). |
| `services/frontend-next/components/dashboard/LabSection.tsx` | Prop opsional `data` (agar modal tidak memanggil `/laboratorium` dua kali); `export type LabData`. |
| `services/frontend-next/locales/{id,en}.json` | Kunci `skdr.lite.modal.*`. |
| `services/backend-rust/src/lab_klaster.rs` | `/laboratorium` menambah `by_province_disease` (pivot 15 provinsi dengan spesimen terbanyak × penyakit: alert, spesimen, positif, negatif) + unit test `province_disease_matrix`. |
| `services/backend-rust/src/alert.rs` | Normalisasi spesimen lewat aturan konfigurasi `lab_specimen_map` (kode → ya/tidak) saat menghitung `ada_spesimen` dan label fakta; rebuild fakta dalam satu transaksi (ROLLBACK bila gagal). |
| `database/init/050_lab_spesimen_map.sql` + `database/rollback/050_rollback.sql` | Tambah `lab_specimen_map = {"1":"ya","2":"tidak"}` ke konfigurasi lab (backup `app_settings_bak_050`), reset `lab_kelas` baris spesimen '1'/'2' agar diproses ulang. |

### Isi tab
- **Laboratorium**: "Bacaan cepat" (otomatis: % alert berspesimen, % positif tertinggi untuk penyakit dengan ≥10 hasil, provinsi positif terbanyak, catatan bila hasil > spesimen); matriks penyakit × hasil (heat per kolom + baris total); matriks provinsi × penyakit dengan pilihan metrik (positif/spesimen/% positif), warna per kolom; lalu `LabSection` lengkap. Bila backend belum punya `by_province_disease` (backend lama), matriks disusun di frontend dari `/laboratorium?disease=` per penyakit.
- Kedua matriks lab punya **legenda warna** (gradasi rendah → tinggi per keluarga warna: Alert abu, Spesimen/% diperiksa teal, Positif/% positif merah, Negatif hijau, Proses/lain biru; matriks provinsi mengikuti metrik terpilih) dengan catatan bahwa intensitas relatif dalam tiap kolom (kolom persen skala tetap 0–100%) dan "·" = tidak ada alert. Setiap sel punya tooltip: nilai, artinya, dan dasar skala warnanya.
- **7-1-7**: `T717` dari `/analytics/summary` + `AlertT717` + `EbsResponsCard`.
- **Alert & verifikasi**: `AlertSection` + `EbsAlertPanel`.
- **Klaster & epi curve**: `EpiCurve` + `KlasterSection`.
- **Kematian Form PE**: kartu per kelompok CFR eksekutif (difilter ke penyakit terpilih) + daftar `/signals/pe-deaths` per form (gabung, urut tanggal kematian terbaru), tombol Lihat membuka SignalModal.

### Angka yang terlihat (dev, Semua penyakit, M1–M43/2026, Seluruh Indonesia)
- Alert 12.176; spesimen diperiksa 405 (3,3%); hasil tercatat 891 alert; positif 143, negatif 398, proses/lain 350 (positif 16%).
- Rabies 11.689 alert / 242 spesimen / 45 positif (6,3%); Leptospirosis 340 / 155 / 96 (61,5%); Flu Burung 141 / 5 / 1; Antraks 6 / 3 / 1.
- Positif terbanyak per provinsi: Jawa Tengah 56 (Leptospirosis) dari 82 spesimen.
- 7-1-7 notifikasi 100% (637/637); deteksi & respons: tanggal belum tercatat.
- Alert terverifikasi 99% (12.059), respon ≤24 jam 95,5%, KLB 21.
- Kematian Form PE 2026: 0 di semua kelompok (sesuai `/dashboard/executive`, Rabies klinis+konfirmasi diketahui 8, meninggal 0).

### Normalisasi spesimen (migrasi 050)
- Data `spesimen_diperiksa` berisi kode: "1" = 2.426 baris (2.089 punya hasil), "2" = 1.524 baris (54 punya hasil). Sebelumnya "1" dan "2" sama-sama dihitung "ada spesimen" (bukan nilai kosong).
- Dengan `lab_specimen_map`: "1" → Ya (2.426 tetap berspesimen), "2" → Tidak (spesimen turun ±1.524 setelah proses ulang).
- Migrasi diuji di DB lokal dalam transaksi lalu di-rollback (UPDATE 1 konfigurasi, 3.950 alert di-reset); **belum diterapkan** di DB lokal maupun produksi.
- **Pertanyaan terbuka**: kode hasil lab "1"/"2"/"3" belum dipetakan (arti belum pasti); tetap masuk Proses/lain.
- Catatan: ukuran DB lokal 7.336 MB (di atas panduan 7 GB).

### Uji
- `npm run typecheck` OK, `npm run build` exit 0 (node:20); `/dasbor/zoonosis-lite` 18,5 kB (first load 331 kB).
- `cargo test` (docker rust) — lihat laporan commit.
- Playwright 1366×768 di skdr-lite-dev (port 3027): semua tab tampil, kembali ke tab Lab = 0 request baru (cache), Esc menutup, buka ulang via "Detail Lainnya" = 0 request baru, "Ubah filter" menutup modal, filter Rabies saja → chip & query `disease=RABIES`. Tidak ada HTTP ≥400.
- Overlay error dev (Next dev overlay) **tidak terulang**: setelah hover/klik peta hanya ada portal bawaan Next dev, tanpa error.
- Dev memproksi ke backend produksi yang belum punya `by_province_disease` → matriks provinsi memakai fallback (4 permintaan per penyakit). Setelah backend baru dideploy, cukup 1 permintaan.

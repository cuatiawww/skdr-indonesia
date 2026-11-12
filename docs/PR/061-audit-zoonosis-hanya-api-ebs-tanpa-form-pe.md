# PR 061 – Audit & Fleksibilitas Sumber Zoonosis (EBS & Form PE), Pembersihan Isian Form PE (Migrasi 073), Resolusi Marker Peta & Nilai Nol Alami

## Latar Belakang & Ringkasan Perubahan
Sesuai arahan pengguna, modul Zoonosis (**Dasbor Zoonosis General** dan **Dasbor Zoonosis Lite**) mendukung visualisasi data yang bersumber dari **API EBS** (`dash_ebs_reports`) maupun **Form PE** (`pe_cases` / Penyelidikan Epidemiologi individu). Apabila belum terdapat inputan data pada Form PE, antarmuka secara alami menampilkan status kosong / angka 0 (nol) tanpa manipulasi dummy maupun angka hardcoded.

### Masalah yang Ditemukan saat Audit
1. **Angka 215.114 Kasus Rabies & Marker Wajik Semu**:
   - Di database PostgreSQL, view `dash_ibs_cases` sebelumnya memetakan baris agregat mingguan IBS (`dash_ibs_rows` / `laporan_ibs_baris`) ke dalam format PE. Hal ini menyebabkan angka 215.114 kasus IBS Rabies puskesmas terbaca sebagai "Form PE" pada endpoint `/api/v1/analytics/overview`.
   - Pada view `surveillance_reports`, baris agregat IBS dimasukkan dengan `source = 'ibs'` yang oleh `dashboard.rs` dipetakan ke `source_type: "PE"`. Akibatnya, pada filter Sumber `Semua`, peta menampilkan 475 titik marker wajik/diamond (`bg-pe`) untuk Rabies padahal data aslinya berasal dari laporan agregat puskesmas, bukan Form PE maupun EBS.
2. **Disinkronisasi Kartu saat Filter `Form PE`**:
   - Saat pengguna memilih filter Sumber `Form PE`:
     - Peta memfilter `source = 'pe'` pada `surveillance_reports` yang membaca `pe_cases` murni (0 baris), sehingga peta tampil kosong ("tidak ada jalur terpetakan").
     - Namun kartu penyakit membaca `/api/v1/analytics/overview` yang membaca `dash_ibs_cases` lama, sehingga angka 215.114 kasus Rabies tetap muncul dan kartu tampak tidak dinamis.
3. **Duplikasi Parameter `source` (400 Bad Request)**:
   - Deserializer Axum/serde di Rust backend menolak permintaan dengan status `400 Bad Request` bila parameter `source` terduplikasi di query string.

---

### Rincian Perubahan & Solusi

1. **Migrasi Database 073 (`database/init/073_delete_form_pe_entries.sql` + rollback)**:
   - Menghapus seluruh isian transaksi tabel Form PE (`pe_cases`, `pe_case_events`, `pe_clusters`, `case_reports`) dan mereset sequence ke 1 sesuai permintaan user: *"SAY AINGIN AD MIGRASI DELETE ISIAN YG DARI FORM pe"*.
   - Memperbarui definisi view `dash_ibs_cases`:
     - Untuk 4 penyakit ber-Form PE aktif (`Rabies`, `Antraks`, `Leptospirosis`, `Flu Burung`), view membaca murni dari `pe_cases`. Jika tabel `pe_cases` belum ada isian, maka nilainya **0** secara alami.
     - Untuk penyakit non-PE lainnya (32 penyakit), view tetap membaca agregat mingguan `dash_ibs_rows`.
   - Memperbarui definisi view `surveillance_reports`:
     - Cabang `'ibs'` mengecualikan penyakit yang memiliki Form PE aktif, sehingga data agregat IBS tidak lagi bocor ke peta Zoonosis sebagai titik semu ber-`source_type: "PE"`.

2. **Dinamisme Kartu Penyakit Zoonosis Lite (`ZoonosisLite.tsx`)**:
   - Kartu metrik 4 penyakit (Antraks, Rabies, Leptospirosis, Flu Burung) secara dinamis mengikuti filter Sumber:
     - **Semua**: Menggabungkan EBS + Form PE. Saat ini Leptospirosis menampilkan 806 kasus EBS murni (subteks `EBS 806 kasus (650 sinyal) + PE 0 kasus`). Rabies, Antraks, dan Flu Burung menampilkan 0 kasus alami (CFR `—`).
     - **EBS**: Menampilkan data murni dari API EBS. Leptospirosis menampilkan 806 kasus (subteks `650 sinyal alert EBS (806 kasus)`).
     - **Form PE**: Menampilkan data murni dari Form PE. Seluruh kartu menampilkan 0 kasus, 0 kematian, CFR `—`, dan subteks `0 kasus Form PE (0 kematian)`.
   - Sparkline mingguan dan Wilson 95% CI beradaptasi penuh terhadap sumber yang aktif.

3. **Marker Peta Spasial Bersih & Alami**:
   - Titik lokasi pada peta Zoonosis Lite memfilter murni sumber `'ebs'` dan `'pe'` (`SpatialOutbreakMap.tsx` / `AseanMap.tsx`).
   - Sinyal EBS Leptospirosis tampil sebagai titik **lingkaran** (`bg-ebs`), bukan wajik.
   - Rabies tidak lagi menampilkan 475 titik wajik semu pada filter Semua maupun Form PE.

4. **Legenda Heatmap Zoonosis Lite (`ZoonosisLiteHeatmap.tsx`)**:
   - Label metrik PE pada legenda heatmap diperbarui menjadi `"Kasus Form PE"` menggantikan label lama `"Kasus IBS"`.
   - Nilai kolom PE untuk keempat zoonosis menampilkan nilai 0 alami dan rentang `0 – 0`.

5. **Resolusi 400 Bad Request**:
   - Query string `qs` disatukan via `toQs({ source: src !== 'all' ? src : undefined })` tanpa penggabungan parameter `source` ganda pada pemanggilan `fetchFrom`.
   - Endpoint terverifikasi mengembalikan `HTTP 200 OK`.

6. **Integritas Bebas Dummy**:
   - Tidak ada data dummy atau hardcoded. Semua angka dihitung dari agregasi database PostgreSQL live.

---

## Verifikasi
- `tsc --noEmit`: 0 error (TypeScript Next.js).
- Migrasi DB 073 diterapkan dan diverifikasi di `skdr-postgres`.
- Verifikasi API via curl & script:
  - `/api/v1/analytics/overview`: HTTP 200 OK, `trend.pe` kosong `[]` (0 kasus alami).
  - `/api/v1/public-dashboard`: HTTP 200 OK, 119 lokasi EBS Leptospirosis murni, 0 titik IBS/wajik pada Rabies.
- Git status: Bersih dari file sementara `.bak`, perubahan tersimpan di git lokal (tidak di-push).

---

## File Terkait
- `database/init/073_delete_form_pe_entries.sql` (baru)
- `database/rollback/073_rollback.sql` (baru)
- `services/frontend-next/components/dashboard/ZoonosisLite.tsx` (diperbarui)
- `services/frontend-next/components/dashboard/ZoonosisLiteHeatmap.tsx` (diperbarui)
- `docs/CHANGE_LOG_MATRIX.md` (diperbarui)
- `docs/PR/061-audit-zoonosis-hanya-api-ebs-tanpa-form-pe.md` (diperbarui)

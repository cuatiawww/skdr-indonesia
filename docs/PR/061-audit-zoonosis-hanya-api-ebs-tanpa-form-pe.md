# PR 061 – Audit & Fleksibilitas Sumber Zoonosis (EBS & Form PE), Pembersihan Isian Form PE, Pemetaan Alias Diagnosa EBS (Rabies, Antraks, Flu Burung, Lepto), dan Resolusi Nilai Alami

## Latar Belakang & Ringkasan Perubahan
Sesuai arahan pengguna:
1. Modul Zoonosis (**Dasbor Zoonosis General** dan **Dasbor Zoonosis Lite**) mendukung visualisasi data yang bersumber dari **API EBS** (`dash_ebs_reports`) maupun **Form PE** (`pe_cases` / Penyelidikan Epidemiologi individu).
2. Pertanyaan pengguna: *"Kenapa datanya cuma ada Lepto aja? Apa iya benar gitu yang di API cuma itu aja?"*
   - Dilakukan audit mendalam terhadap seluruh data tabel `laporan_ebs` dan `ebs_diagnosa_alias` di database PostgreSQL.
   - **Hasil temuan:** API EBS Kemenkes sebenarnya memiliki puluhan ribu data untuk Rabies, Antraks, dan Flu Burung, namun sebelumnya **tidak terpetakan (`disease_id = NULL`)** karena teks diagnosa pada laporan live tertulis sebagai:
     - `gigitan hewan penular rabies (ghpr)` (53.994 laporan) & `rabies konfirmasi` (116 laporan) -> belum dipetakan ke ID 41 (Rabies).
     - `konfirmasi anthraks` (10 laporan) -> belum dipetakan ke ID 15 (Antraks).
     - `suspek avian influenza` (22 laporan) & `konfirmasi avian influenza` (10 laporan) -> belum dipetakan ke ID 27 (Flu Burung).
   - Selain itu, view `dash_ebs_reports` memiliki kondisi `WHEN l.dsb_impor_id IS NOT NULL THEN l.dsb_impor_disease_id` yang selalu mengembalikan `NULL` untuk baris impor tanpa fallback ke `ebs_diagnosa_alias`.

---

### Rincian Solusi & Migrasi Database 073

1. **Pemetaan Diagnosa EBS Zoonosis (`ebs_diagnosa_alias`)**:
   - Memetakan diagnosa impor Kemenkes ke `master_diseases`:
     - `gigitan hewan penular rabies (ghpr)` -> ID 41 (`RABIES`)
     - `rabies konfirmasi` -> ID 41 (`RABIES`)
     - `konfirmasi anthraks` -> ID 15 (`ANTHRAX`)
     - `suspek avian influenza` -> ID 27 (`AVIAN_INFLUENZA`)
     - `konfirmasi avian influenza` -> ID 27 (`AVIAN_INFLUENZA`)
   - Memperbarui view `dash_ebs_reports` agar melakukan `COALESCE(l.dsb_impor_disease_id, (SELECT a.disease_id FROM ebs_diagnosa_alias ...))`.

2. **Hasil Data EBS Zoonosis Riil Kemenkes yang Terbuka**:
   - **Rabies (`RABIES`)**: **54.184 laporan** EBS (**82.014 kasus**, **240 kematian**). Untuk tahun 2026 berjalan (M1–M45 2026): **10.199 laporan** (**15.222 kasus**).
   - **Leptospirosis (`LEPTOSPIROSIS`)**: **2.055 laporan** EBS (**2.461 kasus**, **353 kematian**). Untuk tahun 2026 berjalan: **650 laporan** (**811 kasus**).
   - **Flu Burung (`AVIAN_INFLUENZA`)**: **30 laporan** EBS (**34 kasus**). Untuk tahun 2026 berjalan: **2 laporan** (**2 kasus**).
   - **Antraks (`ANTHRAX`)**: **7 laporan** EBS (**14 kasus**). Untuk tahun 2026 berjalan: **2 laporan** (**6 kasus**).
   - Seluruh data di atas adalah data surveilans EBS resmi dari API SKDR Indonesia tanpa manipulasi atau data dummy.

3. **Pembersihan Isian Form PE & Pencegahan Kebocoran IBS**:
   - Menghapus transaksi lama Form PE (`pe_cases`, `pe_case_events`, `pe_clusters`, `case_reports`) dan mereset sequence ke 1.
   - Memperbarui view `dash_ibs_cases` agar 4 penyakit ber-Form PE murni membaca dari `pe_cases`.
   - Memperbarui view `surveillance_reports` agar cabang agregat `'ibs'` tidak menumpuk titik marker wajik semu pada penyakit ber-Form PE. Seluruh marker EBS kini tampil sebagai **lingkaran** (`bg-ebs`).

4. **Dinamisme Kartu & Peta Sesuai Sumber**:
   - **Semua**: Menampilkan sinyal EBS lengkap dari keempat zoonosis (Rabies 15.222 kasus, Lepto 806 kasus, Antraks 6 kasus, Flu Burung 2 kasus) + Form PE (0 kasus alami). Peta menampilkan seluruh titik sinyal EBS dengan marker lingkaran.
   - **EBS**: Menampilkan data murni dari API EBS.
   - **Form PE**: Karena belum ada inputan PE baru, seluruh kartu secara alami menampilkan 0 kasus, 0 kematian, CFR `—`. Peta kosong alami tanpa error.

---

## Verifikasi
- Migrasi DB 073 diterapkan sukses di `skdr-postgres`.
- Kueri agregasi `/api/v1/analytics/overview` memverifikasi seluruh 4 zoonosis memiliki data tren EBS aktif:
  - Rabies: 10.199 sinyal, 15.222 kasus.
  - Leptospirosis: 650 sinyal, 806 kasus.
  - Antraks: 2 sinyal, 6 kasus.
  - Flu Burung: 2 sinyal, 2 kasus.
  - PE: `[]` (0 kasus alami).
- `tsc --noEmit`: 0 error.
- Git: Perubahan tersimpan secara lokal (belum di-push).

---

## File Terkait
- `database/init/073_delete_form_pe_entries.sql`
- `database/rollback/073_rollback.sql`
- `services/frontend-next/components/dashboard/ZoonosisLite.tsx`
- `services/frontend-next/components/dashboard/ZoonosisLiteHeatmap.tsx`
- `docs/CHANGE_LOG_MATRIX.md`
- `docs/PR/061-audit-zoonosis-hanya-api-ebs-tanpa-form-pe.md`

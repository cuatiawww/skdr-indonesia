# PR 012 — Visualisasi dasbor, halaman Penyakit, badge/filter Sumber, halaman Dokumentasi

Tanggal: 2026-10-21 · Commit lokal (tidak di-push).

## Ringkasan
1. **Dasbor utama** (urutan: 4 card ringkasan → peta lebar penuh → grafik indikator sheet No. 50–75):
   tren mingguan per penyakit (EBS dan Kasus PE di grafik terpisah, penyakit bisa dipilih), heatmap minggu epid × provinsi,
   CFR per penyakit (batang + IK 95% Wilson + tabel), gauge 7-1-7, donut status PE, batang cakupan wilayah.
   Tabel status indikator dipindah dari dasbor ke `/dokumentasi`.
2. **Menu Penyakit** `/penyakit`: grid 31 penyakit master (badge kategori, ICD-10, nama, deskripsi, jumlah alert EBS dan kasus PE terpisah, cari + filter kategori).
   Detail `/penyakit/[kode]`: deskripsi/gejala/cara penularan/ICD-10, filter Sumber + provinsi + kab/kota + periode (12/26/52/104 minggu),
   kurva epidemi mingguan (EBS, PE), choropleth provinsi → kab/kota (klik untuk drill-down), wilayah teratas, umur × jenis kelamin,
   CFR (PE dan EBS dihitung terpisah), alert EBS dan laporan PE terbaru (nama pasien hanya inisial).
   Kolom baru `master_diseases.icd10/symptoms/transmission` (migrasi 021, terisi untuk 31 penyakit) dan dapat diedit di Master Data → Penyakit.
3. **Sumber data**: badge `EBS` (oranye) / `Kasus PE` (biru) di setiap card/grafik; filter global Sumber: Semua / EBS / Kasus PE
   (opsi lama "Formulir" diganti "Kasus PE"; `?source=form` dipetakan ke `pe`). Alert EBS dan Kasus PE **tidak pernah dijumlahkan**:
   peta utama menampilkan satu sumber (EBS bila Semua/EBS, Kasus PE bila Kasus PE) dengan catatan di judul.
   Filter Sumber dari URL kini langsung diterapkan (sebelumnya hanya mengisi form filter).
4. **Dokumentasi** `/dokumentasi` (tab): Alur Bisnis (diagram mermaid interaktif — kotak dapat diklik — dan alur 7-1-7), Glosarium,
   Status Indikator (tabel yang dipindah, filter tersedia/sebagian/tertunda), Sumber Data & Aturan, Panduan Pengisian Form PE.
   Konten di `public/docs/dokumentasi/*.md` (bukan hardcode di komponen). Status indikator No. 19, 50–58, 59–64, 65–69/72–75 diperbarui (migrasi 022).
5. **Header halaman** hanya teks (judul + deskripsi), tanpa kotak ikon: komponen bersama `components/PageHeader.tsx`;
   `MasterHeader` (prop `icon` diabaikan), halaman EBS dan daftar PE disesuaikan.
6. Label hardcode PR 010 (ringkasan eksekutif) dipindah ke kunci locale `skdr.exec.*`; kunci baru `skdr.charts/penyakit/source/docs.*` di id.json dan en.json.

## Temuan menu lama "Formulir Laporan Kasus" (/form) dan "Laporan Kasus" (/reports)
- Keduanya adalah formulir generik lama `case_reports` (13 baris). Fungsinya sudah digantikan Form PE per penyakit.
- Yang masih memakai **data** `case_reports`: view `surveillance_reports` (source `form`), hitungan/cakupan di `exec_dash`,
  `report_count` di Master Data, endpoint `/api/v1/case-reports`. Tidak ada fitur yang bergantung pada kedua **halaman** tersebut.
- Tindakan: menu disembunyikan (migrasi 021, cadangan `app_settings_bak_021`), route `app/form` dan `app/reports` dihapus (sekarang 404),
  tautan header "LAPORAN" diganti "PENYAKIT". **Tabel, view, data dan API tidak dihapus.** Dicatat di Dokumentasi → Sumber Data & Aturan.

## Backend
- `analytics.rs` (baru): `GET /api/v1/analytics/overview`, `GET /api/v1/analytics/diseases`, `GET /api/v1/analytics/diseases/:code` — agregasi di SQL; 404 untuk kode tidak dikenal.
- `dashboard.rs`: `source=pe` diterima; `start_date`/`end_date` (YYYY-MM-DD) opsional. `exec_dash.rs`: EBS disembunyikan bila Sumber = form/pe; card membawa `disease_code`.
- `master_admin.rs`: CRUD penyakit mendukung `icd10`, `symptoms`, `transmission`.
- View `surveillance_reports` kini memuat baris `pe` (kasus PE berstatus terhitung, tidak terhapus; koordinat = centroid kab/kota/provinsi).

## Database
- `021_penyakit_dashboard.sql` (+ `rollback/021_rollback.sql`): kolom penyakit, view, menu (cadangan `master_diseases_bak_021`, `app_settings_bak_021`).
- `022_indicator_status_pr012.sql` (+ rollback): status indikator (cadangan `app_settings_bak_022`).
- Dependensi frontend baru: `mermaid` (hanya untuk halaman Dokumentasi, di-load dinamis).

## Hasil uji (nyata, 2026-10-21)
| Uji | Hasil |
|---|---|
| cargo test | 7/7 lulus |
| tsc --noEmit | 0 error |
| analytics_api_test.py (baru) | 16/16 PASS (404 kode tak dikenal, total EBS/PE terpisah & cocok dengan grid, Sumber ebs/pe menyembunyikan sumber lain, inisial pasien) |
| pe_api_test (lepto/rabies/antraks/ai) | 4/4 PASS |
| pe_crud_test (4 form) | 4/4 PASS |
| smoke_test.sh | PASS |
| HTTP | /penyakit, /penyakit/LEPTOSPIROSIS, /dokumentasi 200; /form, /reports 404 |
| Playwright | urutan dasbor y: card 504 < peta 986 < tren 1745 < heatmap 2208 < CFR 3153 < gauge/donut/cakupan 3740; tabel indikator di dasbor 0; Sumber=PE → 0 badge EBS di card, gauge 7-1-7 tersembunyi; grid 31 card; detail: 10/10 seksi, choropleth 38 provinsi, grafik epi tampil; dokumentasi: 2 diagram mermaid tanpa error, indikator 27 baris (filter Tertunda 8); header tanpa ikon di 5 halaman (penyakit, dokumentasi, ebs, pe/lepto, master/penyakit); menu tanpa /form & /reports; 0 page error, 0 console error |

Catatan: data uji (baris "UJI …") tidak dihapus.

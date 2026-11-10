# PR 041 - Dasbor Utama: semua seksi mengikuti Sumber (EBS / IBS)

Tanggal: 2026-11-10

## Masalah
- Di Sumber = IBS, Ringkasan masih menampilkan kartu "Sinyal EBS", "Dilaporkan di EBS", "Provinsi dengan sinyal EBS" (nilai 0) karena flag tampil memakai `d.filters.source` dari backend, yang sejak PR 039 bernilai `ibs` (bukan `pe`).
- Kartu IBS berlabel "Laporan individu" padahal angkanya kasus Laporan Agregat IBS; kalimat header menghitung Laporan Individu IBS (0); catatan kaki mencampur teks EBS dan IBS; "terverifikasi" selalu 0.
- Di Sumber = EBS, seksi IBS (CFR Alert, Alert IBS, 7-1-7 Alert, Laboratorium IBS, epi curve, klaster IBS, NAR) tetap tampil.
- Label grafik/peta masih "Kasus PE".

## Perubahan per seksi
| Seksi | Sumber EBS | Sumber IBS |
|---|---|---|
| Ringkasan - header | "N Laporan EBS (M alert EBS zoonosis)" | "N kasus Laporan Agregat IBS" (+ "Laporan Individu IBS" bila ada) |
| Ringkasan - KPI | Sinyal EBS, Kematian (EBS), Provinsi (EBS), Alert terverifikasi | Kasus (Laporan Agregat IBS) + "kasus dari alert terverifikasi", Kematian (Laporan Agregat IBS), Provinsi dengan kasus IBS, Kasus IBS terverifikasi (%) |
| Ringkasan - catatan kaki | `texts.footnote` + `alert_def` | `texts.footnote_ibs` (+ `individual_def` bila ada individu) |
| Kartu penyakit | tanpa baris "CFR IBS" | CFR IBS |
| CFR | seksi disembunyikan | CFR Alert IBS + CFR Laporan Individu IBS (bila ada) |
| Alert | panel Laporan EBS (funnel) | Alert IBS |
| 7-1-7 | 7-1-7 EBS + respons EBS | 7-1-7 Alert IBS (catatan "hanya EBS" tidak lagi tampil) |
| Laboratorium | hanya "Laporan EBS dengan hasil laboratorium" | spesimen/hasil alert IBS (tanpa daftar EBS); KPI "Alert IBS" |
| Peta | mode Sinyal + Laporan EBS rinci | hanya mode Sinyal (alert Laporan Agregat IBS); teks per sumber |
| Tren | EBS + perbandingan tahun lalu EBS | IBS; label "Kasus IBS" (bukan "Kasus PE") |
| Klaster | "Klaster dan KLB": hanya Laporan EBS bertanda KLB | epi curve + klaster KLB alert IBS (tanpa tabel EBS) |
| NAR-SKDR | seksi disembunyikan | tampil |
Sumber = Semua: semua bagian tampil seperti sebelumnya.

## Backend / DB
- Migrasi `062_dasbor_utama_sumber_dinamis.sql` (rollback `database/rollback/062_rollback.sql`):
  - `dash_ibs_cases.status` = `terverifikasi` bila alert IBS terverifikasi (sts_verif), selain itu `dikirim`.
  - `app_settings.dashboard_executive.texts`: `footnote` (EBS saja) + `footnote_ibs` baru; cadangan `app_settings_bak_062`.
  - `skdr_nsum` diberi COMBINEFUNC + PARALLEL SAFE, `skdr_unit_ok` PARALLEL SAFE (GUC `skdr.units` ikut ke worker; diuji hasil sama dengan/ tanpa paralel). `/analytics/summary` Sumber IBS 17,5 s -> 4,9 s lokal.
- Tidak ada perubahan kode Rust.

## Frontend
- `ExecutiveSummary.tsx`, `DiseaseCard.tsx`, `DiseaseTable.tsx`, `LabSection.tsx`, `KlasterSection.tsx`, `EpiCurve.tsx`, `AlertSkdrSections.tsx`, `PetaMultiMode.tsx`, `TrendHeatmap.tsx`, `app/main-dashboard/page.tsx`, `locales/{id,en}.json`.
- Prop `sumber` baru (opsional, default `all`) pada LabSection/KlasterSection/PetaMultiMode, sehingga halaman lain (Zoonosis Lite dll.) tidak berubah.

## Uji
- `tsc --noEmit` 0 error; backend menerapkan migrasi 062; migrasi + rollback diuji dalam transaksi.
- Smoke API sumber=ebs/ibs: semua endpoint dasbor 200.
- Render headless Sumber EBS: seksi ringkasan, alert, t717, laboratorium, wilayah, tren, klaster; teks "IBS" hanya di menu/filter.
- Render headless Sumber IBS: seksi ringkasan, cfr, alert, t717, laboratorium, wilayah, tren, klaster, nar; teks "EBS" hanya di menu/filter.

## Catatan / risiko
- "Ada hasil" laboratorium IBS bisa > spesimen (111%) karena data sumber Alert SKDR lama mengisi hasil tanpa status spesimen; tidak diubah.
- Mode Semua: kartu penyakit masih menjumlahkan kematian EBS + IBS (perilaku lama).
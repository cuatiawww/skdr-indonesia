# PR 039 - Dasbor Utama dari Laporan EBS & Laporan IBS (matriks diisi dari API SKDR lama)

Tanggal: 2026-11-10

## Ringkasan
Dasbor Utama (`/main-dashboard`) tidak lagi membaca langsung tabel sinkron API SKDR lama (`ebs_reports`, `skdr_alert_fakta`)
atau Form PE (`pe_cases`), tetapi membaca **matriks laporan di SKDR Indonesia**:

| Sumber dasbor | Sebelum | Sekarang |
|---|---|---|
| EBS (KPI/peta EBS, Ringkasan Eksekutif EBS, EBS Analitik/Wilayah, Lab/Klaster EBS) | `ebs_reports` (sinkron API EBS lama) | Laporan EBS terkirim (`laporan_ebs`) via view `dash_ebs_reports` |
| Agregat mingguan (Alert, epi curve, CFR, 7-1-7, Laboratorium, Klaster, NAR, KPI/tren sumber IBS, peta) | `skdr_alert_fakta` + `pe_cases` (Form PE) | Laporan Agregat IBS (`laporan_ibs` -> `laporan_ibs_baris`) via `dash_ibs_fakta`, `dash_ibs_cases`, `dash_ibs_rows` |
| Kasus individu (kartu "individu" & CFR/daftar kematian di Ringkasan Eksekutif, detail sinyal) | `pe_cases` | Laporan Individu IBS (`laporan_ibs_individu`) via `dash_ibs_individu` |

Pilihan Sumber di filter dasbor: **EBS** / **IBS** (`?sumber=ebs` / `?sumber=ibs`; `?sumber=pe` lama tetap diterima).

## Pengisian matriks dari API SKDR lama
Data API lama yang sudah disinkron ke DB lokal dipetakan ke bentuk form:
* `ebs_reports` -> `laporan_ebs` (satu baris = satu Laporan EBS, status Terkirim, nomor `EBS-<tahun>-NNNNNN`).
* `skdr_alerts` + `skdr_alert_fakta` -> `laporan_ibs` (satu laporan per unit x minggu; baris matriks = penyakit yang ada
  alert-nya: kasus, kematian; metadata alert (verifikasi, KLB, respons 24 jam, spesimen, kelas lab) disimpan di `data._impor.alert`).
* Laporan dari form untuk unit x minggu yang sama tidak pernah ditimpa; laporan impor ditandai `data._impor` dan
  `created_by_name = 'Impor API SKDR lama'`.
* Dijalankan backend (`impor_lama.rs`) 90 detik setelah start lalu tiap `app_settings.laporan_impor_lama.interval_menit`
  (inkremental berdasar `synced_at`, log di `laporan_impor_lama_log`). Pengaturan: `enabled`, `ibs_tahun_mulai` (2026),
  `ebs_tanggal_mulai` (2024-01-01).

Pemetaan EBS: kel_unit->jenis_unit, province/kabkota->provinsi_id/kabkota_id, kode_depdagri_distrik/distrik->kecamatan/kecamatan_nama,
unit->unit_pelapor, diagnosa->penyakit_rumor, verifikasi->penyakit_terverifikasi (bila Terverifikasi), sts_rumor->status_kejadian
(dinormalkan ke 5 opsi form; nilai asli di `_impor.sts_rumor`), jml_kasus/jml_kematian, kronologi, klb 1/0->Ya/Tidak (-1 kosong),
tgl_laporan; tindakan/saran/no_ebs/disease_id/create_date/update_date disimpan di `_impor`.
Tidak ada padanan (dibiarkan kosong): nama/HP pelapor, tanggal rumor asli (diisi = tgl laporan), sumber informasi/verifikasi,
usia x jenis kelamin, domisili, gejala & tanggal onset, laboratorium, tata laksana, detail KLB (W1, SK, TGC), PFR/komrisk/koordinasi.
Pemetaan IBS: kategori_unit->jenis_unit, kode_unit->unit_kode/unit_key, kecamatan, unit, tahun/minggu, kasus/kematian per kode.
Tidak ada padanan: Total Kunjungan, jumlah lab per penyakit, petugas, penyakit tanpa alert (bukan rekap mingguan lengkap).
Laporan Individu IBS: API lama tidak punya data per pasien, jadi tetap kosong (hanya dari form).

## Basis data (060_dasbor_utama_laporan_ebs_ibs.sql)
View `dash_*`, kolom generated `laporan_ebs.dsb_*`, tabel `laporan_ibs_baris` (trigger), agregat `skdr_nsum`, fungsi impor,
`laporan_impor_lama_log`, setting `laporan_impor_lama`; `surveillance_reports` cabang ebs/ibs dari laporan.
Rollback: `database/rollback/060_rollback.sql` (hapus laporan hasil impor + event, setel ulang `laporan_counters`, hapus objek baru,
kembalikan `surveillance_reports` versi 035 dan teks app_settings).

## Backend / frontend
`dashboard.rs`, `exec_dash.rs`, `ebs_dash.rs`, `dash_alert.rs`, `lab_klaster.rs`, `analytics.rs` (overview/summary; hitung `skdr_nsum(c.n)`),
`signals.rs` (id negatif = laporan lokal, tautan ke /ebs/laporan atau /ibs/individu), `nar.rs`, `fasyankes.rs`, `impor_lama.rs`, `main.rs`.
Frontend: label sumber IBS (`use-sumber.ts`, `SourceBadge.tsx`, `SkdrFilterBar.tsx`, `main-dashboard/page.tsx`, `ExecutiveSummary.tsx`, locales).
Cadangan file asli: `*.rs.bak` dan `app/main-dashboard/page.tsx.bak` (lokal, tidak di-commit).

## Uji
* Impor penuh lokal: 192.635 Laporan EBS (2024-01-01..2026-04-09), 325.805 Laporan Agregat IBS 2026 minggu 1-44
  (5.412.554 kasus = total `skdr_alert_fakta` 2026); putaran kedua 0 tambah/0 ubah. Waktu impor awal ~2 menit.
* Paritas: jumlah Laporan EBS 2026 = `ebs_reports` (45.074), update_date terisi 90.553 = sumber; kasus IBS 2026 sama persis.
* Rollback diuji: semua laporan impor terhapus, counter kembali 0, lalu migrasi + impor diterapkan ulang.
* Endpoint dasbor (public-dashboard, executive, analytics summary/overview, epicurve, alert-skdr, ebs-analitik, ebs-wilayah,
  laboratorium, klaster, nar, filters/units, sections) 200 untuk sumber ebs dan ibs; halaman main-dashboard, /ebs/laporan, /ibs/laporan 200;
  `tsc --noEmit` 0 error; build backend tanpa error.

## Catatan / risiko
* Jumlah alert IBS sedikit lebih kecil dari `skdr_alert_fakta` (baris ganda unit x minggu x penyakit digabung; kasus tetap sama).
* Status kejadian EBS dinormalkan (mis. "Terverifikasi (PEMILU 2024)" -> "Terverifikasi").
* Detail penyakit, Beranda, dan analytics latest masih membaca `ebs_reports` + `pe_cases`.
* `filters/units` lambat (~15 dtk) karena pencocokan nama unit ke master fasyankes (pola lama, kini lebih banyak unit).
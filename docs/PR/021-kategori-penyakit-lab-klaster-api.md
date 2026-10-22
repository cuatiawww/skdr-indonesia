# PR 021 - Dasbor dari data API: kategori penyakit, dasbor per kategori, Laboratorium, Klaster, Alert SKDR, migrasi hapus data form

Status: **lokal, belum di-commit, belum di-push.**

## Ringkasan
- Kategori penyakit disimpan di DB (`master_disease_categories` + `master_disease_category_map`, satu penyakit boleh lebih dari satu kategori, satu kategori utama).
- Dasbor Utama punya filter **Kategori Penyakit**; pilihan kategori mempersempit daftar Penyakit. Backend: parameter `kategori` di `dashboard::resolve()` sehingga semua endpoint yang memakai `resolve` (public-dashboard, kpi-snapshot, executive, analytics, nar, signals, laboratorium, klaster) ikut terfilter.
- **Dasbor per kategori** `/dasbor/kategori/<kode>` = Dasbor Utama yang sama, otomatis terkunci ke kategori itu. Sub-menu "Dasbor Kategori" di sidebar dibuat dari tabel kategori (item navigasi `source: disease_categories`), bukan daftar di kode.
- Master Penyakit: kolom "Kategori Surveilans" (chip, utama berwarna) + pemilih kategori di form tambah/edit (`kategori: [kode,...]`, urutan pertama = utama).
- Sumber API baru **Alert SKDR mingguan** (`https://skdr.surveilans.org/api/alert`, POST tahun/minggu/limit/page, header User-Key yang sama dengan EBS): tabel `skdr_alerts`, log `skdr_alert_sync_log`, peta kode penyakit `skdr_penyakit_map`, jadwal otomatis (config `skdr_alert_sync`: 8 minggu terakhir tiap 360 menit), sinkron manual `POST /api/v1/integrasi/alert-skdr/sync` (body opsional `{tahun, minggu_dari, minggu_sampai}`), status `GET /api/v1/integrasi/alert-skdr/status`. Field pribadi `temuan` (daftar nama pasien) dan `petugas_verifikasi` tidak disimpan.
- Halaman **Laboratorium** (`/laboratorium`, `GET /api/v1/laboratorium`) dan **Klaster** (`/klaster`, `GET /api/v1/klaster`) dari Alert SKDR + EBS, filter sama dengan dasbor (periode minggu epi, kategori, penyakit, provinsi, kab/kota, unit).
- Migrasi **hapus data form** (`database/manual/pr021_hapus_data_form.sql`) - tidak otomatis, butuh persetujuan.

## Peta API -> seksi dasbor
| Sumber | Endpoint | Field kunci | Cakupan (DB lokal 22 Okt 2026) | Dipakai di |
|---|---|---|---|---|
| EBS | `/api/ebs` (resultEbs) | no_ebs, diagnosa, propinsi/kota/distrik + kode depdagri, jml_kasus, jml_kematian, sts_rumor, verifikasi, klb (-1/0/1), lat/lng, tgl_laporan, kronologi | 150.781 laporan, 1 Jan 2025 - 9 Apr 2026; 61 diagnosa, 87.008 baris belum terpetakan ke master | Dasbor Utama (kartu, peta, tren, heatmap, 7-1-7), Penyakit, Klaster (EBS KLB), Laboratorium (diagnosa "dengan hasil lab"/"Konfirm Laboratorium") |
| Alert SKDR | `/api/alert` (resultAlert) | uniq_id, unit + kategori unit (Puskesmas/RS), provinsi/kota/kecamatan, lat/lng, kode/nama penyakit, tahun, minggu, kasus, jml_kematian, sts_verifikasi, tgl_verifikasi, klb (0/1/2), respon24 (Ya/Tidak), jenis_verif, gejala, kronologi, tindakan, spesimen_diperiksa (Ya/Tidak/-), hasil_pemeriksaan (positif/negatif/dalam_proses/-) | 2026 M1-M41: 515.626 alert (536 halaman, 0 retry, ~15 menit); provinsi 100%, kab/kota 99,4%, penyakit 43% | Laboratorium, Klaster |
| Penyakit SKDR | `/api/penyakit` | kode, kode_sms, nama (25 kode) | 25 | `skdr_penyakit_map` (seed) |
| Unit pelapor | `/api/unit` | kode, nama_unit, unit (jenis), kode prop/kota/kecamatan | 13.255 unit | belum dipakai (usulan: master unit pelapor) |
| SATUSEHAT | mastersarana (PR 019) | Puskesmas/RS | sudah ada | Master Puskesmas/RS |
| Lainnya | `/api/klb`, `/api/lab`, `/api/laboratorium`, `/api/kluster`, `/api/pe`, `/api/ews`, ... | - | HTTP 405 "Unknown method" | - |

## Kategori dan pemetaan (utama dulu)
- **Zoonosis**: Antraks*, Flu Burung*, Hantavirus*, Henipavirus*, Leptospirosis*, Nipah*, Rabies*; tambahan: Mpox, CCHF, Lassa, Rift Valley, Ebola, MERS, Marburg, West Nile
- **PD3I**: Campak*, Difteri*, Pertusis*, Polio*; tambahan: TBC
- **Tular Vektor**: Chikungunya*, Dengue*, Filariasis*, Malaria*, West Nile*, Zika*; tambahan: CCHF, Rift Valley
- **Menular Langsung & Saluran Napas**: COVID-19*, HFMD*, HIV/AIDS*, TBC*; tambahan: Flu Burung, MERS
- **Tular Makanan, Air & Lingkungan**: Tifoid*, Melioidosis*
- **PIE (Penyakit Infeksi Emerging)**: Mpox*, CCHF*, Lassa*, Rift Valley*, Ebola*, MERS*, Marburg*, Penyakit Tidak Dikenal*; tambahan: COVID-19, Flu Burung, Henipavirus, Nipah, West Nile, Zika

## Migrasi
| File | Isi | Rollback |
|---|---|---|
| `database/init/039_kategori_penyakit.sql` | tabel kategori + map, 6 kategori, 50 pasangan penyakit-kategori | `rollback/039_rollback.sql` |
| `database/init/040_skdr_alert.sql` | `skdr_alerts`, `skdr_alert_sync_log`, `skdr_penyakit_map` (25 kode), config `skdr_alert_sync`, `lab_klaster_config` | `rollback/040_rollback.sql` |
| `database/init/041_nav_kategori_lab_klaster.sql` | grup Dasbor: Dasbor Utama, Dasbor Kategori, Penyakit, Laboratorium, Klaster, Mode TV (backup `app_settings_bak_041`); grup Master Data tidak diubah | `rollback/041_rollback.sql` |
| `database/init/042_skdr_alert_kelas.sql` | kolom turunan ada_spesimen, lab_kelas, is_klb, respon24_ok + config respon24/lab_result_map (backup `app_settings_bak_042`) | `rollback/042_rollback.sql` |
| `database/init/043_skdr_alert_fakta.sql` | tabel ramping `skdr_alert_fakta` (116 MB vs 2,6 GB), diisi ulang tiap sinkron | `rollback/043_rollback.sql` |
| `database/manual/pr021_hapus_data_form.sql` | **manual**: backup ke skema `backup_pr021`, lalu hapus pe_case_events 323, pe_cases 80 (12 di antaranya soft delete), pe_clusters 9, pe_counters 5, case_reports 21 | `database/manual/pr021_hapus_data_form_rollback.sql` |

Catatan: saat backend dibangun ulang, migrasi 037 dan 038 (milik PR 019/020, sudah ter-commit tapi belum pernah jalan di DB ini) ikut jalan. 038 adalah salinan 035 (idempoten) dan menambah 1 baris contoh di `external_sync_logs`.

## Hapus data form - cara jalan (butuh persetujuan Yosua)
1. `docker exec skdr-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/pre_hapus_form_<tgl>.dump`
2. `sh backups/q.sh < database/manual/pr021_hapus_data_form.sql`
3. Rollback bila perlu: `sh backups/q.sh < database/manual/pr021_hapus_data_form_rollback.sql`
Sudah diuji di salinan DB `skdr_dev_pr021` (restore dari `backups/pre_pr021_20261022_1950.dump`): hapus OK, jalankan ulang ditolak (backup tidak tertimpa), rollback mengembalikan 80/323/9/5/21. **Belum dijalankan di DB `skdr_indonesia`.**

## Uji
- `cargo check --release` (rust:1-slim-bookworm): 0 error, 0 warning; image backend dibangun ulang, migrasi 037-043 jalan.
- `tsc --noEmit`: exit 0.
- `scripts/penyakit/analytics_api_test.py`: ALL PASS.
- Filter kategori (public-dashboard 2026 M1-M42, events): semua 43.009; Zoonosis 733; PD3I 9.845; Tular Vektor 6.570; Menular Langsung 825; Tular Makanan & Air 1.684; PIE 85; Zoonosis + Dengue = 0 (irisan benar).
- Laboratorium 2026 M1-M42: 515.626 alert, 93.524 spesimen, 103.183 ada hasil, 49.334 positif, 14.211 negatif, 38.237 dalam proses; 2,8 s (filter kategori/provinsi/unit 0,2-0,4 s).
- Klaster 2026 M1-M42: 736 alert KLB, 347 klaster (kab/kota x penyakit), 6.579 kasus, 18 kematian, respons 24 jam 691/736; EBS KLB/klaster tidak lazim 469 laporan; 1,9 s.
- Master Penyakit: PUT kategori ZOONOSIS+PIE tersimpan, kode tidak dikenal -> 400, dikembalikan ke ZOONOSIS.
- Halaman HTTP 200 tanpa error: /main-dashboard, /dasbor/kategori/zoonosis, /dasbor/kategori/tular-vektor, /laboratorium, /klaster, /master/penyakit, /master/provinsi, /master/kabupaten, /master/puskesmas, /master/rumah-sakit.

## Terbuka
- GHPR (EBS 41.802 laporan, Alert 60.296) belum dipetakan ke Rabies / Zoonosis -> angka Zoonosis rendah. Perlu keputusan: map ke RABIES atau tambah penyakit GHPR di master.
- Diagnosa tanpa padanan master (Diare Akut, Suspek Mumps, ILI, Pneumonia, ISPA, Varicella, Disentri, Jaundice, Tetanus, Meningitis, Kolera, Hepatitis A, dll.) belum masuk kategori mana pun -> usul tambah ke master penyakit lalu ke kategori (Tular Makanan & Air, Menular Langsung, PD3I).
- Arti `klb = 2` di Alert SKDR (8.451 baris) belum diketahui; sekarang hanya `1` dihitung KLB (config `klb_values`).
- Peta titik klaster belum ada (data lat/lng sudah dikirim API klaster).
- Alert SKDR 2025 belum di-backfill (baru 2026 M1-M41).

## Tahap 2 (2026-10-22 ~20:35–20:45 WIB; persetujuan Yosua 20:33 WIB diteruskan oleh agen induk)
- Hapus data form di DB utama: backup `backups/pre_hapus_form_20261022_2034.dump` (206.972.891 byte) + schema `backup_pr021`. Sebelum?sesudah: pe_case_events 323?0, pe_cases 80?0, pe_clusters 9?0, pe_counters 5?0, case_reports 21?0. ebs_reports tetap 150.781. Rollback: `database/manual/pr021_hapus_data_form_rollback.sql`.
- Migrasi 044 `penyakit_skdr_tambahan` (+ rollback/044): 21 penyakit baru, peta kategori, alias diagnosa EBS (GHPR?RABIES/Zoonosis), peta kode Alert SKDR. Kecocokan penyakit: EBS 42,30%?99,62% (150.208/150.781; sisa: diagnosa kosong 323, "Penyakit lain-lain" 250), Alert 43,22%?100% (515.626).
- Migrasi 045 `nav_sembunyikan_lab_klaster` (+ rollback/045): mod_laboratorium & mod_klaster enabled=false; halaman /laboratorium & /klaster tetap ada.
- Seksi Laboratorium & Klaster masuk Dasbor Utama (`components/dashboard/LabSection.tsx`, `KlasterSection.tsx`), di bagian paling bawah setelah Ringkasan Eksekutif; ikut filter dasbor termasuk kategori, jadi tampil juga di /dasbor/kategori/[kode].

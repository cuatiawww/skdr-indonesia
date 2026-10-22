# PR 019 — Master Fasyankes (Puskesmas & Rumah Sakit) dari SATUSEHAT + Filter Unit Pelapor

Status: **belum di-push** (satu batch belum di-commit bersama PR 018)

## Sumber data
- Koleksi Postman "Master Data API - APIGEE (v2.0) (PUBLIC)", folder **STAGING**.
- Token: `POST {auth}/accesstoken?grant_type=client_credentials`, body form `client_id`, `client_secret`. Token berlaku ±4 jam (`expires_in` 14399 detik). API product: `api-sandbox`, sehingga **hanya staging** yang dapat dipakai; panggilan produksi ditolak 401.
- Endpoint: `GET {base}/masterdata/v1/mastersaranaindex/mastersarana`.
  - Parameter: `jenis_sarana` (102 = Puskesmas, 104 = Rumah Sakit), `kode_provinsi`, `kode_kabkota`, `kode_kecamatan`, `nama`, `status_aktif`, `kode_satusehat`, `kode_sarana`, `limit`, `page`, `lower_bound_updated_at`/`upper_bound_updated_at`.
  - Respons memuat `total_page`.
  - Tidak ada header batas laju (rate limit). Satu panggilan memakan ±1–2 detik; sinkronisasi memberi jeda 250 ms antarhalaman.
- Kredensial disimpan di `.env` proyek sebagai `SATUSEHAT_CLIENT_ID` dan `SATUSEHAT_CLIENT_SECRET` (gitignored, tidak di-commit). Nilainya diambil dari variabel koleksi.

## Basis data (migrasi dengan rollback)
- `035_master_fasyankes`:
  - Tabel `master_fasyankes`: kode SATUSEHAT/sarana, nama, jenis/subjenis/kelas, wilayah (prov/kab/kec, dipetakan ke `master_locations`/`master_kabkota` berdasarkan kode), alamat, lat/lon, status, `sumber`, `synced_at`, serta kolom `nama_norm` (generated).
  - Tabel `fasyankes_sync_log`.
  - Setelan `app_settings.fasyankes_sync`: URL, path, daftar jenis, `page_limit`, `delay_ms`, `timeout_secs`, `max_retries`, `provinces`. Tidak ada nilai yang di-hardcode.
  - Fungsi `skdr_unit_ok(text)`.
  - View `surveillance_reports` mendapat kolom `unit_name`.
- `036_nav_master_fasyankes`: menambah grup menu "Master Data" (Puskesmas, Rumah Sakit). Rollback mengembalikan menu dari tabel cadangan.

## Backend (`fasyankes.rs`)
- `POST /api/v1/admin/fasyankes/sync`: dipicu manual dan berjalan di latar belakang, dengan satu proses pada satu waktu.
  - Body: `{jenis, provinces, max_pages}`.
  - Upsert idempoten pada `kode_satusehat`; ada percobaan ulang saat gagal; setiap proses dicatat di log.
  - Proses yang terputus karena backend dimulai ulang ditandai `terputus`.
- `GET /api/v1/admin/fasyankes/status`: jumlah per jenis, log, dan status kredensial (tanpa nilai).
- `GET /api/v1/master/fasyankes?jenis=&province_id=&kabkota_id=&q=&page=&limit=`.
- `GET /api/v1/filters/units?province_id=&kabkota_id=`: pilihan Unit pelapor dari EBS `unit` dan PE `unit_pelapor`, mengikuti Provinsi/Kab-Kota, dengan penanda `in_master`.
- Parameter `unit` (dipisah `|`) berlaku pada semua endpoint `dashboard::resolve`: analytics, executive, public-dashboard, NAR, dan signals. Filter diterapkan lewat `skdr_unit_ok`.

## Frontend
- Halaman `/master/puskesmas` dan `/master/rumah-sakit` (komponen bersama `FasyankesPage`):
  - gaya `.skdr-table-card`, kotak cari, filter Provinsi/Kab-Kota, dan paginasi
  - ringkasan jumlah tersimpan dan sinkronisasi terakhir
  - tombol "Sinkronkan dari SATUSEHAT"
- Filter global "Unit pelapor" (multi-pilih, dikelompokkan per jenis unit) mengikuti Provinsi/Kab-Kota. Disimpan di URL `?unit=a|b` dan di sesi; tombol reset mengosongkannya.

## Celah join (penting)
- EBS hanya menyimpan nama unit (`unit`, teks bebas; 5.981 nilai berbeda; 1.561 kosong) dan jenis unit (`kel_unit`). **Tidak ada kode fasyankes.**
- PE: `data->>'unit_pelapor'` hanya terisi pada 29 dari 80 kasus, dan semuanya data uji.
- Formulir `case_reports` tidak memiliki unit, sehingga dikeluarkan dari hasil saat filter unit aktif.
- Karena itu, filter bekerja pada **nama unit sebagaimana tercatat**. Kecocokan nama dengan master SATUSEHAT hanya menjadi penanda (`in_master`), bukan kunci join.
- Join berbasis kode memerlukan kode SATUSEHAT/kode sarana pada umpan EBS dan formulir PE.

## Uji
- tsc OK
- cargo test fasyankes 3/3, privacy 13/13
- Playwright 1440/390 dengan 0 error konsol; tangkapan layar `after13-fasyankes-*.png`

## Pembaruan 22-10-2026
- Teks antarmuka halaman Master Puskesmas/Rumah Sakit tidak lagi menyebut lingkungan teknis (staging/sandbox/hanya baca). Subjudul kini berupa deskripsi umum:
  - "Daftar Puskesmas di Indonesia bersumber dari data master fasilitas pelayanan kesehatan SATUSEHAT Kementerian Kesehatan, diperbarui melalui sinkronisasi berkala."
  - Kalimat yang setara untuk rumah sakit.
- Pesan log untuk proses yang terputus diubah menjadi "Proses terhenti sebelum selesai".
- Setelan `fasyankes_sync.environment` tetap ada sebagai konfigurasi internal dan tidak ditampilkan di UI.
- Gambar header dan Beranda mengikuti versi Yosua (`header.jpg`, `home.jpg`; latar Beranda digambar di `app/page.tsx`). Referensi `header-bg.jpg`/`home-bg.webp` sudah tidak ada.
- Pengujian: Playwright 1440/390 (Beranda, Dasbor, Penyakit, Master Puskesmas, Master Rumah Sakit) dengan 0 error konsol dan 0 respons gagal; tangkapan layar `after14-*.png`.

## Pembaruan 22-10-2026 (menu Master Data lengkap)
- Grup sidebar "Master Data" kini berisi, berurutan: Provinsi (`/master/provinsi`, ikon Globe2), Kabupaten/Kota (`/master/kabupaten`, MapPin), Penyakit (`/master/penyakit`, Stethoscope), Puskesmas, Rumah Sakit. Menu tetap dari registri navigasi di DB (`app_settings.navigation_menu`), tanpa hardcode.
- Migrasi `037_nav_master_wilayah_penyakit` (rollback `rollback/037_rollback.sql`, dari tabel cadangan `app_settings_bak_037`).
- Riwayat: ketiga halaman pernah ada di menu lewat migrasi 011 (grup "MASTER DATA" → submenu "Master Data"). Migrasi 028 menulis ulang seluruh menu dan sengaja mengeluarkan grup itu ("rutenya tetap ada"); 029 hanya mengganti nama grup Bantuan; 036 menambah grup baru `grp_master` yang hanya berisi Puskesmas dan Rumah Sakit.
- Tidak ada menu lain yang menautkan ketiga halaman ini. "Penyakit" di grup Dasbor menuju `/penyakit` (dasbor penyakit), bukan halaman master, jadi bukan duplikat.
- Pengujian: kelima rute HTTP 200; tsc OK; Playwright 1440 di 5 halaman master dengan 0 error konsol dan 0 respons gagal, item aktif sesuai halaman; tangkapan layar `after15-master-menu.png`.

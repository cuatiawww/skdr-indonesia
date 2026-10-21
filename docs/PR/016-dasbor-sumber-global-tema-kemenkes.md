# PR 016 — Dasbor: filter Sumber global, tema Kemenkes, halaman penyakit editorial, skeleton, kinerja, tanpa data palsu

## Tujuan
Dasbor dan halaman penyakit dibaca dengan satu filter di atas halaman, warna Kemenkes, dan angka yang jujur:
EBS dan Kasus PE tampil bersama secara default (Sumber = Semua), dibedakan hanya dengan warna + legenda, dan tidak pernah dijumlahkan diam-diam.

## Perubahan

### 1. Satu filter Sumber per halaman
- `lib/use-sumber.ts` (baru): filter `?sumber=ebs|pe` (kosong = Semua) dan `?ukuran=kasus` (kosong = Alert) disimpan di URL; tautan lama `?source=` tetap diterima.
- `components/analytics/SourceBadge.tsx`: badge EBS/PE per seksi dihapus. Sekarang berisi `SourceFilter`, `UkuranFilter`, `SourceKey` (EBS lingkaran oranye, Kasus PE belah ketupat teal), `Panel`, `Section`, `Empty`, dan `MutedNote`.
- `components/SkdrFilterBar.tsx`: pilihan sumber dihapus dari bar filter. Satu-satunya pilihan sumber ada di kepala halaman.
- `app/main-dashboard/page.tsx` dan `components/dashboard/ExecutiveSummary.tsx`: seluruh dasbor mengikuti satu filter.
  - KPI EBS, KPI Kasus PE, kematian per sumber, dan provinsi per sumber.
  - Tabel penyakit dari registri DB (`components/dashboard/DiseaseTable.tsx` baru): sparkline, Δ 4 minggu, tautan ke `/penyakit/[kode]`, dan "Belum ada form PE".
- `components/analytics/TrendHeatmap.tsx`: pada Semua, EBS dan Kasus PE memakai sumbu masing-masing. Sel heatmap dibelah (atas EBS, bawah PE). Semua select per seksi dihapus.
- Peta (`AseanMap.tsx`, `SpatialOutbreakMap.tsx`):
  - Penanda dipisah per sumber: EBS lingkaran oranye, PE belah ketupat teal.
  - Legenda ada di kiri bawah.
  - Popup wilayah menampilkan EBS dan Kasus PE berdampingan.
  - Koroplet pada Semua diberi label "sinyal EBS + kasus PE".
- Backend:
  - `GET /api/v1/analytics/summary` (baru, `analytics.rs`).
  - `dashboard.rs` mengelompokkan penanda per (lokasi, penyakit, sumber), sehingga EBS dan PE tidak pernah digabung.

### 2. Tema Kemenkes
- Palet diambil dari `public/Logo-Kemenkes.png`: teal #06B8A5, cyan #05BBCC, lime #D7DF21.
- Skala `brand-50…900`, dengan primary = `brand-700` (#047A6F).
- Warna sumber: EBS #E8710A, PE #0A8FA3.
- Token pusat:
  - Variabel CSS di `app/globals.css`.
  - `tailwind.config.ts`: `blue`/`sky` dipetakan ke brand.
  - `lib/theme.ts`.
  - DB `app_settings.theme_palette` dan `dashboard_sources` (migrasi 024), diterapkan saat runtime oleh `settings-context`.
- Hex biru yang tertanam di 30 file diganti dengan token. `app/icon.svg` memakai #06B8A5.

### 3. Halaman `/penyakit/[kode]` editorial
- Susunan: eyebrow huruf besar dengan garis tipis, judul besar dengan chip kategori, lalu prosa deskripsi/gejala/penularan dalam kolom.
- Berikutnya bar filter tunggal (Sumber, ukuran, periode, provinsi, kab/kota), lalu dua kotak berbingkai (Kode/register dan Statistik utama).
- Tren dan sebaran wilayah lebar penuh tanpa bingkai.
- Catatan abu-abu satu baris muncul bila suatu sumber tidak punya data.

### 4. Skeleton loading
- `components/ui/Skeleton.tsx` (baru): `Skeleton`, `SkeletonKpiRow`, `SkeletonChart`, `SkeletonMap`, `SkeletonTable`, `SkeletonCards`, `SkeletonDashboard`, `SkeletonDetail`, dan `ErrorState` (dengan tombol "Coba lagi").
- Animasi shimmer memakai `brand-50/100`, dan mati pada `prefers-reduced-motion`.
- Teks "Memuat…" dan spinner pemuatan diganti skeleton di:
  - dasbor (peta, KPI, tren, tabel)
  - `/penyakit`, `/penyakit/[kode]`
  - tabel master (`MasterUi.TableState`), `/dokumentasi`, editor form PE
  - panel artikel terkait
- Spinner pada tombol aksi (Perbarui, Simpan, Sinkron EBS, Terapkan) tetap ada, karena itu umpan balik tombol, bukan status muat.
- Galat kini tampil sebagai `ErrorState` + "Coba lagi" di dasbor, ExecutiveSummary, tabel penyakit, TrendHeatmap, `/penyakit`, dan `/penyakit/[kode]`. Sebelumnya, galat `summary` membuat tabel penyakit "Memuat…" selamanya.

### 5. Kinerja
Latensi diukur dengan curl ke backend lokal, median 5×, dalam ms. Angka "sesudah (tanpa cache)" memakai query unik agar cache terlewati.

| Endpoint | Sebelum | Sesudah (tanpa cache) | Sesudah (cache) |
|---|---|---|---|
| `/public-dashboard` (Semua) | 1481 | 631 | 2 |
| `/public-dashboard?source=ebs` | 1440 | 460 | 1 |
| `/public-dashboard?source=pe` | 92 | 30 | 1 |
| `/kpi-snapshot` | 345 | 186 | 1 |
| `/dashboard/executive` | 660 | 460 | 1 |
| `/analytics/overview` | 76 | 4 | 1 |
| `/analytics/summary` | 311 | 7 | 1 |
| `/analytics/diseases` | 8 | 5 | 1 |
| `/analytics/diseases/ANTHRAX` | 332 | 7 | 1 |
| `/analytics/diseases/DENGUE` | 305 | 7 | 1 |

Ukuran respons identik sebelum dan sesudah, jadi hasil query tidak berubah.

- **Indeks (migrasi 025):** `idx_ebs_reports_dash_cover` adalah indeks penutup ±20 MB pada `COALESCE(tgl_laporan, create_date::date) DESC`, dengan INCLUDE kolom yang dibaca view `surveillance_reports` dan `analytics.rs`.
  - Postgres kini memakai Index Only Scan dan tidak lagi membaca heap 670 MB.
  - Contoh: agregat berfilter periode 127 → 7 ms; feed terbaru (ORDER BY tanggal) 89 → 29 ms.
  - Ditambah `idx_pe_cases_disease_active`.
- **Paralel:** `public_dashboard` sebelumnya menjalankan 8 query berurutan pada satu koneksi. Kini query dijalankan paralel (`tokio::try_join!`, masing-masing dengan koneksi pool sendiri).
- **Cache server singkat** (`src/cache.rs`, middleware axum):
  - TTL dan prefix dibaca dari `app_settings.api_cache` (migrasi 025: 30 detik untuk public-dashboard, kpi-snapshot, dashboard/executive, analytics/*).
  - Setiap request non-GET (tulis) mengosongkan cache.
  - Header `x-skdr-cache: HIT|MISS`.
  - `ttl_seconds: 0` mematikan cache.
- **Frontend:**
  - Pemanggilan `kpi-snapshot` ganda saat muat dihapus (public-dashboard sudah membawa KPI yang sama).
  - Halaman tidak lagi diblok penuh menunggu public-dashboard. Header, filter, ExecutiveSummary, ringkasan, dan tren mulai mengambil data bersamaan; hanya peta yang menunggu (dengan skeleton).
  - Mengubah isian bar filter tidak lagi memicu fetch. Hanya "Terapkan" (filter `applied`) yang memicu, sehingga fetch ganda pada Terapkan juga hilang.
  - Pencarian `/penyakit` difilter di klien (tanpa fetch).
- Belum dikerjakan: payload `locations` (1000 penanda ±900 KB) dan `signal_feed` (200 baris ±230 KB) masih besar. Disarankan memangkas field per penanda dan memakai paginasi server. Kueri `executive` masih ±460 ms karena pencocokan teks diagnosa.

### 6. Audit data dummy/mock/fallback

| File | Perilaku sebelumnya | Pengganti |
|---|---|---|
| `app/api/gfs/route.ts` (`fallbackWind`) | Bila feed GFS gagal, mengirim grid angin sintetis (rumus sinus/kosinus) seolah data nyata | Dihapus; route menjawab 503 `gfs_unavailable` dan lapisan angin tidak digambar |
| `components/dashboard/ExecutiveSummary.tsx` | Galat `/analytics/summary` → `setSm(null)` → tabel penyakit "Memuat…" selamanya (kegagalan disembunyikan) | `ErrorState` + Coba lagi |
| `ExecutiveSummary`, `TrendHeatmap`, `/penyakit`, `/penyakit/[kode]`, dasbor | Kotak merah tanpa jalan pulih / teks memuat | `ErrorState` + Coba lagi, skeleton saat memuat; data kosong → `Empty`/`MutedNote` |
| `app/main-dashboard/page.tsx` | `kpis.locations ?? 0` ditampilkan sebagai "0 lokasi" saat data belum datang | Badge lingkup hanya tampil bila data sudah ada |
| `components/AseanMap.tsx` | Tombol "View Region Details" berbahasa Inggris di UI id | Teks id/en |

Ditinjau dan dibiarkan karena bukan data palsu:
- `lib/epi-week.ts`: menghitung minggu epid lokal bila backend mati, dengan rumus MMWR yang sama.
- `lib/api.ts` `exportDataset`: endpoint alternatif ke layanan NLP, data nyata.
- Default UI: wilayah awal peta, daftar region penerbangan, `settings-context` branding SSR.
- `.catch(() => {})` pada daftar provinsi/kab-kota: dropdown kosong, bukan data palsu.
- Backend Rust: tidak ditemukan mock/sample/demo. `unwrap_or(json!([]))` hanya untuk JSON konfigurasi yang rusak.

Baris DB yang tampak sebagai data uji. Hanya ditandai, tidak dihapus:
- `pe_cases`: 78 dari 80 baris (66 aktif) memiliki `patient_name` berisi "UJI". ID 1–80, dibuat 2026-10-21, kemungkinan dari `pe_api_test`/`pe_crud_test`/smoke. Baris ini ikut dihitung sebagai Kasus PE di dasbor (mis. 29 Kasus PE).
- `case_reports` (sumber lama 'form'): 21 baris, semua dengan `notes` berisi "test", masing-masing 7 kasus, 2026-10-21.
- Seed master (`008`, `013`) adalah data referensi, bukan demo.

## Migrasi
- `024_theme_kemenkes_sumber_global.sql`: `theme_palette`, `dashboard_sources` (backup `app_settings_bak_024`). Rollback: `database/rollback/024_rollback.sql`.
- `025_kinerja_indeks_cache.sql`: dua indeks + `api_cache` (backup `app_settings_bak_025`). Rollback: `database/rollback/025_rollback.sql`.
  - Produksi: migrasi berjalan dalam transaksi, jadi `CREATE INDEX` mengunci tulis `ebs_reports` selama pembuatan. Lokal butuh ±2 detik.
  - Untuk prod sebaiknya jalankan dulu `CREATE INDEX CONCURRENTLY` dengan definisi yang sama; migrasi kemudian menjadi no-op.
- Backup sebelum migrasi: `backups/pre_pr016_20261021_185125.sql` (gitignored, tidak di-commit).

## Uji
- `tsc --noEmit` exit 0 (container `skdr-frontend-next`).
- Backend dibangun ulang dan berjalan. Migrasi 025 diterapkan otomatis, dengan log "api cache: ttl 30s, 4 prefixes".
- Playwright 1440×900 pada dasbor Semua/EBS/PE (+ klik peta), `/penyakit`, `/penyakit/anthrax` (Semua & PE), dan `/penyakit/dengue`:
  - 0 console error, 0 badge sumber per seksi.
  - Teks "Memuat" tidak tersisa.
- Skeleton (API ditahan 15 detik): dasbor 6, detail 5, dan daftar 8 elemen skeleton.
- Galat 500 yang disimulasikan menampilkan `error-state` + tombol `retry`.
- Tangkapan layar: `/workspace/pr016-screenshots/` (before-*, after-*, skeleton-*, error-penyakit).

## Pertanyaan terbuka
- Sheet "Spesifikasi Dashboard Executive", aturan umum (1), menyatakan angka EBS dan laporan individu tidak dijumlahkan. Koroplet pada Semua saat ini memakai "sinyal EBS + kasus PE" (diberi label). Pilihannya: diterima, atau diganti dua koroplet / pilihan dominan?
- Data EBS lokal berhenti sekitar Mei 2026, sehingga tren EBS kosong sesudahnya. Perlu dicek apakah sinkronisasi EBS berjalan.
- Sumber lama 'form' (`case_reports`, semuanya baris uji) masih masuk view dan tampil sebagai penanda default. Pilihannya: disembunyikan, atau dihapus setelah izin?
- Baris uji "UJI" di `pe_cases`: pilihannya dihapus (dengan izin dan backup), atau difilter?
- Sheet No. 11 meminta HEX resmi dari master logo Kemenkes. Saat ini warna diambil dari `Logo-Kemenkes.png`, dan perlu konfirmasi.
- Chip penyakit pada grafik tren mode satu sumber masih menjadi toggle legenda.


## 7. Tambahan (arahan lanjutan)

- **KPI**: angka utama + sub-label, chip delta "24 jam terakhir vs 24 jam sebelumnya" (merah naik, hijau turun, abu-abu tetap; "—" bila tidak ada data pembanding), sparkline per sumber yang mengikuti seluruh filter global (harian bila periode < 8 minggu, mingguan bila lebih). Tidak ada jendela 30/14 hari tersendiri. Kartu dua metrik (Kematian, Provinsi) memakai dua kolom kecil.
- **Garis sparkline datar di nol**: penyebabnya data, bukan bucket. Data EBS lokal berakhir 2026-04-09 (create_date maksimum 2026-04-09 16:28, padahal synced_at hari ini). Kartu menampilkan "data s.d. <tanggal>".
- **Peta**: hanya satu lapisan poligon berisi (slate, opasitas 0,25–0,45). Lapisan lain hanya garis tipis. Marker EBS/PE diberi halo dan berada di atas (zIndex 40; sebelumnya 0, di bawah poligon).
- **Kinerja 7-1-7**: satu bagian berisi 3 kartu (Deteksi ≤7, Notifikasi ≤1, Respons ≤7) dengan %, median, n/N, warna ambang (026, dari pengaturan) dan penjelasan. "Lihat detail" membuka rincian per penyakit di ketiga kartu sekaligus. Notifikasi = create_date − tgl_laporan ≤ 1 hari, tanpa alert discarded. Deteksi/Respons: "Data belum tersedia" karena A.11, B.7, B.20/B.28/B.30/B.34/B.37/B.39 tidak ada di feed EBS.
- **Bar filter**: satu baris grid, tinggi kontrol sama (h-10), tanpa teks bantu di bawah field (dipindah ke tooltip). Sumber ada di dalam bar, Awal/Akhir digabung menjadi "Periode (Minggu Epi)", Terapkan + reset di kanan. Komponen yang sama dipakai di dasbor dan /penyakit/[kode].
- **/penyakit/[kode]**: lebar penuh (px-4 sm:px-6 lg:px-8). Toggle Alert/Kasus dan pilihan "52 minggu" dihapus. Periode mengikuti Minggu Epi di URL.
- **Beranda (/)**: hero (eyebrow, judul, pencarian penyakit/wilayah, CTA), panel "Rilis data terkini" (4 ubin + sparkline, laporan terbaru, catatan kaki "nilai kosong bukan berarti nol"), pita "Tinjauan Situasi · Perhatian Saat Ini", "Mulai Menjelajah" (01–04, footer hitungan nyata; 03 = Dokumentasi Data karena belum ada fitur unduh), "Provinsi dengan Cakupan Tertinggi" dan "Penyakit Utama". Sumber data: /api/v1/analytics/home + /latest + /summary (semuanya ter-cache lewat prefix analytics/). Redirect `/` dan `/tv` di next.config.mjs dihapus.
- **MODE TV**: /tv menampilkan halaman "Sedang Dalam Pengembangan" dengan tombol kembali ke Dasbor. Kode TV yang ada tidak diubah.
- **Migrasi 026_t717_ambang**: ambang hijau 80 / kuning 60 dan batas notifikasi 1 hari disimpan di app_settings.dashboard_executive.t717. Rollback: rollback/026_rollback.sql.

### Catatan terbuka tambahan
- Kategori penyakit di master_diseases masih berbahasa Inggris (mis. "Viral / Mosquito-borne").
- Notifikasi 7-1-7 tercatat 100% (median 0 hari, n = 42.427) karena tgl_laporan dan create_date pada data EBS hampir selalu sama. Perlu dikonfirmasi apakah tgl_laporan diisi otomatis.
- Tidak ada halaman login/redirect pascamasuk di frontend SKDR. Akar `/` (basePath) sekarang langsung membuka Beranda.


## 8. Penyesuaian akhir (disetujui pengguna)

- **Kartu "Status laporan PE" dan "Cakupan wilayah pelapor" dihapus.** Keduanya tidak diminta di sheet: No. 17 meminta status kasus, bukan status alur formulir; No. 9 hanya satu kalimat header. Query backend yang hanya dipakai kartu itu ikut dihapus dari exec_dash.rs (pe_status, coverage, nik), begitu juga key locale yang tidak terpakai. Grid kartu itu dihapus seluruhnya, sehingga tidak ada celah kosong; bagian sesudah Kinerja 7-1-7 langsung tersambung.
- **Sheet No. 17**: setiap baris penyakit di tabel penyakit kini menampilkan pecahan Kasus PE menurut status kasus terakhir (COALESCE(classification_override, classification)). Daftar dan label status diambil dari registri `app_settings.dashboard_executive.groups[].pe_status`, bukan ditulis di kode. Laporan tanpa status atau dengan status di luar daftar ditampilkan sebagai "Belum diklasifikasi". Data dikirim lewat `analytics/summary` → `diseases[].pe.status`.
  - Catatan: registri Leptospirosis dan AI memuat juga "Probabel" (kode `probable`), padahal sheet menulis Leptospirosis = suspek, konfirmasi. Registri Rabies memuat GHPR. Perlu dikonfirmasi; konfigurasi tidak diubah.
- **Sheet No. 9**: kalimat header "Menampilkan X laporan individu dan Y alert EBS · tanggal (M awal/tahun – M akhir/tahun) · wilayah · penyakit" mengikuti filter global dan Sumber.
- **Sheet No. 76 (NIK)**: bagian Integrasi NAR-SKDR belum ada di dasbor, sehingga kotak kelengkapan NIK dihapus dari dasbor, termasuk kartu KPI NIK pada mode PE. Mode PE kini menampilkan kartu "Kasus PE terverifikasi". NIK akan ditampilkan lagi saat bagian NAR-SKDR dibuat.
- **KPI**: baris kartu memakai `auto-rows-fr`, sehingga semua kartu sama tinggi di 1280/1440 pada mode Semua.

- **Migrasi 027_lepto_status_kasus** (disetujui pengguna, mengikuti sheet No. 17): kode `probable` dihapus dari `dashboard_executive.groups[code=lepto].pe_status`, sehingga status Leptospirosis tinggal Suspek dan Konfirmasi. Data pe_cases tidak diubah. Laporan Leptospirosis berstatus probable saat ini berjumlah 0, sehingga tidak ada yang tampil sebagai "Belum diklasifikasi". CFR dan Rabies/GHPR tidak diubah. Backup tabel app_settings_bak_027 dan pg_dump app_settings dibuat sebelum migrasi. Rollback: rollback/027_rollback.sql.

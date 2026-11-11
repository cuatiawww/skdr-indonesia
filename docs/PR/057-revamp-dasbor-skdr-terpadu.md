# PR 057: Revamp Dasbor SKDR Terpadu (Penyatuan 12 Sub-Dasbor & Dasbor Utama)

## Latar Belakang & Ringkasan Perubahan
Berdasarkan hasil eksplorasi mendalam dan reverse engineering terhadap sistem aktif SKDR Kemenkes RI (`https://skdr.kemkes.go.id`), sistem lama memiliki fragmentasi antarmuka antara "Dashboard" (Dashboard 1) dan "Dashboard 2" yang memuat 12 sub-menu terpisah (`Tren`, `Distribusi`, `Buletin SKDR`, `Tren Penyakit IBS SKDR`, `Tren CDS Penyakit IBS SKDR`, `ANALISA DETEKSI OUTBREAK`, `After Action Review (AAR)`, `JEE/IHR Kapasitas Surveilans`, `INFOGRAFIS SKDR`, `WHO 7-1-7 Framework`, `Analisa EBS Lanjutan`, dan `SKDR - HOTSPOT - ISPA`).

Sesuai arahan pengguna, arsitektur dasbor dirombak secara menyeluruh menjadi **1 Dasbor SKDR Terpadu** yang dinamis, menghilangkan dikotomi "Dashboard 1 vs Dashboard 2", namun menyatukan seluruh 12 kapabilitas analitis tersebut ke dalam 6 sub-menu terstruktur di bawah menu induk `Dasbor SKDR` (`mod_main_dashboard`) pada grup sidebar `DASBOR`, dengan styling modern Tailwind CSS yang konsisten dengan desain sistem aplikasi:

1. **Ringkasan Utama (IBS & EBS)** (`/dashboard/skdr/ringkasan` & `/main-dashboard`):
   - Sintesis eksekutif nasional: beban kasus mingguan IBS, sinyal EBS, respon verifikasi ≤24 jam (%), pemantauan kepatuhan kelengkapan & ketepatan pelaporan faskes (target minimal ≥80%), status verifikasi alert (Stacked bar), Top 10 alert penyakit, dan Peta Spasial Klaster Nasional (OpenLayers).
2. **Tren Penyakit (IBS)** (`/dashboard/skdr/tren`):
   - Kurva tren mingguan 1–52 per penyakit indikator (pilihan 36 penyakit potensi KLB), garis ambang batas alert ($\text{Mean} + 2\text{SD}$ baseline), komparasi multi-tahun (2024–2026), komparasi multi-wilayah (komparasi hingga 3 provinsi/kabupaten), lapisan iklim Copernicus ERA5 (suhu, curah hujan, kelembapan), serta tabel rekapitulasi mingguan. (Blok kartu narasi AI dilepas sesuai permintaan untuk menjaga kerapian tata letak).
3. **Distribusi & Demografi** (`/dashboard/skdr/distribusi`):
   - Distribusi epidemiologi menurut orang (piramida golongan umur `<1 th`, `1–4 th`, `5–14 th`, `15–44 th`, `≥45 th` dan rasio gender L/P), komposisi tipe unit pelapor (Puskesmas, RS, Klinik, Lab), serta tabel peringkat Top 10 wilayah beban kasus & attack rate per 100.000 penduduk.
4. **WHO 7-1-7 & Kinerja EBS** (`/dashboard/skdr/717`):
   - Pengukuran ketepatan respon standar global WHO: Deteksi $\le 7$ hari (T1), Notifikasi $\le 1$ hari (T2), Respon awal TGC $\le 7$ hari (T3), corong kualitas sinyal (Signal Quality Funnel & konversi rumor ke KLB), sebaran sumber sinyal, dan log After Action Review (AAR) pasca-KLB.
5. **Deteksi Outbreak & Iklim** (`/dashboard/skdr/deteksi`):
   - Engine deteksi dini wabah berbasis algoritma statistik: EARS C1, EARS C2 (standar CDC/WHO), EARS C3, dan Farrington Quasi-Poisson dengan matriks anomali deviasi C-Score; korelasi titik panas kebakaran hutan/lahan (NASA FIRMS) vs lonjakan kunjungan ISPA dengan lag waktu (+0, +1, +2 minggu); serta spider radar plot kapasitas surveilans IHR (2005) & JEE (skor 1–5).
6. **Buletin & Infografis** (`/dashboard/skdr/buletin`):
   - Generator buletin surveilans epidemiologi mingguan otomatis berskala nasional/provinsi siap cetak/ekspor PDF & Word (.docx), serta poster infografis digital 1-halaman siap unduh PNG untuk diseminasi ke publik dan pimpinan.

## Revisi UX Sesuai Feedback Pengguna
1. **Auto Layout & Perbaikan Overflow Panel Filter**:
   - Memperbaiki masalah elemen select yang memotong batas kartu dan memicu scrollbar horizontal pada panel samping (seperti terlihat pada screenshot). Semua input/select kini menggunakan `w-full max-w-full truncate box-border` dan kontainer menggunakan `overflow-x-hidden` dengan tata letak fleksibel otomatis.
2. **Penyederhanaan Label Pilar**:
   - Label filter disederhanakan murni menjadi `Semua`, `IBS`, dan `EBS` tanpa embel-embel `(Rutin)` atau `(Sinyal)`.
3. **Pelepasan Kartu Narasi Ekstra**:
   - Melepas blok kartu naratif *"Interpretasi Epidemiologi Otomatis SKDR"* pada kurva tren penyakit agar tidak memakan ruang section, sehingga visualisasi grafik dan data table tampil lebih luas dan fokus.
4. **Tombol "Terapkan Filter" (Draft State)**:
   - Filtering tidak lagi otomatis terpicu di setiap klik input. Panel filter kini memiliki state lokal (*draft*) dengan tombol utama **"Terapkan Filter"** bertanda badge perubahan; data dasbor baru direfresh setelah tombol ditekan.
5. **Sentralisasi Filter Dinamis (Pembersihan Kontrol di Kartu)**:
   - Melepas dropdown/kontrol ganda di dalam kartu (dropdown ganti penyakit, tipe grafik, dan lag) dan memindahkannya seluruhnya ke dalam panel filter samping dinamis. Kartu di sisi konten kini murni menampilkan data visual, kurva, dan tabel tanpa gangguan elemen input ganda.
6. **Peta Spasial Full 1 Section & Pelepasan Status Respon Sinyal**:
   - Bagian Peta Spasial Klaster Surveilans Nasional pada sub-view Ringkasan Utama (`SkdrRingkasanView.tsx`) diubah menjadi lebar penuh 1 section (100% width, tinggi `min-h-[600px]`), bukan lagi terbagi 2 kolom (`grid-cols-12` 8:4).
   - Kartu *"MANAJEMEN ALERT - Status Respon Sinyal SKDR"* yang sebelumnya berada di sisi kanan peta dilepas seluruhnya sesuai instruksi pengguna, memberikan ruang maksimal bagi peta klaster fasyankes OpenLayers dan kontrol lapisan spasialnya.
7. **Penyelarasan Peta Spasial (Epiweek Replay Player & Penyatuan Tata Letak)**:
   - Mengintegrasikan engine peta `SpasialMap` ke dalam `SkdrRingkasanView.tsx` dengan tetap mempertahankan panel filter samping Dasbor SKDR:
     - **Epiweek Play / Replay Slider**: Bilah putar ulang melayang (*floating playback bar*) di bawah peta dengan tombol Play/Pause dan slider minggu epid 1–52 animasi berkala 1,3 detik per minggu.
     - **Bilah Metrik Cepat**: Tombol pill metrik (*Kasus*, *Alert/Sinyal*, *KLB*, *CFR*, *Kematian*) di header seksi peta untuk pengubahan choropleth instan.
     - **Konsistensi Hierarki Wilayah**: Aksi drilldown (`onDrill`) pada provinsi di peta langsung menyelaraskan filter global Dasbor SKDR, dan tombol `Kembali` (`onUp`) menavigasi kembali ke tingkat nasional.
8. **Penyelarasan Tata Letak Peta Spasial (Peta 1 Section Penuh dengan Dock Kiri API Intelijen + Dock Kanan Manajemen Alert Murni Tanpa Tab Analisa)**:
   - Sesuai arahan pengguna agar seksi peta tampil 1 section penuh utuh (100% width) tanpa terbagi menjadi dua kartu terpisah di grid kolom:
     - **Dock Kiri Peta (API Terintegrasi & Filter Cepat)**: Panel lipat (*collapsible drawer*, `w-[260px]` / `w-10`) di sisi kiri kanvas peta yang memuat integrasi 5 API eksternal (Penerbangan Domestik, NASA FIRMS Karhutla, BNPB InaRISK, Satwa Liar GBIF, Vektor iNaturalist) serta filter unit fasyankes dan status laporan.
     - **Bawah Peta (Epiweek Replay Player)**: Bilah putar ulang melayang (*floating playback bar*) dengan tombol Play/Pause dan slider scrubber minggu epid 1–52.
     - **Dock Kanan Peta (Manajemen Alert Murni)**: Panel lipat (*collapsible drawer*, `w-[320px]` / `w-10`) di sisi kanan kanvas peta khusus menampilkan *"MANAJEMEN ALERT - Status Respon Sinyal SKDR"* (Terverifikasi $\le$24 Jam, TGC, Sinyal Baru, Discarded, Standar Kemenkes 24 Jam) tanpa tab analisa ekstra (*Detail Wilayah* & *Hotspot* dilepas agar tidak membebani tampilan dan sesuai instruksi pengguna).
     - **Quick Toggles di Header Seksi**: Tombol pintas di bilah atas untuk membuka/menutup Dock Kiri (Lapisan & API) dan Dock Kanan (Manajemen Alert) secara instan.

## Berkas yang Diubah / Dibuat
- `database/init/071_dasbor_skdr_unified_submenus.sql`: Migrasi SQL idempoten mendaftarkan 6 subItems di bawah `mod_main_dashboard` pada `app_settings.navigation_menu`.
- `database/rollback/071_rollback.sql`: Rollback migrasi memulihkan snapshot `app_settings_bak_071`.
- `docs/KATALOG_12_SUB_DASBOR_SKDR.md`: Katalog spesifikasi teknis dan fungsional 12 sub-dasbor Kemenkes.
- `services/frontend-next/lib/dasbor-skdr-filter.ts`: Definisi tipe filter, URL state serializer/deserializer, dan metadata halaman.
- `services/frontend-next/lib/dasbor-skdr-api.ts`: Master data 36 penyakit indikator dan tipe data metrik SKDR.
- `services/frontend-next/lib/menu.ts`: Registrasi `DASBOR_SKDR_SUB_ITEMS` dan `DASBOR_SKDR_MENU_ITEM` ke `DEFAULT_NAVIGATION_CONFIG`.
- `services/frontend-next/components/dasbor-skdr/DasborSkdrClient.tsx`: Klien orkestrasi dasbor utama terpadu dengan sticky filter drawer.
- `services/frontend-next/components/dasbor-skdr/SkdrFilterPanel.tsx`: Komponen panel filter samping dinamis auto-layout + tombol Terapkan.
- `services/frontend-next/components/dasbor-skdr/SkdrRingkasanView.tsx`: Sub-view Ringkasan Utama (IBS & EBS).
- `services/frontend-next/components/dasbor-skdr/SkdrTrenView.tsx`: Sub-view Kurva Tren Kasus Mingguan IBS & Iklim (tanpa kartu narasi).
- `services/frontend-next/components/dasbor-skdr/SkdrDistribusiView.tsx`: Sub-view Distribusi Umur, Gender & Peringkat Wilayah (tanpa in-card dropdown).
- `services/frontend-next/components/dasbor-skdr/Skdr717View.tsx`: Sub-view Capaian WHO 7-1-7 & Corong Kualitas Sinyal EBS.
- `services/frontend-next/components/dasbor-skdr/SkdrDeteksiView.tsx`: Sub-view Deteksi Outbreak EARS/Farrington & Hotspot NASA (tanpa in-card dropdown).
- `services/frontend-next/components/dasbor-skdr/SkdrBuletinView.tsx`: Sub-view Generator Buletin & Infografis Digital.
- `services/frontend-next/app/dashboard/skdr/page.tsx`: Index redirect ke `/dashboard/skdr/ringkasan`.
- `services/frontend-next/app/dashboard/skdr/ringkasan/page.tsx`: Rute sub-menu Ringkasan Utama.
- `services/frontend-next/app/dashboard/skdr/tren/page.tsx`: Rute sub-menu Tren Penyakit.
- `services/frontend-next/app/dashboard/skdr/distribusi/page.tsx`: Rute sub-menu Distribusi & Demografi.
- `services/frontend-next/app/dashboard/skdr/717/page.tsx`: Rute sub-menu WHO 7-1-7 & Kinerja EBS.
- `services/frontend-next/app/dashboard/skdr/deteksi/page.tsx`: Rute sub-menu Deteksi Outbreak & Iklim.
- `services/frontend-next/app/dashboard/skdr/buletin/page.tsx`: Rute sub-menu Buletin & Infografis.
- `services/frontend-next/app/main-dashboard/page.tsx`: Kompatibilitas rute `/main-dashboard` merender `DasborSkdrClient`.
- `docs/CHANGE_LOG_MATRIX.md`: Pencatatan entri PR 057.

## Verifikasi Lokal
- TypeScript compilation check (`docker exec skdr-frontend-next npx tsc --noEmit`): **0 error**.
- Pengujian migrasi database `071_dasbor_skdr_unified_submenus.sql` dan `071_rollback.sql` pada container `skdr-postgres`: sukses idempoten (`BEGIN SELECT 1 UPDATE 1 COMMIT`).
- Verifikasi rute HTTP:
  - `/skdr/dashboard/skdr/ringkasan` -> HTTP 200
  - `/skdr/dashboard/skdr/tren` -> HTTP 200
  - `/skdr/dashboard/skdr/distribusi` -> HTTP 200
  - `/skdr/dashboard/skdr/717` -> HTTP 200
  - `/skdr/dashboard/skdr/deteksi` -> HTTP 200
  - `/skdr/dashboard/skdr/buletin` -> HTTP 200
  - `/skdr/main-dashboard` -> HTTP 200
- **Status Git**: Seluruh perubahan tersimpan secara lokal tanpa push ke remote / Gitea sesuai instruksi pengguna.

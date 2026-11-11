# PR 050 — Mode TV (`/tv`): Pusat Komando Spasial & Meja Analisa Epidemiologi (PHEOC Spatial Command Center)

## Latar Belakang & Tujuan
Halaman **Mode TV (`/tv`)** sebelumnya hanya menampilkan komponen placeholder `<UnderDevelopment />`. Sesuai kebutuhan operasional *Public Health Emergency Operations Center* (PHEOC) dan analisis ahli epidemiologi lapangan, Mode TV diubah menjadi **Spatial Dashboard Penuh Layar (*Full-Viewport Spatial Command Center*)** yang mengintegrasikan peta interaktif OpenLayers dari modul Spasial dengan:
1. **Bilah Komando Atas (*Top Command Bar*)** + **Indikator Status Kesiapsiagaan Epidemiologi Otomatis** (`SIAGA KLB` / `WASPADA SINYAL` / `TERKENDALI`).
2. **6 Kartu KPI Epidemiologi (*Heads-Up Display*)** yang dirancang berdasarkan urutan triase epidemiologi dan mudah dipahami dalam sekali pandang.
3. **Dock Lapisan & Triase Titik 1-Klik** di sisi kiri peta untuk mengisolasi fasyankes berdasarkan urgensi respons.
4. **Panel Meja Analisa Epidemiologi (*Field Epidemiologist Workbench*)** di sisi kanan peta dengan 4 tab analisis.

---

## Ringkasan Perubahan

### 1. Peta Spasial Penuh Layar (`SpasialMap.tsx` & `AppShell.tsx`)
- **`services/frontend-next/components/spasial/SpasialMap.tsx`**:
  - Menambahkan properti opsional yang sepenuhnya kompatibel ke belakang (*backward-compatible* dengan `/dashboard/spasial`):
    - `fullHeight?: boolean`: merender kanvas peta setinggi `100%` (*full viewport*) tanpa bingkai luar yang memotong ruang pandang.
    - `topHud?: ReactNode | ((ctrl: MapHudCtrl) => ReactNode)`: merender bilah komando dan kartu KPI langsung di dalam kontainer peta sehingga tetap tampil saat mode **Layar Penuh (*Native Fullscreen*)** diaktifkan di layar TV.
    - `leftDock?: ReactNode`: merender dock triase titik dan kontrol lapisan di sisi kiri peta.
    - `topOffset?: number`: menyesuaikan jarak atas panel kanan dan *padding* otomatis `view.fit()` agar batas wilayah tidak tertutup kartu KPI.
    - `hideDefaultToolbar?: boolean`: menyembunyikan toolbar bawaan ketika `topHud` aktif.
- **`services/frontend-next/components/layout/AppShell.tsx`**:
  - Pada rute `/tv` (`isTv`), menonaktifkan *breadcrumbs*, *padding* vertikal halaman, serta `<Footer />`, dan mengaktifkan mode header ringkas (`compact: true`) agar peta mengisi `100vh - 56px` tanpa *scroll* halaman.

### 2. Enam Kartu KPI Epidemiologi HUD (`TvSpasialClient.tsx`)
Setiap kartu KPI menampilkan indikator primer, pembanding tren/ambang batas, sub-indikator klinis/operasional, serta berfungsi sebagai tombol interaktif untuk mengganti indikator peta:
1. **1. Beban Kasus & Tren**: Total kasus kumulatif, $\Delta\%$ terhadap periode sebelumnya, serta perbandingan kasus minggu ini vs minggu lalu ($\Delta\%$ kecepatan transmisi mingguan).
2. **2. Mortalitas & CFR**: Tingkat fatalitas kasus (*Case Fatality Rate* `%`), jumlah kematian absolut, rentang kepercayaan **Wilson 95% CI**, dan klasifikasi keparahan klinis (`Letalitas Tinggi` $\ge 2\%$, `Waspada` $0{,}5\text{–}2\%$, `Terkendali` $<0{,}5\%$).
3. **3. Sinyal & Verifikasi**: Total sinyal kewaspadaan dini (Alert IBS / Sinyal EBS), persentase sinyal terverifikasi (`%`), serta jumlah fasyankes yang masih memiliki *backlog* alert belum diverifikasi.
4. **4. KLB & Respons $\le 24$ Jam**: Jumlah kejadian luar biasa (KLB) aktif beserta jumlah fasyankes terdampak, persentase ketepatan waktu respons $\le 24$ jam, dan jumlah unit dengan respons terlambat ($>24$ jam).
5. **5. Sebaran & Konsentrasi Pareto**: Rasio wilayah terdampak (`X / Y` Provinsi atau Kab/Kota beserta `%` cakupan geografis) dan **Indeks Konsentrasi Pareto** (`%` beban kasus nasional/provinsi yang terkonsentrasi di 3 wilayah tertinggi).
6. **6. Fasyankes di Peta & Presisi GPS**: Total unit pelapor yang terpetakan, jumlah laporan, serta persentase titik yang menggunakan koordinat presisi unit vs estimasi pusat kab/kota.

### 3. Dock Lapisan & Triase Titik 1-Klik
Memungkinkan petugas surveilans menyaring ribuan titik fasyankes di peta hanya dengan satu klik:
- **Semua Fasyankes Pelapor**
- **Khusus Sinyal KLB Aktif** (`st === 'klb'` atau `b > 0`)
- **Alert Belum Diverifikasi** (`st === 'alert'`)
- **Respons Terlambat ($>24$ Jam)** (`rn > r`)
- **Alert Sudah Terverifikasi** (`st === 'verif'`)
- Dilengkapi kontrol mode titik (`Kluster`, `Titik Unit`, `Sembunyi`), toggle `Choropleth` + slider opasitas, toggle `Heatmap`, pilihan `Peta Dasar` (`Terang`, `OSM`, `Satelit`, `Polos`), dan filter kasus minimal per unit.

### 4. Panel Meja Analisa Epidemiologi (4 Tab)
- **Tab 1 — `Kajian Epid` (SitRep Otomatis)**:
  1. *Dinamika & Fase Transmisi*: Klasifikasi fase kurva epidemi (*Fase Akselerasi*, *Fase Plateau*, *Fase Dekelerasi*), identifikasi **Minggu Puncak (Peak Epid Week)**, dan grafik **Kurva Epidemi Mingguan**.
  2. *Pola Spasial & Konsentrasi Pareto*: Mengidentifikasi apakah sebaran bersifat **Terfokus (Klaster)** ($\ge 50\%$ kasus di 3 wilayah) atau **Menyebar (Difus)**, lengkap dengan daftar 3 wilayah episentrum.
  3. *Kinerja Verifikasi & Respons SKDR*: Evaluasi capaian terhadap target Kemenkes ($\ge 80\%$) beserta tombol pintas untuk mengisolasi titik fasyankes yang belum diverifikasi atau terlambat merespons $>24$ jam di peta.
  4. *Rekomendasi Epidemiologi (PHEOC)*: Arahan tindak lanjut operasional yang kontekstual (pengerahan TGC untuk KLB, akselerasi verifikasi sinyal, intervensi Pareto, dan audit klinis bila CFR tinggi).
- **Tab 2 — `Triase Wilayah`**: Peringkat komposit seluruh Provinsi/Kab-Kota ke dalam **Zona Merah**, **Waspada (Oranye)**, dan **Terkendali (Hijau)** dengan tombol *drill-down* langsung.
- **Tab 3 — `Unit`**: Daftar 25 fasyankes prioritas investigasi diurutkan berdasarkan status KLB dan beban kasus.
- **Tab 4 — `Inspeksi`**: Rincian mendalam wilayah terpilih (`/api/v1/analisa/spasial/wilayah`) mencakup kurva epidemi lokal, sindrom/penyakit teratas, sub-wilayah teratas, fasyankes teratas, dan tautan langsung ke Matriks Analisa.

---

## File yang Diubah / Ditambahkan
- `services/frontend-next/components/spasial/SpasialMap.tsx`
- `services/frontend-next/components/spasial/TvSpasialClient.tsx` *(baru)*
- `services/frontend-next/app/tv/page.tsx`
- `services/frontend-next/components/layout/AppShell.tsx`
- `docs/CHANGE_LOG_MATRIX.md`
- `docs/PR/050-mode-tv-pusat-komando-spasial-epidemiologi.md` *(baru)*

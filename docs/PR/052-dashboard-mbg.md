# PR 052 — Revamp Dasbor MBG (Keracunan Pangan MBG × Pengawasan Gizi MBG)

Tanggal: 11 Nov 2026 (WIB). Branch: `main` (lokal → `gitea main`). Lanjutan PR 036 (`/dasbor/mbg`).

## Latar belakang
Dasbor MBG Kemkes (`https://skdr.kemkes.go.id/dashboard-mbg`) hanya punya dua kartu ringkas dan satu grafik wilayah:
- **Kerpang MBG**: Provinsi, Kab/Kota, Kejadian, Kasus, Kematian.
- **Rekap SLHS**: Pemeriksaan, Rekomendasikan, Tidak Direkomendasikan.
- Panel **KERACUNAN MAKAN MBG**: Jenis Analisa (Kejadian/Kasus/Meninggal), Provinsi/Kab/Kota/Kecamatan multi-pilih bertingkat, Granularitas (Tahun/Bulan/Minggu Epid/Harian), rentang tanggal, tipe grafik (Column/Line/Bar), label data on/off, urut (Nama Daerah/Tertinggi/Terendah).

SKDR punya **dua** transaksi MBG — *Pengawasan Gizi MBG* (pencegahan, Formulir 1–13 per kunjungan SPPG) dan *Keracunan Pangan MBG* (kejadian/outcome). Dasbor PR 036 menampilkan keduanya sebagai dua halaman terpisah dengan filter atas. PR ini menyatukan alurnya dari sudut pandang epidemiologi:

> **Pengawasan (faktor risiko/pencegahan) → Temuan & skor rendah → Keracunan (kejadian) → respons (lapor, lab, penutupan).**

Jadi pertanyaan utama dasbor bukan hanya "berapa kasus", tetapi "SPPG mana yang berisiko, apakah yang keracunan sudah pernah diawasi, dan seberapa cepat kita merespons".

## Yang dibangun
### 1. Panel filter samping (pola Matriks Analisa)
`components/dasbor-mbg/MbgFilterPanel.tsx` — lebar 280px, *sticky*, tombol tampil/sembunyi diingat di `localStorage` (`skdr-dasbor-mbg-filter-panel`), menjadi *drawer* di layar sempit. Semua filter tersimpan di URL (bisa dibagikan).
- **Jenis Analisa** Kejadian/Kasus/Meninggal (Kemkes) — menggerakkan grafik wilayah & kurva epidemi.
- **Periode**: tanggal dari/s.d. + preset 7 hari, 30 hari, 12 minggu, tahun berjalan, semua.
- **Granularitas**: Tahun/Bulan/Minggu Epid/Harian (Kemkes) — periode kosong diisi 0 (kurva epidemi jujur).
- **Provinsi → Kab/Kota → Kecamatan** multi-pilih bertingkat (Kemkes); kecamatan diambil dari data kejadian. **SPPG**, **Sekolah/sasaran** (pencarian).
- **Filter lanjutan**: status laporan, status lab, IKL, SLHS (Keracunan); status kunjungan, rekap F12 (Pengawasan). Label "Keracunan saja" pada filter yang tidak berlaku untuk Pengawasan.
- Lencana jumlah filter aktif + "Atur ulang filter".

### 2. Tab Ringkasan & Tautan Risiko (baru, default)
`components/dasbor-mbg/MbgRingkasan.tsx`
- Pita alur Pengawasan → Temuan → Keracunan.
- Kartu **Keracunan Pangan MBG** (setara Kerpang Kemkes): Provinsi, Kab/Kota, Kejadian, Kasus (+ rawat inap), Kematian (+ CFR dengan IK95% Wilson), Attack rate.
- Kartu **Rekap SLHS & IKL SPPG** (setara Rekap SLHS Kemkes): IKL diperiksa / memenuhi / tidak memenuhi, SLHS ada / tidak / belum diisi.
- Kartu **Pengawasan Gizi MBG**: kunjungan, SPPG diawasi, skor SOP rata-rata, F12 BAIK / BELUM BAIK, F13 BELUM BAIK.
- Interpretasi otomatis (kalimat, termasuk catatan bahwa pencocokan SPPG antar-modul berdasarkan **nama**).
- Grafik wilayah ala Kemkes (level otomatis mengikuti filter Prov → Kab → Kec, bisa diganti; Column/Line/Bar; Nama Daerah/Tertinggi/Terendah; label data; 40 teratas + "tampilkan semua") dan kurva epidemi.
- **Tabel Tautan Risiko**: SPPG yang mengalami keracunan × riwayat pengawasannya (kunjungan, skor SOP F3–F11, F12, tanggal pengawasan terakhir *sebelum/sesudah* kejadian). Kategori: *Skor pengawasan rendah + kejadian*, *Belum pernah diawasi + kejadian*, *Skor memadai + kejadian*.
- **Prioritas Pencegahan**: SPPG skor < 80 atau F12 BELUM BAIK yang belum mengalami kejadian (target pembinaan sebelum KLB).

### 3. Tab Keracunan Pangan
`KeracunanDashboardView.tsx` (semua panel PR 036 dipertahankan) + baru:
- KPI epidemiologis: Kejadian (KLB), Kasus, Rawat inap, Kematian & CFR (IK95% Wilson), Attack rate (kasus ÷ terpapar, hanya kejadian yang mengisi terpapar) + inkubasi rata-rata, Status lab.
- Interpretasi otomatis; kurva epidemi per granularitas; grafik wilayah ala Kemkes.
- **Ketepatan waktu lapor**: ≤24 jam / 24–48 / 48–72 / >72 jam / belum dilaporkan, median kejadian→lapor dan gejala→lapor.
- **Status pemeriksaan lab**: ada hasil / dikirim / belum, kejadian dengan sampel positif, median waktu tunggu hasil (TAT).
- **Pangan dicurigai**: sampel positif lab per bahan (bukti terkuat) + komponen menu tersaji saat kejadian (petunjuk awal).
- SLHS/IKL di panel lingkungan, kolom Skor SOP di matriks SPPG terdampak.
- **Daftar Kejadian** baru (cari, urut terbaru/kasus/lapor paling lambat, 15 per halaman, tautan ke `/keracunan-mbg/{id}`) menggantikan tabel kejadian terbaru.

### 4. Tab Pengawasan Gizi
`GiziDashboardView.tsx` (semua panel PR 036 dipertahankan) + baru: interpretasi, **tren skor SOP** per granularitas dengan garis ambang 80, distribusi kesimpulan per formulir termasuk "Belum dinilai", **Temuan "Tidak Sesuai" terbanyak** (F1 ketenagaan, F2 SOP, butir F3–F11 dengan naskah butir), **SPPG skor terendah**.
Data pengawasan tidak memuat SLHS, sehingga Rekap SLHS diambil dari isian penyelidikan Keracunan (dicatat sebagai keterbatasan).

### 5. Lain-lain
- **Ekspor Excel** (12 sheet: Ringkasan, Kurva epidemi, Wilayah provinsi/kab-kota/kecamatan, Daftar kejadian, Gejala, Pangan dicurigai, Tautan risiko SPPG + prioritas pencegahan, Pengawasan per SPPG, Formulir F1-F13, Temuan pengawasan) mengikuti filter aktif.
- Status kosong, memuat, dan galat yang jujur di setiap panel; tidak ada angka buatan.
- Tautan cepat ke Transaksi Keracunan / Transaksi Pengawasan di header; `?tab=gizi` / `?tab=keracunan` lama tetap berlaku.
- Menu: "Dasbor MBG" juga menjadi sub-menu pertama **Program MBG** (grup Transaksi); item di grup Dasbor tetap.

## Pemetaan fitur Kemkes → SKDR
| Kemkes dashboard-mbg | SKDR PR 052 |
|---|---|
| Kartu Kerpang: Provinsi, Kab/Kota, Kejadian, Kasus, Kematian | Kartu Keracunan Pangan MBG (Ringkasan) + KPI tab Keracunan; ditambah rawat inap, CFR + IK95%, attack rate |
| Rekap SLHS: Pemeriksaan, Rekomendasikan, Tidak Direkomendasikan | Rekap SLHS & IKL SPPG: IKL diperiksa / memenuhi / tidak memenuhi + SLHS ada / tidak / belum diisi |
| Jenis Analisa Kejadian/Kasus/Meninggal | Filter samping "Jenis Analisa" (grafik wilayah + kurva epidemi) |
| Provinsi/Kab/Kota/Kecamatan multi bertingkat | Filter samping multi-pilih bertingkat (Kecamatan dari data kejadian) |
| Granularitas Tahun/Bulan/Minggu Epid/Harian | Filter samping Granularitas → kurva epidemi & tren skor |
| Rentang tanggal | Periode + preset |
| Column/Line/Bar, label data, urut Nama/Tertinggi/Terendah | Toolbar grafik di setiap grafik wilayah/kurva |
| (tidak ada) | Tautan risiko pengawasan × kejadian, prioritas pencegahan, ketepatan lapor, lab & TAT, pangan dicurigai, temuan F1–F13, SPPG skor terendah, peta, ekspor Excel |

## Backend
`services/backend-rust/src/dasbor_mbg.rs` (rute & otorisasi tidak berubah, `Need::Login`):
- `GET /api/v1/dasbor/mbg/keracunan`: parameter baru `kecamatan` (daftar dipisah koma, cocok huruf kecil) dan `sekolah` (ILIKE kolom `sekolah` + `data->>'sekolah'`). Keluaran baru `daily_series`, `ranking{provinsi,kabkota,kecamatan}` (kejadian/kasus/meninggal/terpapar, CFR, AR), `ketepatan_lapor`, `lab_ringkas`, `pangan{menu,sampel_positif}`, `filter_options.kecamatan`; `recent_incidents` (≤1.000) + kecamatan, sekolah, rawat inap, tgl lapor, jam lapor; `sppg_incidents` + `pengawasan_avg_skor`, `pengawasan_terakhir`.
- `GET /api/v1/dasbor/mbg/pengawasan-gizi`: `weekly_trend[].avg_skor`, `daily_series`, `temuan` (hanya formulir berstatus dikirim).
- Tes unit baru `pr052_helpers` (median, peringkat, temuan).

## Database
- `database/init/067_dasbor_mbg_menu_program.sql`: sub-menu `mod_dasbor_mbg_program` di Program MBG (idempoten, backup `app_settings_bak_067`).
- `database/rollback/067_rollback.sql`: diuji lokal (apply → rollback → apply ulang).

## Verifikasi (lokal)
- `cargo check` + `cargo test dasbor_mbg`: lulus (3 tes, termasuk `pr052_helpers`).
- `tsc --noEmit` (container `skdr-frontend-next`): 0 error. `next build` penuh (`NEXT_PUBLIC_BASE_PATH=/skdr`, salinan terpisah agar `.next` dev tidak terganggu): sukses, `/dasbor/mbg` 29,5 kB.
- Backend dibangun ulang (`docker compose -f docker-compose-example.yml up -d --build skdr-backend-rust`), migrasi 067 tercatat di `schema_migrations`.
- Smoke endpoint dengan **data demo sementara** (18 kejadian, 22 kunjungan berlabel `DEMO-PR052-*`, dihapus setelah uji): keracunan 10–100 ms, pengawasan 12–23 ms; filter provinsi, kecamatan, sekolah dan rentang tanggal mengubah angka sesuai harapan.
- Tangkapan layar: Ringkasan, Keracunan, Pengawasan, panel filter (+ filter lanjutan), panel disembunyikan, drawer seluler, opsi grafik (Bar/Terendah/label), status kosong (filter tanpa hasil dan DB kosong).

## Catatan data
- DB lokal tidak memiliki transaksi MBG; dasbor menampilkan status kosong yang jujur. Tidak ada seed permanen.
- Pencocokan SPPG antara Pengawasan dan Keracunan memakai **nama SPPG** (belum ada ID SPPG bersama) — ejaan berbeda akan memisahkan SPPG yang sama.
- Attack rate hanya dihitung dari kejadian yang mengisi jumlah terpapar; CFR dengan kasus kecil memakai IK95% Wilson.
- Rekap SLHS berasal dari isian penyelidikan keracunan (bukan inspeksi rutin seperti di Kemkes).
- Kecamatan & sekolah hanya tersedia pada transaksi Keracunan.

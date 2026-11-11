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

---

# PR 052b — Dasbor MBG: kategori sidebar 3 halaman, peta 2 kolom, Keracunan lebih mudah dibaca, Pengawasan versi analis, data demo lokal

## Ringkasan perubahan

### 1. "Dasbor MBG" jadi kategori sidebar (tab → rute)
- Grup sidebar baru **Dasbor MBG** (`grp_dasbor_mbg`, area dasbor, urutan 2.5 — tepat setelah grup Dasbor) dengan 3 sub-menu, masing-masing halaman sendiri:
  - **Ringkasan** → `/dashboard/mbg/ringkasan`
  - **Keracunan** → `/dashboard/mbg/keracunan`
  - **Pengawasan** → `/dashboard/mbg/pengawasan`
- Item lama `mod_dasbor_mbg` (`/dasbor/mbg`) dihapus dari grup Dasbor; sub-menu "Dasbor MBG" di Program MBG (Transaksi) kini ke `/dashboard/mbg/ringkasan`. Tautan footer landing ikut diperbarui.
- **Alamat lama tetap jalan**: `/dasbor/mbg`, `/dasbor/mbg?tab=keracunan|gizi` dan `/dashboard/mbg?tab=…` dialihkan (client `router.replace`) ke rute yang sesuai; parameter filter lain di URL dipertahankan (`MbgLegacyRedirect`).
- **Panel filter samping tetap di tiap halaman** (komponen yang sama). Filter dibawa di query string; tautan antar-halaman (strip halaman di atas konten, tombol "Detail →") ikut membawa filter, dan filter terakhir disimpan di `sessionStorage` (`skdr-dasbor-mbg-filter`) sehingga berpindah lewat menu sidebar juga mempertahankan filter.
- Akses tidak berubah: `/dashboard/mbg/*` = area Dasbor, cukup login (bukan Dasbor Limited).
- Migrasi ringan `068_dasbor_mbg_kategori.sql` (UPDATE idempoten satu baris `app_settings.navigation_menu` + tabel cadangan `app_settings_bak_068`), rollback `database/rollback/068_rollback.sql`. `DEFAULT_NAVIGATION_CONFIG` (`lib/menu.ts`) disamakan.

### 2. Peta 2 kolom dalam satu bagian (`MbgSections.tsx` → `MbgMapSection`)
- Satu bagian lebar penuh, grid 2 kolom (bertumpuk di layar < 1280 px):
  - **Kiri — Keracunan Pangan**: kejadian/kasus per wilayah (koroplet) + titik kejadian.
  - **Kanan — Pengawasan Gizi**: skor/kesimpulan per wilayah (metrik awal *skor rata-rata*) + titik SPPG; titik oranye = skor < 80 atau F12 BELUM BAIK.
- Tiap peta punya judul, satu kalimat penjelasan, dan legenda kecil sendiri. Peta memakai `EbsIbsLayerMap` mode baru `compact` (panel lapisan & heat tertutup default, tinggi 420 px) — kompatibel mundur untuk Dasbor EBS/IBS.
- Bagian ini tampil di ketiga halaman (setelah angka utama).
- Backend: titik memakai koordinat rekaman `data.lat/lng` bila ada (sumber `sppg`), lalu jatuh ke fasyankes/centroid kab/kota/provinsi; titik pengawasan kini membawa `avg_skor`.

### 3. Halaman Keracunan — dekat dengan tata letak PR 036, lebih mudah dimengerti
Urutan bagian bernomor, masing-masing dengan judul berupa pertanyaan dan satu kalimat penjelasan di bawah setiap panel:
1. **Angka utama** — 6 KPI (kejadian, kasus, meninggal + CFR IK95%, attack rate, rawat inap, wilayah) + interpretasi.
2. **Di mana terjadinya?** — peta 2 kolom.
3. **Kapan terjadinya?** — kurva epidemi + perkembangan kasus harian; heatmap & tren mingguan dilipat di "detail".
4. **Wilayah mana paling terdampak?** — grafik wilayah + tabel peringkat (tingkat wilayah otomatis mengikuti filter).
5. **Respons & penyebab** — ketepatan lapor, laboratorium & TAT, pangan dicurigai.
6. **Siapa korbannya?** — gejala, demografi.
7. **Faktor risiko dapur SPPG** — lingkungan/IKL/SLHS, kesenjangan SOP, sampel lab, matriks SPPG × pengawasan.
8. **Daftar kejadian**.
Peta tunggal lama & tabel rekap duplikat diganti oleh peta 2 kolom dan tabel peringkat (kurang berantakan).

### 4. Halaman Pengawasan — dirancang ulang dari sudut pandang analis (isi F1–F13)
1. **Cakupan & hasil pengawasan** — KPI: kunjungan, SPPG diawasi, skor SOP rata-rata (+ % kunjungan < 80), F12 BAIK %, F13 BAIK %, **SPPG perlu tindak lanjut** + interpretasi otomatis (aspek terlemah, butir tersering gagal).
2. **Di mana SPPG yang lemah?** — peta 2 kolom (pengawasan berdampingan dengan kejadian).
3. **Bagaimana hasil penilaiannya?** — sebaran skor per kunjungan (< 60 … ≥ 90, merah/oranye di bawah 80) | kesimpulan per formulir (Sesuai/BAIK vs Tidak Sesuai/BELUM BAIK vs belum dinilai).
4. **Aspek mana yang lemah?** — kepatuhan per aspek (kelompok Ketenagaan & SOP / Penerapan SOP F3–F9 / Daya terima F10–F11 / Rekap) dengan bar per formulir & garis target 80% | **heatmap SPPG × Formulir F1–F13** (% Sesuai/BAIK per sel; hijau ≥ 80, kuning 60–79, merah < 60; urut dari SPPG terlemah; 20 teratas + "tampilkan semua").
5. **Butir apa yang paling sering tidak sesuai?** — temuan terbanyak F1–F11 | F1 ketenagaan, F2 ketersediaan 8 SOP.
6. **SPPG mana yang perlu ditindaklanjuti?** — daftar prioritas dengan alasan eksplisit (chip): ada kejadian keracunan (bobot 3), F12 BELUM BAIK (2), skor < 60 (2) / 60–79 (1), F13 BELUM BAIK (1), belum dikunjungi ulang > 90 hari (1).
7. **Bagaimana trennya?** — skor SOP per granularitas | kunjungan & F12 per minggu epid.
8. Lipatan **detail lanjutan**: heatmap mingguan provinsi/formulir, rekap wilayah, ringkasan F1–F13, rekap per SPPG, kunjungan terbaru (panel PR 036 tetap ada).

Backend (`dasbor_mbg.rs`, endpoint pengawasan-gizi): tambahan `skor_distribusi` (5 kelas + "Belum ada skor") dan `sppg_form` (matriks SPPG × formulir: n, sesuai, tidak sesuai, %, skor; maks. 60 SPPG, urut kepatuhan terendah). Uji unit `pr052b_skor_bin_and_matrix`.

### 5. Data demo lokal (`dev/seed/`, bukan migrasi)
- `dev/seed/mbg_demo.sql` — 52 kejadian Keracunan (+ update kasus harian) & 72 kunjungan Pengawasan dengan Formulir 1–13 (891 baris formulir), 15 kab/kota di 5 provinsi (Jabar, Jateng, Jatim, NTB, Sulsel), 15 Mei – 9 Nov 2026, koordinat di `data.lat/lng`; 14 SPPG muncul di kedua modul (tautan risiko terisi), 4 SPPG berkejadian sengaja belum diawasi.
- Semua baris bertanda `DEMO-MBG-…` (no. laporan/kunjungan) dan nama `[DEMO] …`. Hapus: `dev/seed/mbg_demo_hapus.sql`. Generator: `dev/seed/gen_mbg_demo.py`. Tidak dijalankan otomatis; **jangan** dijalankan di produksi.
- Diterapkan di DB lokal (dibiarkan untuk pengembangan).

## Berkas
- Backend: `services/backend-rust/src/dasbor_mbg.rs`
- Frontend: `app/dashboard/mbg/{page,ringkasan/page,keracunan/page,pengawasan/page}.tsx`, `app/dasbor/mbg/page.tsx` (pengalih), `components/dasbor-mbg/{DasborMbgClient,KeracunanDashboardView,GiziDashboardView,MbgRingkasan,MbgSections,MbgLegacyRedirect}.tsx`, `components/dasbor-ebs-ibs/EbsIbsLayerMap.tsx`, `components/landing/LandingFooter.tsx`, `lib/dasbor-mbg-api.ts`, `lib/menu.ts`
- DB: `database/init/068_dasbor_mbg_kategori.sql`, `database/rollback/068_rollback.sql`
- Data demo: `dev/seed/{README.md,mbg_demo.sql,mbg_demo_hapus.sql,gen_mbg_demo.py}`

## Verifikasi (lokal)
- `cargo test dasbor_mbg` → 4 lulus (termasuk `pr052b_skor_bin_and_matrix`); image backend dibangun ulang, migrasi `068_dasbor_mbg_kategori.sql` teraplikasi saat start.
- Migrasi 068 diuji: terapkan → jalankan ulang (idempoten, grup tidak dobel) → rollback (md5 `navigation_menu` kembali sama persis, tabel cadangan terhapus) → terapkan ulang lewat backend.
- `tsc --noEmit` 0 error; `next build` penuh EXIT=0 (rute `/dashboard/mbg`, `/dashboard/mbg/{ringkasan,keracunan,pengawasan}`, `/dasbor/mbg`).
- Tangkapan layar (harness lokal: sesi dimock, API dasbor dijawab server uji yang membaca DB lokal berisi data demo): ringkasan, kategori sidebar, peta 2 kolom, halaman Keracunan, halaman Pengawasan (+ heatmap SPPG × formulir, kepatuhan per aspek, tindak lanjut), filter Jawa Barat, pengalihan `/dasbor/mbg?tab=gizi&prov=13` → `/dashboard/mbg/pengawasan?prov=13`, tampilan seluler (peta bertumpuk).
- Catatan: peta dasar lokal menampilkan tanda air "API KEY REQUIRED" dari penyedia tile (konfigurasi kunci tile di lingkungan lokal, sama dengan dasbor EBS/IBS) — bukan bagian perubahan ini.

# PR 047 – Dokumentasi Spesifikasi Kebutuhan Bisnis & Sistem (BRD / SRS) Fitur Formulir dan Dasbor SKDR Indonesia

## Metadata
- **Tanggal:** 11 November 2026
- **Klasifikasi:** Dokumentasi Teknis Fungsional & Panduan Pengguna (BRD / SRS)
- **Penulis:** Antigravity AI & Tim Pengembang SKDR Indonesia
- **Dokumen Terkait:** `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md`, `docs/CHANGE_LOG_MATRIX.md`

---

## 1. Latar Belakang & Tujuan
Pengguna dan pemangku kepentingan (stakeholder) membutuhkan dokumentasi menyeluruh dalam format standar Business Requirements Document (BRD) / Software Requirements Specification (SRS) yang terstruktur, mudah dipahami, dan lengkap dengan alur kerja (user flows) untuk:
1. Mempelajari seluruh fitur pengisian formulir data transaksi di lapangan.
2. Memahami logika perhitungan indikator, ambang batas alert, dan visualisasi pada setiap modul dasbor.
3. Mengetahui hak akses berdasarkan peran pengguna (RBAC).
4. Mengetahui relasi pemetaan (*data mapping*) dari kolom isian formulir ke modul dasbor yang terpengaruh.

---

## 2. Cakupan Dokumentasi
Dokumen spesifikasi komprehensif ditulis pada file:
`docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md`

### 2.1. Modul Formulir Transaksi yang Didokumentasikan
1. **Laporan EBS (Surveilans Berbasis Kejadian):**
   - 7 Langkah Wizard: Pelapor & Wilayah, Informasi Rumor, Kasus & Klinis (matriks 11 kelompok umur × 2 jenis kelamin), Lab & Tata Laksana, Status KLB & Tindakan (W1, SK KLB, Mobilisasi TGC, PFR, Komrisk, Koordinasi), Lampiran & Respon SIZE, Tinjau & Kirim.
2. **Laporan Agregat IBS (Surveilans Berbasis Indikator Mingguan):**
   - 4 Langkah Wizard: Unit & Wilayah, Periode Laporan (Tahun & Minggu Epid), Data Kasus (tabel 24 penyakit: kasus, kematian, lab + Total Kunjungan Fasyankes + Laporan Nihil), Tinjau & Kirim.
3. **Laporan Individu IBS (Pencatatan Kasus per Pasien):**
   - 5 Langkah Wizard: Unit & Periode, Info Pasien (nama, no epid, umur th/bl/hr untuk bayi, kelamin, pekerjaan, alamat), Penyakit Agregat & Diagnosis (tgl periksa, status akhir/meninggal, keluhan, ICD-10), Pemeriksaan & Antropometri (tinggi, berat, IMT otomatis beserta kategori gizi, suhu, tensi, catatan SOAP), Tinjau & Kirim.
4. **Pengawasan Gizi MBG (Program Makan Bergizi Gratis):**
   - Identitas Kunjungan (Nama TPG, Puskesmas, SPPG, Pengawas Gizi, Tanggal).
   - 13 Formulir Standar Kemenkes RI (F1–F12 butir audit SOP dan higiene, unggah foto talenan/persiapan pada F7, evaluasi Comstock sisa piring pada F11, Rekapitulasi Skor Kepatuhan & Rekomendasi pada F13). Ambang kepatuhan $\ge 80$.
5. **Keracunan Pangan MBG (Investigasi Insiden KLB):**
   - 6 Langkah Wizard: Laporan Cepat (4 isian wajib untuk mengirim alert kilat), Kasus & Gejala (Attack Rate dan CFR otomatis, kalkulator masa inkubasi), Menu & Penanganan, Kesehatan Lingkungan SPPG (evaluasi 26 SOP dapur), Laboratorium (pelacakan sampel pangan & biologis), Lampiran & Kirim.
   - Modul Catatan Perkembangan Kasus Harian (*daily follow-up monitoring*).
6. **Form PE (Penyelidikan Epidemiologi Zoonosis):**
   - 4 Penyakit Prioritas One Health: Leptospirosis, Rabies (GHPR), Antraks, dan Avian Influenza (H5N1).
   - Alur status berjenjang: Draf $\rightarrow$ Dikirim $\rightarrow$ Terverifikasi $\rightarrow$ Final.

### 2.2. Modul Dasbor yang Didokumentasikan
1. **Dasbor Utama (`/main-dashboard`):** KPI eksekutif, CFR Wilson Score 95% CI, Panel Alert SKDR mingguan, Indikator Global 7-1-7, Peta Sebaran Choropleth & Spasial, Karusel 24 Penyakit, Lab & TAT, Klaster KLB Aktif, Rekonsiliasi NAR–SKDR.
2. **Dasbor Zoonosis Lite (`/dasbor/zoonosis-lite`):** Ringkasan 4 penyakit zoonosis prioritas, perbandingan CFR Wilson, heatmap musiman, dan modal laboratorium.
3. **Dasbor EBS & IBS (`/dasbor/ebs-ibs`):** Dasbor ganda berbasis data transaksi langsung, peta spasial multi-layer OpenLayers 10, dan matriks mingguan.
4. **Dasbor MBG (`/dasbor/mbg`):** Dasbor ganda untuk Pengawasan Gizi SPPG dan Keracunan Pangan MBG, evaluasi 26 SOP, korelasi silang kepatuhan audit vs riwayat insiden keracunan.
5. **Dasbor Limited - Spasial (`/dashboard/spasial`):** Peta choropleth drilldown wilayah 4 tingkat (Nasional $\rightarrow$ Provinsi $\rightarrow$ Kab/Kota $\rightarrow$ Kecamatan), sebaran titik fasyankes pelapor, heatmap kepadatan, putar ulang mingguan (epid week playback), filter samping fleksibel dengan auto-layout fluid.
6. **Dasbor Limited - Matriks Analisa (`/dashboard/matriks-analisa`):** 6 Tab Analitik (Ringkasan, Matriks & Laporan, Morbiditas, Kinerja Pelaporan, Alert & Sinyal, Profil Kasus) serta ekspor data ke Excel (XLSX).
7. **Beranda & Portal Publik (`/` dan `/beranda`):** Rangkuman situasi nasional untuk publik, proteksi data sensitif, dan Single Sign-On (SSO).

### 2.3. Diagram Alur Pengguna (Mermaid User Flows)
1. Siklus Pelaporan Mingguan IBS & Pemicuan Alert Ambang Batas (Mean + 2 SD).
2. Deteksi Rumor EBS & Respons Kedaruratan 7-1-7 (Deteksi $\le 7$ hari, Notifikasi $\le 1$ hari, Respon $\le 7$ hari).
3. Pengawasan Higiene Rutin SPPG & Penanggulangan Kasus Keracunan MBG.
4. Siklus Verifikasi Penyelidikan Epidemiologi (PE Workflow Draf s.d. Final).

### 2.4. Matriks Pemetaan Input ke Dasbor (Data Mapping Matrix)
Menjabarkan relasi antara field formulir input terhadap indikator, metrik angka, peta, dan tab dasbor yang terpengaruh.

---

## 3. Berkas yang Diubah / Ditambahkan
1. `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md` (Dokumen BRD/SRS baru).
2. `docs/PR/047-dokumentasi-brd-srs-fitur-form-dasbor.md` (Dokumen PR ini).
3. `docs/CHANGE_LOG_MATRIX.md` (Pencatatan PR 047 pada matriks perubahan).

---

## 4. Pengujian & Verifikasi
- Struktur markdown divalidasi terhadap format GitHub Flavored Markdown (GFM).
- Seluruh diagram Mermaid (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`) divalidasi sintaks dan keterbacaannya.
- Verifikasi silang nama modul, rute URL, nama peran RBAC, dan logika perhitungan terhadap kode sumber backend (`services/backend-rust`) dan frontend (`services/frontend-next`).


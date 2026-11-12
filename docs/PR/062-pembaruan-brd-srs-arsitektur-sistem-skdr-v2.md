# PR 062 – Pembaruan Dokumen Spesifikasi Kebutuhan Bisnis & Sistem (BRD / SRS) Versi 2.0 Sesuai Arsitektur & Tampilan Sistem Terkini

## Latar Belakang & Ringkasan Perubahan
Sesuai permintaan pengguna (*"bisakah anda buatin md yg terbaru mengenai sistem kita sekarang untuk BRD-nya"*), dilakukan penyusunan dan pembaruan menyeluruh terhadap dokumen spesifikasi bisnis dan teknis utama sistem SKDR Indonesia:
- **File Dokumen:** `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md`
- **Versi Rilis:** **Versi 2.0 (12 November 2026)**
- **Cakupan Pembaruan:** Merefleksikan seluruh evolusi arsitektur dan antarmuka dari **PR 053 hingga PR 061**.

---

## Rincian Pembaruan Dokumen (Versi 2.0)

1. **Pembaruan Pohon Navigasi & Modul Induk (Area DASBOR & TATA KELOLA)**:
   - **Dasbor SKDR Terpadu (`mod_main_dashboard` — PR 057)**: Menyatukan 12 sub-dasbor Kemenkes menjadi 1 menu induk dengan 6 sub-menu resmi:
     1. `Ringkasan Utama (IBS & EBS)` (`/dashboard/skdr/ringkasan`)
     2. `Tren Penyakit (IBS)` (`/dashboard/skdr/tren`)
     3. `Distribusi & Demografi` (`/dashboard/skdr/distribusi`)
     4. `WHO 7-1-7 & Kinerja EBS` (`/dashboard/skdr/717`)
     5. `Deteksi Outbreak & Iklim` (`/dashboard/skdr/deteksi`)
     6. `Buletin & Infografis` (`/dashboard/skdr/buletin`)
   - **Dasbor Zoonosis (`mod_dasbor_kategori` — PR 058, PR 060, PR 061)**:
     1. `Zoonosis General` (`/dasbor/zoonosis-general` — KPI eksekutif, tren, alert, 7-1-7, lab, klaster, dan peta multi-mode)
     2. `Zoonosis Lite` (`/dasbor/zoonosis-lite` — pemantauan 4 penyakit zoonosis One Health murni EBS & PE)
     3. Kategori penyakit dinamis dari master (`/dasbor/kategori/[slug]`)
   - **Dasbor MBG Terpadu (`mod_dasbor_mbg` — PR 052, PR 053, PR 054)**:
     1. `Ringkasan Eksekutif` (`/dashboard/mbg/ringkasan`)
     2. `Keracunan Pangan` (`/dashboard/mbg/keracunan`)
     3. `Pengawasan Gizi` (`/dashboard/mbg/pengawasan`)
   - **Mode TV (`/tv` — PR 050)**: Pusat Komando Spasial mandiri $100\text{vw} \times 100\text{vh}$ tanpa header/sidebar, dilengkapi 6 KPI HUD, triase 1-klik, dan meja analisa epidemiologi 4 tab.

2. **Spesifikasi Lengkap Seluruh Formulir Input Transaksi**:
   - Laporan EBS (Surveilans Berbasis Kejadian / Rumor — 7 Langkah)
   - Laporan Agregat IBS Mingguan (Grid 24 Penyakit + Kunjungan Umum + Laporan Nihil)
   - Laporan Individu IBS (*Case-based surveillance*, ICD-10, tanda vital, IMT otomatis, SOAP)
   - Pengawasan Gizi MBG (13 Formulir Standar Kemenkes RI)
   - Keracunan Pangan MBG (Fast Alert 4 kolom, investigasi 26 SOP, masa inkubasi, attack rate, update harian)
   - Form PE 4 Zoonosis (Leptospirosis, Rabies/GHPR, Antraks, Flu Burung)

3. **Prinsip Isolasi Data & Audit Sumber Zoonosis (PR 061)**:
   - Penjelasan arsitektur isolasi ketat yang memisahkan data agregat mingguan IBS (`source_type: 'ibs'`) dari Dasbor Zoonosis.
   - Pemetaan diagnosa EBS Kemenkes (`ebs_diagnosa_alias`) untuk Rabies, Leptospirosis, Antraks, dan Flu Burung.
   - Penanganan dinamis nilai nol/kosong alami bila belum ada entri transaksi Form PE baru tanpa rekayasa data.

4. **Diagram Alur Pengguna (User Flows)**:
   - Diagram Mermaid komprehensif untuk 5 alur utama:
     - Alur 1: Pelaporan Rutin Mingguan IBS & Pemicuan Alert
     - Alur 2: Deteksi Rumor EBS & Standar Kinerja WHO 7-1-7
     - Alur 3: Audit Higiene SPPG & Penanggulangan KLB Keracunan Pangan MBG
     - Alur 4: Alur Verifikasi Form PE & Isolasi Sumber Dasbor Zoonosis
     - Alur 5: Triase Spasial Nasional & Kajian Epidemiologi di Mode TV

5. **Matriks Hubungan Transaksi ke Tampilan Dasbor & Aturan Validasi Bisnis**:
   - Pemetaan menyeluruh dari setiap formulir transaksi fasyankes ke tampilan visual dan indikator dasbor penerima.
   - Aturan validasi mortalitas vs morbiditas, kronologi waktu epidemiologi, konsistensi demografi, pencegahan duplikasi data, dan keamanan sesi.

---

## File Terkait
- `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md` (diperbarui ke Versi 2.0)
- `docs/PR/062-pembaruan-brd-srs-arsitektur-sistem-skdr-v2.md` (dokumen PR)
- `docs/CHANGE_LOG_MATRIX.md` (ditambahkan baris PR 062)

## Verifikasi
- Validasi struktur Markdown GitHub Flavored Markdown (GFM).
- Seluruh diagram Mermaid terverifikasi sintaksnya.
- Penyelarasan 100% dengan rute navigasi dan logika pada kode sumber `menu.ts`, `nav.ts`, dan modul-modul dasbor terkait.

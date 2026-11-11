# PR 051 — Pembaruan Dokumen BRD & SRS Fitur Form dan Dasbor Sesuai Tampilan Terbaru (v1.1)

## Ringkasan Perubahan
Memperbarui dokumen spesifikasi fungsional dan bisnis (`docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md` ke **Versi 1.1**) agar seluruh daftar halaman, struktur navigasi sidebar, alur pengguna (*user flows*), aturan isolasi data, serta tata letak antarmuka sesuai dengan kondisi aplikasi terkini (`PR 046` s/d `PR 050`).

## Detail Pembaruan pada `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md`
1. **Peta Navigasi & Struktur Menu Terkini (Bagian 3)**:
   - Memperbarui grup menu **DASBOR** di sidebar menjadi:
     - `Ringkasan Dasbor` (`/dasbor`)
     - `Dasbor SKDR` (`/dasbor/utama` — sebelumnya *Dasbor Utama*)
     - `Dasbor Zoonosis Lite` (`/dasbor/zoonosis-lite`)
     - `Dasbor MBG` (`/dasbor/mbg`)
     - `Penyakit` (`/penyakit`)
     - `Mode TV` (`/tv`)
     - *(Disembunyikan dari sidebar: `Dasbor SKDR EBS & IBS` `/dasbor/skdr-ebs-ibs` melalui `is_visible = false`)*
   - Mencantumkan grup **DASBOR LIMITED** (`Spasial` `/spasial` dan `Matriks Analisa` `/analisa`) serta **TATA KELOLA** (termasuk `Manajemen Akses` `/tatakelola/akses` dan `Pengaturan` `/tatakelola/pengaturan`).
2. **Alur Pengguna / *User Flows* (Bagian 4)**:
   - Memperbarui diagram Mermaid pada Alur 2, 3, dan 4 agar merujuk ke nama menu dan rute terbaru (`Dasbor SKDR`, isolasi data `Dasbor Zoonosis Lite`, serta `Spasial` & `Matriks Analisa` *fluid full-width*).
   - Menambahkan **Alur 5 — Pemantauan Ruang Komando PHEOC (Mode TV Spasial Full-Screen `/tv`)** lengkap dengan diagram alur Mermaid dari pembukaan halaman tanpa *header/sidebar*, pembacaan *Badge Status Risiko Nasional*, triase 1-klik titik fasyankes, hingga kembali ke halaman `/spasial`.
3. **Spesifikasi Halaman Dasbor & Mode TV (Bagian 6)**:
   - **6.2 Dasbor SKDR (`/dasbor/utama`)**: Pembaruan nama menu dan penjelasan fungsinya sebagai dasbor utama SKDR.
   - **6.3 Dasbor Zoonosis Lite (`/dasbor/zoonosis-lite`)**: Dokumentasi eksplisit mengenai **isolasi sumber data peta & tabel** dari data agregat mingguan IBS (`source_type: 'ibs'` dikecualikan; hanya menampilkan `ebs` dan `pe` / `pe_cases`) beserta *Notice Banner* informasi sumber data.
   - **6.4 Dasbor SKDR EBS & IBS (`/dasbor/skdr-ebs-ibs`)**: Penjelasan status *hidden menu* di sidebar namun rute dan API tetap dipertahankan untuk kompatibilitas.
   - **6.7 Mode TV — Pusat Komando Spasial & Meja Analisa Epidemiologi (`/tv`)**: Dokumentasi lengkap *full-viewport spatial command center* (`100vw × 100vh`) tanpa *header/sidebar* aplikasi (`tvMode={pathname === '/tv'}`), tombol **`← Kembali ke Spasial`**, *Risk Badge* otomatis (`SIAGA KLB` / `WASPADA SINYAL` / `TERKENDALI`), 6 Kartu KPI Epidemiologi HUD, Dock Kiri Triase 1-Klik & Kontrol Layer, serta Panel Kanan 4 Tab (*Kajian Epid*, *Triase*, *Unit*, *Inspeksi*).
   - **6.8 Spasial (`/spasial`) & 6.9 Matriks Analisa (`/analisa`)**: Dokumentasi tata letak *fluid full-width* (`w-full max-w-none`) dan fitur sinkronisasi matriks-peta.
4. **Matriks Pemetaan Sumber Data (Bagian 7)**:
   - Memperbarui tabel matriks halaman terhadap tabel database dan endpoint API, termasuk pengecualian `ibs` pada `/dasbor/zoonosis-lite` dan penambahan baris khusus untuk `/tv`.

## File yang Diubah
- `docs/BRD_SRS_FITUR_FORM_DAN_DASBOR.md`
- `docs/PR/051-pembaruan-brd-srs-sesuai-tampilan-terbaru.md`
- `docs/CHANGE_LOG_MATRIX.md`

## Verifikasi
- Pemeriksaan kelengkapan setiap bagian dokumen terhadap implementasi aktual di `services/frontend-next/` dan `database/init/065_*.sql` s/d `066_*.sql`.

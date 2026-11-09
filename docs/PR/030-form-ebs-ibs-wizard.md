# PR 030 — Form input Laporan EBS & IBS (wizard bergaya Form PE)

Tanggal: 9 Nov 2026 (WIB). Branch: `main` (lokal, **belum di-push**).

## Latar belakang
Hasil analisis form resmi SKDR-EBS (`/ebs/form`) dan SKDR-IBS (`/ibs/entri-data`) di skdr.kemkes.go.id (hanya dibaca,
tidak ada submit) dirangkum di spreadsheet *SKDR-EBS-IBS-before-after.xlsx*. Masalah utamanya: satu halaman panjang tanpa
indikator kemajuan, dropdown biasa untuk daftar besar (514 kab/kota, ribuan unit, 76 penyakit), label teknis
(`Id Unit`, `Id Prop`, `Time Unit Value`), salah ketik, tidak ada validasi silang, tidak ada draf.
PR ini membangun versi yang diperbaiki **di SKDR Indonesia (lokal)** dengan pola yang sama seperti Form PE.
Data disimpan di database SKDR Indonesia saja; **tidak ada yang dikirim ke skdr.kemkes.go.id**.

## Halaman
| Route | Isi |
|---|---|
| `/ebs/laporan` | Daftar Laporan EBS (tab Semua/Draf/Terkirim, cari, paginasi, lanjutkan/lihat/hapus draf) |
| `/ebs/laporan/baru`, `/ebs/laporan/[id]` (`?mode=lihat` = hanya baca) | Wizard EBS 7 langkah |
| `/ibs/laporan`, `/ibs/laporan/baru`, `/ibs/laporan/[id]` | Daftar + wizard IBS 4 langkah; `/ibs` dialihkan ke `/ibs/laporan` |

Menu: grup **Transaksi** → *Laporan EBS* dan *Laporan IBS (Agregat)* (migrasi 053 menambah ke `app_settings.navigation_menu`,
fallback di `lib/menu.ts`). `/ebs` (Sinkronisasi EBS, PR 005) tidak berubah dan tetap butuh izin `integrasi`.

### Langkah EBS
1. **Pelapor & Wilayah** — Nomor EBS & Tanggal Laporan otomatis (server), Jenis Unit → Provinsi → Kab/Kota → Kecamatan → Unit Pelapor (berjenjang), Nama & No. HP pelapor.
2. **Informasi Rumor** — Penyakit Rumor (68 diagnosa EBS + info gejala/penularan dari Master Penyakit), Tanggal Rumor (+ Minggu Epid, pintasan Hari ini/Kemarin), Status Kejadian, Penyakit Terverifikasi (tombol "Sama dengan Penyakit Rumor"), Sumber Informasi/Verifikasi.
3. **Kasus & Klinis** — Jumlah Kasus/Kematian (stepper), tabel usia × jenis kelamin dengan total otomatis, domisili (centang "sama dengan wilayah pelapor" atau cari langsung 514 kab/kota), gejala, tanggal onset/meninggal/ke faskes, kronologi (rich text).
4. **Lab & Tata Laksana** — sub-isian muncul hanya bila "Ya".
5. **Status KLB & Tindakan** — KLB → W1/SK/PE/TGC/status KLB; PFR, komunikasi risiko, koordinasi lintas sektor (+ tanggal).
6. **Lampiran** — tarik-lepas, progres unggah, PDF/gambar/CSV/Word/Excel ≤ 5 MB, draf disimpan otomatis dulu.
7. **Tinjau & Kirim** — ringkasan per langkah (tombol Ubah), daftar isian belum valid (klik = lompat), peringatan, kemungkinan duplikat.

### Langkah IBS
1. **Unit & Wilayah** — Jenis Unit, Kelompok, Provinsi, Kab/Kota, Kecamatan (opsional, mempersempit Puskesmas), Puskesmas/Unit, Petugas.
2. **Periode Laporan** — Tahun, **Minggu Epid** (pilihan menampilkan rentang tanggal, mis. "Minggu 44 · 1–7 Nov 2026", dan lencana "Sudah dilaporkan/Ada draf"), Tanggal Entri & Formulir otomatis.
3. **Data Kasus** — tabel 24 penyakit (header lengket, cari, "hanya yang terisi", Enter/↑↓ pindah baris, total otomatis, kartu di ponsel), Total Kunjungan, konfirmasi nihil bila semua 0.
4. **Tinjau & Kirim**.

## Fitur yang sama di kedua form
- Stepper lengket seperti Form PE: cincin progres per langkah, "x/y wajib", lencana jumlah isian belum valid + tooltip, bar progres keseluruhan, tombol **Lompat ke isian berikutnya yang belum valid** (scroll + sorot + fokus).
- **SearchSelect** (`components/ui/SearchSelect.tsx`) untuk *semua* pilihan: ketik untuk mencari (tanpa beda huruf besar/kecil/aksen, semua kata), keyboard (↑↓, PageUp/Down, Home/End, Enter, Esc, Tab), hanya 150 opsi dirender untuk daftar besar, "Terakhir dipakai", tombol hapus, mode multi (chip), bottom sheet di layar < 640 px, petunjuk "Pilih Provinsi dulu" saat nonaktif.
- **Isi otomatis**: nama dari akun yang login; wilayah/unit/HP dari laporan terakhir pengguna (lencana "Otomatis"); IBS: minggu laporan berjalan (minggu epid terakhir yang sudah selesai — Senin 9 Nov 2026 → Minggu 44).
- **Validasi inline** (frontend `lib/laporan/{ebs,ibs}.ts` = backend `laporan.rs`): Jumlah Kasus ≥ 1, Kematian ≤ Kasus, tanggal tidak di masa depan / tidak setelah Tanggal Laporan, onset ≤ meninggal, format HP Indonesia, kab/kota harus di provinsi terpilih (server), IBS kematian ≤ kasus per penyakit, minggu valid & sudah dimulai. **Peringatan** (tidak menghalangi kirim): total usia ≠ Jumlah Kasus, Lab > Kasus, Total Kunjungan < total kasus.
- Sub-isian bersyarat di bawah pertanyaan Ya/Tidak; bila tersembunyi tidak dihitung di progres dan tidak dikirim ke server.
- **Autosave draf** 1,5 dtk setelah perubahan (draf dibuat saat perubahan pertama, nomor `EBS-2026-000001` / `IBS-2026-000001` dari server), tombol Simpan Draf; bila gagal disimpan, isian disimpan sementara di perangkat (localStorage) dan ditawarkan untuk dipulihkan.
- **Konfirmasi tinggalkan halaman** (tutup tab/reload dan klik tautan di aplikasi) bila ada perubahan belum tersimpan.
- **Peringatan duplikat**: EBS — penyakit sama + kab/kota (domisili, else pelapor) dalam ±7 hari dari tanggal rumor, dari laporan lokal *dan* data EBS Kemkes tersinkron (`ebs_reports`). IBS — unit + tahun + minggu yang sama; pengiriman kedua ditolak (409 + indeks unik parsial).
- Setelah **Kirim** laporan terkunci (hanya baca); hanya draf yang bisa diubah/dihapus (soft delete). Riwayat (dibuat/dikirim/dihapus) di panel samping.
- Label & salah ketik dirapikan (mis. `SumberVerifikasi` → Sumber Verifikasi, `Dinkes Kako` → Dinkes Kab/Kota, label ganda "Pengendalian faktor risiko", nama penyakit IBS: *Pneumonia*, *Suspek Antraks*, *Acute Flaccid Paralysis*, *Meningitis/Ensefalitis*, *COVID-19*; nama asli tetap ditampilkan kecil "di form lama: …").
- Tata letak ramah ponsel: navigasi Sebelumnya/Berikutnya menempel di bawah, stepper ringkas (titik bernomor), tabel jadi kartu.

## Backend (`services/backend-rust/src/laporan.rs`)
| Method | Path | Izin |
|---|---|---|
| GET | `/api/v1/laporan-ref/opsi` (opsi + penyakit + daftar IBS + hari ini + batas lampiran) | `tatakelola` |
| GET | `/api/v1/laporan-ref/kecamatan?kabkota_id=` (master_fasyankes, fallback distrik EBS) | `tatakelola` |
| GET | `/api/v1/laporan-ref/unit?jenis=&kabkota_id=&province_id=&kecamatan=` (Puskesmas/RS dari master_fasyankes; unit lain dari nama unit di EBS tersinkron) | `tatakelola` |
| GET | `/api/v1/laporan-ref/prefill?jenis=` · `/api/v1/laporan-ref/duplikat/:jenis` | `tatakelola` |
| GET / POST | `/api/v1/laporan/:jenis` (daftar / buat draf) | `tatakelola` / `pe_input` |
| GET / PUT / DELETE | `/api/v1/laporan/:jenis/:id` (PUT & DELETE hanya draf) | `tatakelola` / `pe_input` |
| POST | `/api/v1/laporan/:jenis/:id/kirim` (422 + daftar isian bila belum valid, 409 bila minggu IBS sudah dikirim) | `pe_input` |
| POST / GET / DELETE | `/api/v1/laporan/ebs/:id/lampiran[/:lid]` (body mentah, `?nama=&judul=`, maks 5 MB) | `pe_input` / `tatakelola` |

Izin mengikuti Form PE (`auth::classify` + tes): baca butuh `tatakelola`, tulis butuh `pe_input`. Tanggal Laporan,
Tanggal Entri/Formulir, nomor, pembuat diisi server. Validasi ulang di server saat simpan & kirim.

## Database — migrasi `053_laporan_ebs_ibs.sql` (+ `database/rollback/053_rollback.sql`)
Ringan, hanya tabel baru + 1 update menu:
- `laporan_opsi` — opsi pilihan (jenis unit, status kejadian, sumber informasi, hasil lab, tata laksana, sumber W1, status KLB, Ya/Tidak, kelompok unit).
- `ibs_penyakit` — 24 penyakit IBS + baris total (kode, kode SMS, nama dirapikan, nama asli).
- `laporan_counters`, `laporan_ebs`, `laporan_ibs` (data `jsonb` + kolom ringkas untuk daftar/duplikat; indeks unik parsial unit+tahun+minggu untuk IBS terkirim), `laporan_lampiran` (bytea), `laporan_events`.
- `app_settings.navigation_menu` — 2 item menu di grup Transaksi (backup di `app_settings_bak_053`, idempoten).

Penyakit EBS memakai `ebs_diagnosa_alias` (68 diagnosa yang benar-benar muncul di data EBS) + `master_diseases`; provinsi/kab-kota
memakai master yang ada; Puskesmas/RS memakai `master_fasyankes`.

## Belum / sengaja tidak dikerjakan
- **Daftar opsi belum lengkap**: Sumber Informasi baru 15 dari 32 opsi dan Hasil Laboratorium 15 dari 44 opsi di form resmi (hanya opsi yang terbaca saat analisis yang di-seed — tidak mengarang). Penyakit EBS 68 dari 76. Tambah langsung di `laporan_opsi` bila daftar lengkap tersedia.
- **Aturan usulan yang perlu konfirmasi Kemkes**: pertanyaan Ya/Tidak induk dianggap wajib, tanggal tindak lanjut wajib bila "Ya", Puskesmas/Unit wajib di IBS, Penyakit Terverifikasi wajib bila status "Terverifikasi…", definisi kolom "Lab" IBS.
- Indikator **Tepat/Terlambat** IBS tidak dibuat (aturan batas waktu belum diketahui).
- **SearchSelect belum dipasang di Form PE** — sengaja, supaya Form PE yang sudah dipakai tidak berubah di PR ini; komponennya siap dipakai ulang.
- Belum ada pengiriman/sinkron ke skdr.kemkes.go.id dan belum ada alur verifikasi; pengguna belum punya unit/wilayah di akun, jadi isi otomatis memakai laporan terakhir.

## Pengujian (lokal saja)
- `cargo test` (rust:1-slim-bookworm): 37 lulus, termasuk `laporan::tests::{hp_format, epi_weeks, ebs_minimal_errors, ebs_rules, ibs_rules, unit_keys}` dan `auth::tests::classify_routes` (rute laporan).
- `npm run typecheck` dan `npm run build` (Node 20, lint + type) sukses; image backend dibangun ulang, migrasi 053 terpasang otomatis.
- API (curl, akun uji lokal sementara peran *petugas*): opsi/kecamatan/unit/prefill, buat & ubah draf, unggah/unduh/hapus lampiran (tipe ditolak 400, > 5 MB ditolak 413), kirim EBS belum lengkap → 422, kirim IBS minggu yang sama → 409, ubah laporan terkirim → 409, tanpa sesi → 401.
- Playwright 1440×900 + ponsel 390×844: login, langkah & progres, SearchSelect (provinsi, kab/kota, kecamatan, unit, penyakit, minggu), autosave draf, lompat ke isian belum valid, validasi inline (kematian > kasus, total usia ≠ kasus), sub-isian bersyarat, unggah lampiran, tinjau, kirim IBS, peringatan duplikat minggu & duplikat rumor EBS, bottom sheet di ponsel. Tidak ada error konsol.
- Data uji & akun uji sudah dihapus lagi dari DB lokal setelah verifikasi.

Tangkapan layar: `docs/screenshots/pr030/` (ebs-01 … ebs-08, ibs-01 … ibs-03).

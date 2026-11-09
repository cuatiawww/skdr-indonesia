# PR 031 — Form Individu IBS, kolom matriks Entri Data Agregat, penyempurnaan daftar Laporan EBS

Tanggal: 10 Nov 2026 (WIB). Branch: `main` (lokal, **belum di-push**).

## Latar belakang
Sidebar SKDR-IBS resmi (skdr.kemkes.go.id) berisi *Data Agregate*, *Entri Data Agregate*, *Analisa Data*, dan
*Form Individu Agregat*. Form Individu Agregat (`/form-individu-agregat/add`, dibaca saja — tidak ada yang disimpan/dikirim)
adalah satu halaman 4 tab: **Info Dasar, Info Pasien, Penyakit Agregat, Pemeriksaan**, dengan label teknis (`Id Unit`,
`Id Prop`, `Pekerjaan No`, `Akhir No`, `Diagnosa 1`), umur default `0`, dropdown biasa, peta Google yang rusak
("This page can't load Google Maps correctly"), dan tombol ganda Simpan / Simpan Dan Keluar tanpa konsep draf.
Daftarnya 24 kolom sempit. PR ini membangun versi yang diperbaiki di SKDR Indonesia (lokal) dengan pola PR 030,
merapikan kolom matriks Entri Data Agregat, dan melengkapi daftar Laporan EBS. **Analisa Data tidak dibuat.**
Data hanya disimpan di database SKDR Indonesia; **tidak ada yang dikirim ke skdr.kemkes.go.id**.

## Halaman & menu
| Route | Isi |
|---|---|
| `/ibs/individu` | Daftar Form Individu (tab Semua/Draf/Terkirim, cari nomor/pasien/No Epid/diagnosa/unit, paginasi, lihat/lanjutkan/hapus draf) |
| `/ibs/individu/baru`, `/ibs/individu/[id]` (`?mode=lihat` = hanya baca) | Wizard Form Individu 5 langkah |
| `/ibs/laporan` (URL tetap) | **Entri Data Agregat** (dulu "Laporan IBS (Agregat)") |
| `/ebs/laporan` | Laporan EBS — kolom daftar ditambah, langkah 6 kini "Lampiran & Respon SIZE" |

Menu grup **Transaksi**: Form PE · Laporan EBS · **Entri Data Agregat** (`mod_laporan_ibs`, label & deskripsi baru) ·
**Form Individu** (`mod_laporan_individu`, baru, ikon Stethoscope). Diperbarui di `lib/menu.ts` **dan** di
`app_settings.navigation_menu` (migrasi 054, idempoten, backup `app_settings_bak_054`). Breadcrumb halaman baru: "Tambah Pasien".
Akses sama dengan laporan lain: lihat = `tatakelola` (`/ibs` sudah area tata kelola), simpan/kirim/hapus = `pe_input`.

## 1) Entri Data Agregat — kolom matriks
| Sebelum (PR 030) | Sesudah (PR 031) |
|---|---|
| No · Penyakit (nama + kode kecil di bawah) · Kasus · Kematian · Lab | **No · Kode SMS** (lencana ringkas) **· Kode Penyakit · Nama Penyakit · Jumlah Kasus · Jumlah Kematian · Jumlah Lab** — sama dengan tabel resmi |
- Label kolom kini nama resmi (*Jumlah Kasus / Jumlah Kematian / Jumlah Lab*) dengan petunjuk (tooltip) yang sama; versi ringkas dipakai di kartu ponsel & ringkasan Tinjau.
- Kolom identitas (No, Kode SMS, Kode Penyakit, Nama Penyakit) **menempel di kiri** saat tabel digulir ke samping; header menempel di atas, baris total di bawah.
- Baris terisi disorot (latar biru muda, lencana Kode SMS terisi penuh). Nama asli form lama tetap tampil kecil ("di form lama: Pnemonia").
- Cari: kata/kode seperti sebelumnya, ditambah **Kode SMS persis** (ketik `a` → hanya Diare Akut, `aa` → ISPA). Tetap ada "Hanya yang terisi", Enter/↑↓ pindah baris, total otomatis.
- **Total Kunjungan** tetap isian terpisah (bukan baris ke-25), kini di kartu berwarna "Total Kunjungan (baris X · TOTA)" dengan keterangan bahwa nilainya tidak ikut dijumlahkan.
- Info baru di langkah Data Kasus: "Terdapat N data Form Individu untuk unit ini pada Minggu m/tahun" (hanya informasi; angka agregat **tidak** diisi otomatis karena aturan sinkronisasi resmi belum diketahui).
- Daftar: judul "Entri Data Agregat", kolom Unit · Wilayah menampilkan **Petugas**; cari juga berdasarkan nama petugas. Indikator Tepat/Terlambat tetap tidak dibuat (aturannya belum ada).

## 2) Form Individu — langkah
1. **Unit & Periode** (Info Dasar) — Jenis Unit (*Id Unit*; biasanya Puskesmas) → Provinsi → Kab/Kota → Kecamatan (opsional) → Puskesmas/Unit (berjenjang, SearchSelect, input manual bila tidak ada di daftar), Nama Petugas (wajib), Telp Petugas (opsional, validasi format HP), Tahun & **Minggu Epid** (rentang tanggal + default minggu laporan berjalan). Isi otomatis dari Form Individu terakhir Anda + nama akun.
2. **Info Pasien** — Nama Pasien (wajib), No Epid, **Umur tahun/bulan/hari tanpa default 0** (kosong = belum diisi; minimal satu bagian, tidak boleh 0 semua; batas 0–150 th, 0–11 bl, 0–30 hr), Jenis Kelamin (wajib; Laki-laki (Pria)/Perempuan (Wanita)), Pekerjaan (14 opsi resmi), Alamat (≤ 500 karakter + penghitung).
3. **Penyakit** — Penyakit Agregat (wajib; 24 penyakit tabel agregat, tampil "A — Diare Akut", cari nama/kode SMS/kode penyakit; Total Kunjungan tidak termasuk), Tanggal Pemeriksaan (wajib, tidak di masa depan, Minggu Epid ditampilkan, **peringatan bila di luar minggu terpilih**), Status Akhir (*Akhir No*), Tanggal Meninggal (muncul & wajib hanya bila Status Akhir = Meninggal), Status Imunisasi, Keluhan Utama, Lama Sakit, ICD-X (satu isian teks opsional — tidak ada katalog ICD), Diagnosa (*Diagnosa 1*).
4. **Pemeriksaan** — Tinggi (cm), Berat (kg), **IMT dihitung otomatis** (terkunci bila tinggi & berat terisi; kategori ditampilkan di Tinjau), Suhu (°C), Sistole/Diastole (mmHg) — input angka dengan satuan, koma desimal diterima; **peringatan** (tidak memblokir) bila di luar rentang wajar atau diastole ≥ sistole. SOAP Subjective/Objective/Assessment/Planning (≤ 500 karakter + penghitung).
5. **Tinjau & Kirim** — sama dengan EBS/IBS (ringkasan per langkah, lompat ke isian belum valid, peringatan, kemungkinan duplikat).

Fitur bersama PR 030 berlaku: stepper "x/y wajib" + lencana belum valid + lompat, SearchSelect di semua pilihan,
autosave draf + cadangan lokal, konfirmasi tinggalkan halaman, laporan terkunci setelah dikirim, riwayat.
**Peringatan duplikat** (tidak memblokir): unit + nama pasien + tanggal periksa yang sama.

Daftar Form Individu: Nomor · Pasien (nama · L/P · umur) · Penyakit Agregat (+ "Meninggal") · Tgl Periksa · Periode (Minggu/Tahun + rentang) · Unit · Wilayah (+ petugas) · Status · Kelengkapan · Diperbarui · Aksi — pengganti 24 kolom resmi.

## 3) Laporan EBS
- **Daftar** (dulu 9 kolom): Nomor · **Tgl Laporan** · Penyakit Rumor (+ **Penyakit Terverifikasi** di bawahnya) · Tgl Rumor · Kasus / Mati (kematian > 0 merah) · Unit · Wilayah (+ jenis unit) · **Status Kejadian** (lencana) · **KLB** (Ya + status KLB saat ini / Tidak) · Status · Kelengkapan · Diperbarui · Aksi. Cari juga berdasarkan Penyakit Terverifikasi. No PE dan Respon Awal (7 Komponen) tidak dibuat — datanya tidak kita simpan.
- **Kelengkapan form** dibanding inventaris resmi (40 isian + 4 tab): semua isian Informasi Dasar & Informasi Penyakit sudah ada sejak PR 030. Yang ditambahkan: bagian **Respon SIZE** (hanya baca: ID Referensi SIZE, Diupdate oleh SIZE, Tanggal Update SIZE — "Belum ada respon dari SIZE") di langkah 6 yang kini bernama "Lampiran & Respon SIZE". Integrasi SIZE tidak dibuat.
- Label menu tetap "Laporan EBS"; tidak ada pemisahan Individu/Agregat untuk EBS (EBS sudah per kejadian).

## Backend (`services/backend-rust/src/laporan.rs`)
- `Jenis::Individu` (`individu`, tabel `laporan_ibs_individu`, nomor `IND-YYYY-######` dari `laporan_counters` — format 6 digit sama dengan EBS/IBS). Rute generik `/api/v1/laporan/:jenis…` dipakai ulang (tanpa rute baru; `main.rs`/`auth.rs` tidak berubah). Lampiran tetap hanya EBS. Tidak ada 409 satu-per-minggu untuk Individu.
- `validate_individu` (cermin `lib/laporan/individu.ts`) + helper bersama `periode` (Tahun/Minggu Epid, dipakai IBS agregat juga), `umur_text`, `dec` (desimal koma/titik).
- `GET /api/v1/laporan-ref/duplikat/individu?unit_key=&nama=&tgl=` → `sama` (duplikat lunak); `…&tahun=&minggu=` → `periode` (jumlah Form Individu per unit+minggu, untuk info di Entri Data Agregat).
- `prefill` menyimpan juga `hp_petugas`.
- Daftar: kolom tambahan per jenis dikirim sebagai objek JSON yang digabung ke tiap baris (kunci lama tetap ada): EBS + `penyakit_terverifikasi`, `status_kejadian`, `klb`, `klb_status`, `jenis_unit` (dari `data`); IBS + `petugas`; Individu `nama_pasien`, `kelamin`, `umur`, `penyakit`, `penyakit_label`, `tgl_periksa`, `status_akhir`, `diagnosa`, `petugas`.

## Database — migrasi `054_laporan_ibs_individu.sql` (+ `database/rollback/054_rollback.sql`)
Ringan: satu tabel baru + opsi + 1 update menu.
- `laporan_ibs_individu` — `data` jsonb + kolom ringkas (tahun, minggu, unit_key, unit_nama, provinsi, kab/kota, nama_pasien, kelamin, umur, penyakit, tgl_periksa, keluhan, diagnosa, status_akhir, pembuat, waktu, soft delete); indeks daftar, (unit_key, tahun, minggu), duplikat (unit_key, nama, tgl_periksa), pembuat.
- `laporan_opsi` kelompok baru: `pekerjaan` (14), `kelamin` (2), `status_imunisasi` (8), `status_akhir` (4) — nilai dari form resmi.
- `laporan_events.jenis` CHECK + `individu`.
- `app_settings.navigation_menu` — label Entri Data Agregat + item Form Individu.
Rollback menghapus tabel & draf Individu, opsi baru, event/counter `individu`, mengembalikan CHECK & menu.

## Belum / sengaja tidak dikerjakan
- **Analisa Data**; **Sinkronkan ke Data Agregat** (Individu → Agregat; aturan resmi belum diketahui); Upload E-PUSK, Export Excel, Diagram Alur, Test Format File, template; **Google Maps & Lat/Lng** (rusak di form resmi); **NIK** (hanya muncul di daftar resmi, kemungkinan dari unggahan E-PUSK); katalog ICD-X; pengiriman ke skdr.kemkes.go.id.
- Aturan wajib usulan yang perlu konfirmasi Kemkes: Jenis Kelamin, Umur, Penyakit Agregat, Tanggal Pemeriksaan, Puskesmas/Unit, Nama Petugas (form resmi tidak menandai isian wajib per field).
- EBS: opsi Sumber Informasi (15/32) dan Hasil Lab (15/44) masih belum lengkap (lihat PR 030); No PE & Respon Awal 7 Komponen tidak ditampilkan.

## Pengujian (lokal saja)
- `cargo test --release` (rust:1-bookworm): **38 lulus**, termasuk tes baru `laporan::tests::individu_rules` (wajib isi, umur 0/bulan/hari, penyakit di luar daftar, tanggal masa depan, Meninggal → Tgl Meninggal, HP, desimal koma, rentang & di luar minggu = peringatan) dan tes EBS/IBS lama. `cargo build --release` tanpa warning.
- `npx tsc --noEmit` (container frontend Node 20): 0 error.
- Migrasi 054 + rollback 054 dijalankan dalam satu transaksi `BEGIN … ROLLBACK` di Postgres lokal: tabel & 28 opsi terbentuk, menu Transaksi = Form PE · Laporan EBS · Entri Data Agregat · Form Individu, event `individu` diterima; rollback mengembalikan semuanya. **Migrasi belum diterapkan permanen** — terpasang otomatis saat backend dibangun ulang/di-restart.
- Belum diuji di browser (backend lokal belum dibangun ulang).

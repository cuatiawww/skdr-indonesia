# PR 033 — Pengawasan Gizi MBG (Formulir 1–13)

## Ringkasan
Modul baru **Transaksi › Pengawasan Gizi MBG** untuk kunjungan pengawasan standar gizi Makan Bergizi Gratis (MBG) ke SPPG oleh
Tenaga Pelaksana Gizi (TPG) Puskesmas. Satu **kunjungan** = identitas (diisi sekali) + 13 formulir dari naskah tim gizi
(MCI Team menyiapkan spreadsheet sumber). Pola UI sama dengan Form EBS/IBS/Individu: wizard berlangkah dengan stepper "n/m wajib",
lompat ke isian belum valid, autosave draf 1,5 detik + cadangan lokal, konfirmasi tinggalkan halaman, langkah **Tinjau & Kirim**,
mode lihat (`?mode=lihat`).

| Formulir | Isi | Aturan kesimpulan |
|---|---|---|
| 1 Ketenagaan | A.1 pendidikan pengawas gizi (7 baris), A.2 pelatihan (Belum/Sudah + sertifikat), B.1 pendidikan penjamah (5 baris + total), wilayah 3T + penerima manfaat, B.2 pelatihan penjamah (3 baris + 5 pelatihan lain + bukti) | A.1: ≥1 orang kualifikasi 1–6; A.2: pelatihan 1 dan 2 Sudah; B.1: total ≥ 47 (3T: <250→15, 250–500→18, 501–750→21, 751–999→25, ≥1000→47); B.2: sudah baris 1 ≥ 50% total B.1. Formulir Sesuai bila A, B.1, B.2 Sesuai |
| 2 Ketersediaan SOP | A: 7 SOP Sesuai/Tidak Sesuai; B: 8 SOP sosialisasi Sudah/Belum + 3 bukti (undangan/jadwal briefing, notulensi, daftar hadir) + Sesuai/Tidak Sesuai (saran otomatis) | Sesuai bila seluruh jawaban A dan B Sesuai |
| 3–8 Penerapan SOP | butir Sesuai/Tidak Sesuai per komponen (A/B/C) + keterangan | skor = sesuai / N × 100; Sesuai bila skor ≥ 80 |
| 9 Pemorsian | kelompok sasaran dinamis (dari tabel Standar Porsi/SP), butir × sasaran | butir Sesuai bila semua sasaran Sesuai; skor = butir sesuai / 6 × 100 ≥ 80 |
| 10 Daya Terima Anak Sekolah | header Nama Sekolah/Guru; butir 1–2 Sesuai/Tidak; butir 3–7 dari % sisa 5 ompreng | butir 3–7 Sesuai bila ≥ 3 dari 5 sampel sisa < 20%; skor /7 ≥ 80 |
| 11 Daya Terima Sasaran Posyandu | sama dengan F10, header Nama Posyandu/Kader | sama dengan F10 |
| 12 Rekap Ketaatan | hanya baca: kesimpulan F3–F9 yang sudah dikirim + keterangan | BAIK bila 7 aspek Sesuai, selain itu BELUM BAIK |
| 13 Rekap Daya Terima | hanya baca: kesimpulan F10–F11 | BAIK bila 2 aspek Sesuai |

Setiap formulir checklist: keterangan **wajib** bila Tidak Sesuai; Rekomendasi 1 wajib bila ada butir Tidak Sesuai (teks petunjuk naskah
"Lakukan perbaikan pada : …"). Skor dan kesimpulan dihitung otomatis (klien untuk umpan balik langsung, server sebagai penentu saat Kirim).

## Keputusan naskah (perbaikan salin-tempel / tafsir)
1. **F4**: tiga baris "1.2./1.1./1.2. Cara perhitungan kebutuhan bahan pangan mempertimbangkan spesifikasi bahan pangan" adalah duplikat — tidak dimasukkan; 13 butir unik, pembagi 13 (sesuai rumus naskah).
2. **F5 butir 3**: "Pokopk" → "Pokok".
3. **F7**: 5 butir sehingga pembagi /5 (naskah menulis /4); judul kesimpulan "Penyimpanan Bahan Pangan" → "Persiapan Bahan Pangan"; foto diunggah per butir.
4. **F11**: "dokumen uji organoleptik di sekolah … tervalidasi guru" → "di Posyandu … tervalidasi kader"; kolom "Baik / Kurang" → "Sesuai / Tidak Sesuai" (sama dengan butir dan rumus skornya).
5. **F13**: "sudah apabila nomor 1 sd 2…" dibaca "baik" (pilihan kesimpulan BAIK/BELUM BAIK).
6. **F9**: naskah "sesuai apabila sasaran 1,2 dan 3 sesuai" → butir Sesuai bila **semua** kelompok sasaran yang diamati Sesuai; jumlah sasaran tidak dikunci 3 (boleh 1–n). Skor tetap per butir (/6).
7. **F1 A.1**: baris 7 "Lainnya" tidak dihitung sebagai kualifikasi (catatan naskah "kualifikasi 1/2/3/4/5/6"); bila diisi > 0 jenis pendidikan wajib ditulis.
8. **F1 B.1 3T** ≥ 1000 penerima manfaat tidak diatur naskah → ambang 47 (umum). **B.2** penyebut 50% = total B.1 (cadangan: belum + sudah baris 1 bila B.1 belum lengkap); peringatan bila belum + sudah ≠ total B.1.
9. **F2 B**: kesesuaian tetap dipilih petugas; sistem menampilkan *saran* (Sesuai hanya bila Sudah sosialisasi + 3 bukti lengkap) dan peringatan bila dipilih Sesuai berlawanan dengan saran.
10. **F3 catatan alergi** ("tidak masuk dalam penilaian"): pertanyaan Ya/Tidak di langkah Kesimpulan, bila Ya jenis alergi & penanganannya wajib. Tidak memengaruhi skor.
11. **Identitas**: Nama TPG terisi dari akun login (boleh diubah); Puskesmas/wilayah terisi dari kunjungan terakhir pengguna. Field naskah "Puskesmas Asal" = "Puskesmas".

## Alur & aturan
* Kunjungan baru **tidak** dibuat sebelum identitas valid (atau pengguna menekan *Simpan Draf*) — tidak ada draf kosong misterius. Nomor `MBG-YYYY-000001` (laporan_counters jenis `mbg`).
* Formulir disimpan per kunjungan (`mbg_form`, satu baris per nomor formulir, `data` JSONB + `schema_version`). Formulir baru tidak membuat baris sampai disimpan.
* Kirim formulir → terkunci; **Buka kembali** selama kunjungan masih draf (rekap F12/F13 yang bergantung ikut dibuka). Rekap draf disegarkan otomatis saat formulir sumber berubah.
* **Kirim kunjungan** hanya bila identitas valid dan 13 formulir terkirim. **Hapus draf** (soft delete) dari daftar atau halaman kunjungan.
* Lampiran (bukti dokumen/foto) per formulir dan per butir (F7), maks. 5 MB, tipe sama dengan lampiran laporan EBS.
* Akses: baca `tatakelola`, tulis `pe_input` (pola sama dengan `/api/v1/laporan`). Tidak ada pengiriman ke skdr.kemkes.go.id.

## Rute
Frontend (basePath `/skdr`): `/pengawasan-gizi` (daftar), `/pengawasan-gizi/baru`, `/pengawasan-gizi/[id]` (halaman kunjungan),
`/pengawasan-gizi/[id]/identitas`, `/pengawasan-gizi/[id]/f1` … `/f13`; `?mode=lihat` = hanya baca.

API:
| Metode | Path | Keterangan |
|---|---|---|
| GET | `/api/v1/pengawasan-gizi?status=&search=&page=&per_page=` | daftar + `by_status`, kemajuan formulir, rekap F12/F13 |
| POST | `/api/v1/pengawasan-gizi` | buat kunjungan `{data}` (identitas) |
| GET/PUT/DELETE | `/api/v1/pengawasan-gizi/:id` | detail (identitas, ringkasan 13 formulir, riwayat) / ubah identitas / hapus draf |
| POST | `/api/v1/pengawasan-gizi/:id/kirim` | 422 bila identitas belum valid / formulir belum terkirim |
| GET/PUT | `/api/v1/pengawasan-gizi/:id/form/:no` | ambil / simpan draf formulir 1–13 (respons `{kunjungan, form, lampiran}`) |
| POST | `/api/v1/pengawasan-gizi/:id/form/:no/kirim` | 422 bila ada isian belum valid |
| POST | `/api/v1/pengawasan-gizi/:id/form/:no/buka` | buka kembali formulir terkirim |
| POST | `/api/v1/pengawasan-gizi/:id/lampiran?form=&item=&nama=&judul=` | unggah (body mentah) |
| GET/DELETE | `/api/v1/pengawasan-gizi/:id/lampiran/:lid` | unduh / hapus |
| GET | `/api/v1/pengawasan-gizi-ref/prefill` | Nama TPG (akun) + wilayah/puskesmas kunjungan terakhir |

## Migrasi
`database/init/055_pengawasan_gizi_mbg.sql` (otomatis saat backend start): tabel `mbg_kunjungan`, `mbg_form` (UNIQUE kunjungan+form_no,
`schema_version`, skor DOUBLE PRECISION, kesimpulan), `mbg_lampiran`; CHECK `laporan_events.jenis` + `'mbg'`; menu
`mod_pengawasan_gizi` ditambahkan ke grup Transaksi di `app_settings.navigation_menu` (cadangan `app_settings_bak_055`, idempoten).
Rollback: `database/rollback/055_rollback.sql` (menghapus data pengawasan gizi!).

## File
* Backend: `services/backend-rust/src/pengawasan_gizi.rs` (baru, + 7 unit test), `main.rs` (mod + rute), `auth.rs` (izin + test), `laporan.rs` (`LAMPIRAN_TIPE` publik).
* Frontend: `lib/pengawasan-gizi/{naskah,rules,forms,api}.ts`, `components/pengawasan-gizi/{MbgWizard,MbgFields,MbgList,MbgHub}.tsx`,
  `app/pengawasan-gizi/**`, `lib/menu.ts`, `lib/access.ts`, `components/layout/Breadcrumbs.tsx`, `lib/laporan/engine.ts` (tipe `mbg`, `stepStats` menerima `{steps}`),
  `components/laporan/LaporanWizard.tsx` (`Stepper` diekspor, tanpa perubahan perilaku).

## Belum termasuk
* Dasbor Analisa Data pengawasan gizi (sengaja tidak dibuat).
* Tanda tangan/cetak PDF formulir; impor dari spreadsheet.
* Opsi Puskesmas mengikuti master unit yang ada (bisa diketik manual bila belum ada).

## Pengujian
* `cargo test` — 45 lulus (7 baru: identitas_rules, checklist_score_and_kesimpulan, daya_terima_samples, pemorsian_dynamic_sasaran,
  ketenagaan_rules, sop_rules, rekap_rules; + kasus izin pengawasan-gizi di auth). `cargo build` tanpa warning.
* Paritas aturan klien (`rules.ts`) vs server diuji dengan kasus yang sama (skor F4 84,6; F7 80; F10 85,7; F9 83,3; ambang 3T; B.2 50%; saran F2; rekap BAIK/BELUM BAIK).
* `tsc --noEmit` 0 error; `next build` sukses (rute `/pengawasan-gizi`, `/baru`, `/[id]`, `/[id]/[form]`).
* Rebuild Docker `skdr-backend-rust`: log `applied migration 055_pengawasan_gizi_mbg.sql` → `listening on 0.0.0.0:8091`; menu `mod_pengawasan_gizi`
  ada di grup Transaksi; rollback 055 diuji dalam BEGIN…ROLLBACK (tabel & menu hilang, lalu dibatalkan). Tanpa login: API 401, halaman 307 → /login.
* Smoke API end-to-end (DB uji terpisah, migrasi 001–055 dari nol): buat/ubah identitas, 422 kirim dini, simpan + kirim F1–F11, rekap F12/F13
  (BELUM BAIK → BAIK setelah perbaikan), buka kembali (rekap ikut draf), 409 ubah formulir terkirim, unggah/tolak/hapus lampiran, daftar, kirim kunjungan,
  409 hapus kunjungan terkirim, hapus draf (404 sesudahnya), 404 formulir 14.
* UI (Playwright 1440×900 + 390×844): daftar, kunjungan baru (tidak membuat draf saat identitas belum valid; Simpan Draf membuat draf), halaman kunjungan,
  F1/F2/F4/F9/F10/F12, mode lihat; autosave F4/F9 tersimpan; 0 error konsol.

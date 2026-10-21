# PR 009 — Form PE Avian Influenza (Flu Burung) H5N1 v1

## Ringkasan
Skema `database/pe/ai.v1.json` (dari `scripts/pe/build_ai.py`, sheet "Form PE Avian Influenza - Spesi": 107 baris field, 7 langkah, 86 key), migrasi `018_pe_form_ai.sql` (definisi v1, penyakit AVIAN_INFLUENZA, submenu "Avian Influenza", ikon Globe2) + rollback `database/rollback/018_rollback.sql`.

## Tambahan engine (Rust `pe_engine.rs` + mirror TS `lib/pe-engine.ts`)
- Kondisi `daysBeforeGt {ref, days}`: tanggal lebih dari N hari sebelum tanggal acuan (peringatan kontak > 7 hari sebelum sakit).
- Derive `days_since_latest {table, col, where, to}`: masa inkubasi = Tgl mulai sakit − kontak terakhir dengan hewan **sakit/mati** (baris 76).
- Tabel `maxRowsRef {ref, minus}`: jumlah baris ≤ Jumlah anggota serumah − 1 (baris 105).
- Catatan deploy: perubahan engine Rust memerlukan `docker compose up -d --build skdr-backend-rust` (restart saja tidak membangun ulang).

## Logika
- Gejala minimal 1; peringatan bila tidak ada demam + ≥ 1 gejala napas (teks sheet).
- Pemeriksaan penunjang (angka bulat dengan batas sheet), Riwayat Berobat = tabel; Tanggal pertama berobat = min tanggal masuk (otomatis); tanggal keluar hanya untuk rawat inap.
- Spesimen = tabel; jenis pemeriksaan & hasil mengikuti jenis spesimen/pemeriksaan; tgl periksa wajib bila hasil bukan "Belum keluar".
- Kontak hewan, kontak sehari-hari, kontak pneumonia, penderita gejala sama, anggota keluarga berisiko = tabel berulang; hewan di rumah/peternakan/pasar: "Tidak ada" eksklusif.
- Klasifikasi: **konfirmasi** (Positif H5N1 / serologi positif) > **probable** (kriteria suspek + foto paru abnormal atau meninggal) > **suspek** (demam ≥ 38°C + ≥ 1 gejala napas + pajanan: unggas/babi sakit/mati, kunjungan daerah wabah, kontak pneumonia, kontak sehari-hari, atau kontak kasus probable/konfirmasi) > tidak memenuhi. Definisi probable adalah penyederhanaan (sheet tidak mendefinisikan) — perlu konfirmasi tim.

## Deviasi
| Baris | Sheet | Implementasi |
|---|---|---|
| 10 | auto-fill tanggal hari ini | tidak auto-fill (Rekomendasi + instruksi) |
| 68 | jenis "Lainnya" → "Positif" tidak ada di daftar | opsi "Positif" ditambahkan |
| 102 | "Kolom lain sama dengan tabel pneumonia" | kolom tabel pneumonia dipakai ulang |
| 109–111 | sumber informasi | tabel berulang opsional |
| 52,63,65,18,19,32,33 | dropdown master | teks (master belum tersedia) |

## Uji
- Rust unit `ai_classification_incubation_and_rows` PASS (6/6 total).
- API test ai PASS (masa inkubasi 3 hari, klasifikasi suspek, workflow, override, masking); antraks/rabies/lepto PASS setelah rebuild backend.
- tsc OK; /pe/ai, /baru, /:id 200; smoke PASS. Screenshot ditinjau (diambil sebelum rebuild backend; tampilan tidak bergantung pada derive baru): docs/screenshots/skdr-pe-ai-*.png.

# PR 008 — Form PE Antraks v1

## Ringkasan
Form PE Antraks dibangun di engine PE (PR 006): skema `database/pe/antraks.v1.json` (dari `scripts/pe/build_antraks.py`, sheet "Form PE Antraks - Spesifikasi": 86 baris field, 5 langkah, 87 key), migrasi `017_pe_form_antraks.sql` (definisi v1, penyakit ANTHRAX, submenu "Antraks", ikon Flame) + rollback `database/rollback/017_rollback.sql`.

## Logika
- Kelainan kulit / gangguan cerna / gangguan napas = Ya → gejala terkait tampil.
- Lab = tabel berulang (Nama lab, Jenis pemeriksaan, Spesimen, Tgl ambil ≤ Tgl kirim, Hasil); pilihan hasil mengikuti jenis pemeriksaan (PCR: Terdeteksi/Tidak Terdeteksi; Kultur: Ditemukan/Tidak Ditemukan Bakteri; Elisa: Reaktif/Non-Reaktif).
- Kontak hewan sakit/mati = Ya → tanggal kontak (≤ tgl mulai sakit), lokasi, aktivitas wajib (rekomendasi sheet).
- Kontak orang bergejala sama = tabel berulang; Rumor = Ya → klaster wajib (rekomendasi sheet).
- Tanggal meninggal wajib bila Meninggal; ≥ mulai sakit, ≥ lahir, ≤ hari ini (rekomendasi sheet menggantikan rantai tanggal yang keliru).
- Klasifikasi otomatis: **konfirmasi** (lab positif) > **probabel** (gejala klinis kulit/cerna/napas + kaitan epidemiologis: kontak hewan sakit/mati, produk hewan, atau kontak kasus probabel/konfirmasi) > **suspek** (gejala klinis) > tidak memenuhi; status manual dibandingkan, override dengan alasan (engine PR 006). Peringatan: status Konfirmasi tanpa lab positif.

## Deviasi / koreksi sheet
| Baris | Sheet | Implementasi |
|---|---|---|
| 44 | label Field sama dengan baris 43 | label "Gejala Kelainan Kulit" (dari teks visibilitas baris 43) |
| 44 | penomoran "2.Ruam", "3 Ruam" | nomor dibuang (parser `split_options` kini toleran pada daftar bernomor; skema Lepto/Rabies tidak berubah, diverifikasi byte-identik) |
| 62 | kondisi "ELISA" | opsi sheet "Elisa" dipakai |
| 63 | — | ditambah opsi "Belum dapat ditentukan" (Hasil Review) |
| 65 | "If lainnya" tanpa opsi Lainnya | ditambah opsi "Lainnya" + isian teks |
| 70 | "Ya/Tidak" (tanpa spasi) | opsi Ya, Tidak |
| 18,19,32,33,52,57 | dropdown master kecamatan/sarana/lab | teks (master belum tersedia) |
| 49 | typo "Sesak nafa", "Sakit kelapa hebat" | dipertahankan verbatim |

## Uji
- Rust unit `antraks_classification` PASS (6/6 total).
- API test antraks PASS (klasifikasi probabel, workflow, override, masking); regresi lepto/rabies PASS.
- tsc OK; /pe/antraks, /baru, /:id 200; smoke PASS.
- Screenshot ditinjau: docs/screenshots/skdr-pe-antraks-{list,new,step1,step2,final}.png.

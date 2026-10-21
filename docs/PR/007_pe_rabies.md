# PR 007 — Form PE Rabies/GHPR v1

## Ringkasan
Form PE Rabies/GHPR dibangun di atas engine PE (PR 006), sepenuhnya config-driven: skema `database/pe/rabies.v1.json` (dihasilkan `scripts/pe/build_rabies.py` dari sheet tracker, 95 baris spesifikasi, 6 langkah, 105 key), migrasi `016_pe_form_rabies.sql` (definisi form v1 + submenu "Rabies/GHPR" di grup FORM PE) dengan rollback `database/rollback/016_rollback.sql`.

## Logika
- Tanggal onset, gejala prodromal & neurologis wajib kecuali status = GHPR (requiredIf).
- Field gigitan (baris 41–43) wajib jika digigit = Ya; VAR/SAR hanya tampil jika digigit.
- Tanggal meninggal wajib jika "Meninggal" (≥ onset, ≥ tanggal lahir, ≤ hari ini).
- Lab tunggal (sesuai sheet); "Orang digigit" = tabel berulang.
- Kategori luka diturunkan (first_match): Kelelawar → Kategori 3; gigitan/cakaran menembus kulit → Kategori 3; tidak menembus → Kategori 2; jilatan → Kategori 1.
- Klasifikasi: konfirmasi (lab Positif) > klinis (digigit + gejala neurologis) > ghpr (digigit) > tidak_memenuhi; butuh digigit terisi.
- Peringatan: status GHPR dengan digigit = Tidak; status Konfirmasi tanpa lab positif; SAR = Ya dengan VAR = Tidak.

## Deviasi / koreksi sheet
| Baris | Sheet | Implementasi |
|---|---|---|
| 96 | visibilitas "Ya" | memakai "Tidak" (logika sheet terbalik) |
| 101 | tampil jika "ya" | tampil jika "Meninggal" |
| 49 | teks visibilitas salin-tempel | diabaikan |
| 72 | tanpa opsi | teks bebas |
| — | "Ketegori 1" | "Kategori 1" |
| — | opsi huruf kecil "tidak"/"lainnya" | dinormalisasi |
| — | typo label "Gigihat", "permbeian", "satum" | dipertahankan verbatim |

## Perubahan lain
- `pe_core.py` helper tambahan; `pe_engine.rs` test rabies (klasifikasi + kategori luka); `pe-api.ts` CLASS_STYLE klinis/ghpr.
- `pe_api_test.py`: kode override per form (rabies → `ghpr`, sebelumnya hardcode `suspek` yang bukan kelas rabies → 400 yang benar).

## Uji
- Rust unit 4/4 PASS; migrasi 016 terterapkan; menu Form PE = [Leptospirosis, Rabies/GHPR].
- API test rabies 29/29 PASS (kategori luka Kategori 3, klasifikasi klinis); regresi lepto PASS.
- tsc OK; /pe/rabies, /pe/rabies/baru, /pe/rabies/:id, /pe/lepto, main-dashboard 200; smoke PASS.
- Screenshot: docs/screenshots/skdr-pe-rabies-{list,step1,step2,final,new}.png, skdr-sidebar-form-pe.png.

## Rollback
`database/rollback/016_rollback.sql`.

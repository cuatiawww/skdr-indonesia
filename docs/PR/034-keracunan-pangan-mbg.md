# PR 034 — Keracunan Pangan MBG (laporan cepat + wizard 6 langkah)

## Ringkasan
New module **Transaksi › Program MBG › Keracunan Pangan MBG** (`/keracunan-mbg`). It records food-poisoning incidents from the
Makan Bergizi Gratis programme. Basis: the official form **skdr.kemkes.go.id/form-mbg**, which has 113 fields in 6 tabs, only 4 of them
required. The study was read-only: nothing was submitted on the live site.

The **Program MBG** menu now groups two sub-menus: *Pengawasan Gizi MBG* (PR 033) and *Keracunan Pangan MBG*.

## Before vs. after vs. official

| Aspect | Official form-mbg (Kemkes) | Before (SKDR Indonesia) | After (PR 034) |
|---|---|---|---|
| Report entry | 6 long tabs, 113 fields, one form | — (module did not exist) | 6-step wizard: **Laporan Cepat → Kasus & Gejala → Menu & Penanganan → Kesehatan Lingkungan → Laboratorium → Lampiran & Kirim** |
| Fast reporting | Must open every tab | — | **Kirim Laporan Cepat** from step 1 with only 4 required fields (date & time of incident, province, cases, deaths); the rest can be completed later |
| Attack rate / CFR | Calculated by hand | — | Automatic: AR = cases ÷ exposed (or ÷ total school portions when *Jumlah terpapar* is empty), CFR = deaths ÷ cases |
| Incubation | Typed by hand | — | Suggested from meal time → first symptom time (hours), one click to apply |
| Symptoms | 18 options + separate number | — | Checkbox + case count + % of cases; "other symptom" can be added |
| 26 SOPs | Dropdown + row-by-row choice | — | All 26 shown as fixed rows with **Ada/Tidak Ada** and **Dilakukan/Tidak Dilakukan** buttons; counters; "mark all" |
| Cross-checks | None | — | Sex sum, age sum, inpatient + outpatient + recovered + deaths ≠ cases → *warning* (non-blocking); any sub-count > cases, deaths > cases, exposed < cases, future date, symptom time before meal time → *error* |
| SPPG | Typed by hand | — | Autocomplete from earlier poisoning reports + Pengawasan Gizi visits (yayasan/kode/wilayah filled in automatically); the latest Pengawasan Gizi visit result for the same SPPG is shown on the summary |
| Incident progress | One report | — | **Update Harian**: cumulative counts per date (upsert per date), history table + chart, the latest update becomes the incident total; deleting an update recalculates totals (initial figures are restored when every update is deleted) |
| Status | — | — | **Draf → Dilaporkan → Menunggu Lab → Hasil Lab → Ditutup** (*Menunggu Lab/Hasil Lab* are derived from the Laboratorium entries); close with a conclusion + cause; reopen |
| Differential diagnosis | Free text | — | Free text + **suggestion** chips (clearly labelled as suggestions, not a diagnosis) from symptom pattern + incubation |
| Export | — | — | CSV (UTF-8 BOM, protected against formula injection) following the list filters |

## Decisions / deviations
1. **Light schema**: 3 tables (`mbg_keracunan`, `mbg_keracunan_update`, `mbg_keracunan_lampiran`). Row-shaped details (schools, symptoms, SOP, water sources,
   processing/portioning/distribution/serving schedules, lab samples) are stored as JSONB arrays in `data`, not as separate child tables. Summary columns (date, area, SPPG,
   cases, deaths, exposed, lab_status) are denormalised for the list, filters and CSV.
2. **Stored status** is `draf/dilaporkan/ditutup`; *Menunggu Lab* = there are samples / a pick-up or dispatch date; *Hasil Lab* = there is a result date or a Positif/Negatif result.
3. **Sending (Kirim)** is rejected (422) while any field is invalid. Only the 4 step-1 fields are required; other steps only need to be *valid*. After Dilaporkan the
   report may still be edited, but only when every field is valid (otherwise 422, and the wizard keeps the changes locally and shows a message). A closed (Ditutup) report cannot be changed until it is reopened.
4. **Official form mapping**: the two school tables (field 17–22 + organoleptic/CTPS) are merged into one `sekolah` row; mikro/kimia (+)/(−) counts are entered per sample as
   Positif/Negatif/Belum; official field 102 is relabelled "Ada pencatatan limbah sisa makanan harian"; serving organoleptic/advice items are Ya/Tidak.
5. **There is no SPPG master** in the project, so SPPG suggestions come from earlier reports + `mbg_kunjungan`.
6. Report number `KPM-YYYY-NNNNNN` (laporan_counters jenis `kpm`); events go to `laporan_events` (jenis `kpm`).
7. Access: read = `tatakelola`, write = `pe_input` (same as Pengawasan Gizi). `enforce_roles` unchanged.

## API
`GET/POST /api/v1/keracunan-mbg` · `GET /api/v1/keracunan-mbg/export` · `GET/PUT/DELETE /api/v1/keracunan-mbg/:id` ·
`POST /:id/kirim` · `POST /:id/tutup` `{kesimpulan, penyebab}` · `POST /:id/buka` · `POST /:id/harian` · `DELETE /:id/harian/:uid` ·
`POST /:id/lampiran?kategori=umum|lab|gejala` · `GET/DELETE /:id/lampiran/:lid` · `GET /api/v1/keracunan-mbg-ref/prefill` · `GET /api/v1/keracunan-mbg-ref/sppg?q=&kabkota_id=`

## Database
`database/init/056_keracunan_pangan_mbg.sql` (+ `database/rollback/056_rollback.sql`): 3 tables, `laporan_events` CHECK gets `kpm`, menu backup in
`app_settings_bak_056`, and `mod_pengawasan_gizi` in `grp_transaksi` is replaced by `mod_program_mbg` (subItems Pengawasan Gizi + Keracunan Pangan). Idempotent.
Apply → rollback → re-apply was tested on a test DB.

## Verification
* `cargo test`: 50 passed (5 new keracunan tests + classify route test); `cargo build` has no warnings.
* `tsc --noEmit` 0 errors; `next build` OK; the TS rules (`lib/keracunan-mbg/rules.ts`) were checked against the same fixtures as the Rust tests.
* End-to-end API smoke test on a test DB: draft → kirim (422 when invalid) → daily update → samples (Menunggu Lab) → results (Hasil Lab) → lab attachment → tutup (edit 409) → buka → CSV export → SPPG suggestions.

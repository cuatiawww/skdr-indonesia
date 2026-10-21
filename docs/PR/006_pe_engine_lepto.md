# PR 006 — PE form engine (shared core) + Form PE Leptospirosis

Date: 2026-10-21 · Git: local only · Approved by Yosua (via parent request 11:15 WIB): 4 PE forms, Lepto first.

## Source
- Tracker spreadsheet (Drive), sheet **"Form PE Leptospirosis - Spesifi"**. Rows are extracted verbatim to `docs/pe-spec/lepto.json`
  (also `rabies.json`, `antraks.json`, `ai.json` for the next PRs). Review basis: `review-spreadsheet.md` (FHI/Reconstra notes).
- `scripts/pe/build_lepto.py` builds the form schema: **label, field type, options and required status are read from the sheet row**;
  the module only adds keys, visibility, validation rules and classification. The build fails if any spec row with a field type is not
  mapped (127 rows mapped, 107 keys). Every field carries its sheet row number (`row`) for traceability.
- `scripts/pe/emit_sql.py` writes the migration that loads `database/pe/lepto.v1.json`.

## Architecture (one engine, config-driven, versioned)
- `pe_form_definitions(form_key, version, schema jsonb)` — a PE keeps the `form_version` it was created with. A new version = new row.
- Schema = steps (pages) → sections → fields. Types: text, textarea, number, date, select, multiselect, province, kabkota (depends on
  province), cluster, ebs, auto (derived), table (repeatable child rows), cluster_monitoring, info.
- Condition language (same in Rust `pe_engine.rs` and TS `lib/pe-engine.ts`): `{f,eq}`, `{f,in}`, `{f,has}`, `{f,hasAny}`, `{f,filled}`,
  `all/any/not`, `{rows:table, any:cond}`, `{count:[…], gte:n}`. Used for visibility, `requiredIf`, `optionsIf`, warnings, classification.
- Validation: required (only when visible), options (incl. dependent option lists), "Lainnya → Jika lainnya, sebutkan", min selections,
  exclusive option ("Tidak ada …"), digits/length (NIK 16, No. Epid 11, phone 10–13 / 11–13), number range/decimals, cross-field
  number rules (N2 ≤ N1 … N8+N9 ≤ N7), date order (`≤ hari ini`, `≥ Tanggal Mulai Sakit`, …), table rows validated per row.
  Server-only checks: kab/kota belongs to the chosen province, cluster exists, EBS id exists in synced EBS data.
- Derived (stored static on save): No. PE (`PE-LEP-2026-000001`, per form/year counter), Umur tahun/bulan/hari, Tanggal pertama berobat
  (= earliest Tanggal masuk in Riwayat Berobat).
- Classification computed by the server from the schema rules; officer can correct it **with a reason** (logged). Option
  "Tidak memenuhi definisi kasus" exists as fallback.
- Workflow `app_settings.pe_workflow`: draf → dikirim → terverifikasi → final, plus dikembalikan (return for revision, note required).
  Sending/verifying/finalising requires 0 validation errors. Editable only in draf/dikembalikan. No login: role comes from the optional
  `X-SKDR-Role` header (hook), `enforce_roles=false` until login exists. Every status/classification change → `pe_case_events`.
- Clusters `pe_clusters` (KL-LEP-2026-000001): name, wilayah, tanggal rumor, lokasi, status aktif/selesai, `monitoring` jsonb.

## Leptospirosis specifics
- 7 pages as in the sheet (Identitas · Klinis & Lab · Lingkungan & Kontak · Kebiasaan · Pemantauan KLB · Kondisi akhir · Tim PE).
- Repeatable tables: Riwayat Berobat, Pemeriksaan Laboratorium, Penderita dengan gejala sama, Tim PE.
- Lab dropdown conditions from the sheet: Jenis pemeriksaan by Jenis spesimen; Hasil by Jenis pemeriksaan; Titer MAT/Serovar only for MAT
  positif; Tanggal hasil wajib when Hasil ≠ "Belum keluar".
- Warnings (non-blocking) from the sheet: Status "Konfirmasi" without a confirming lab result; Gejala without "Demam akut"; plus
  "Status Laporan differs from system classification".
- Classification (Buku Saku 2022 hlm. 16-17 as cited in the review), evaluated top-down:
  - **Konfirmasi**: MAT positif, PCR terdeteksi or kultur tumbuh Leptospira.
  - **Probable**: suspek + (≥2 of nyeri betis, ikterik, perdarahan, batuk darah, anuria/oliguria, aritmia) or RDT/ELISA IgM positif.
  - **Suspek**: (demam akut or nyeri kepala) + (mialgia, malaise or conjunctival suffusion) + any 2-week exposure answered "Ya"
    (banjir, got, sawah, genangan, sungai, tikus, hewan, tempat kerja).
  - otherwise **Tidak memenuhi definisi kasus**; "Belum dapat ditentukan" while Gejala umum is empty.

## Deviations from the sheet (all requested or recommended in the review)
| Sheet | Implemented | Why |
|---|---|---|
| Tanggal Laporan auto-fill today | not auto-filled; hint "isi sesuai tanggal laporan diterima"; ≥ Tgl Rumor, ≤ hari ini | Yosua's instruction / review (7-1-7 bias) |
| Umur from Tanggal Lahir and today | from Tanggal Lahir to Tanggal Mulai Sakit (fallback Tanggal Laporan), stored static | Yosua's instruction |
| Tanggal PE rules | + Tanggal PE ≥ Tanggal Laporan | review recommendation |
| Status Laporan manual only | kept (sheet field) + system classification + override with reason | Yosua's instruction / review |
| Link No. EBS required | required, but answer "Tidak berasal dari EBS" allowed; lookup in synced EBS data | review |
| N1–N9 on every PE (page 5) | stored once per cluster (`pe_clusters.monitoring`), edited from the linked cluster; PE keeps the screening question | Yosua's instruction / review (double counting) |
| Kecamatan, Kelurahan, Unit Pelapor, Nama fasyankes, Laboratorium dropdowns | free text | no kecamatan/kelurahan/facility/lab master in SKDR yet (Yosua: kecamatan as text) |
| APD question row 109 ("satu kolom APD untuk masing-masing dari 2 pertanyaan") | two fields with the same label + hint naming the question | sheet text |
Review recommendations that would **add** fields (suhu tertinggi, nyeri kepala hebat, sesak napas, ruam, "masih dirawat") are not added,
because fields must match the sheet; they can be added as form version 2.

## Database
- `014_pe_engine.sql` (rollback `014_rollback.sql`): pe_form_definitions, pe_counters, pe_clusters, pe_cases (data jsonb + indexed columns
  for list/dashboard: dates, wilayah, classification, outcome …), pe_case_events, `app_settings.pe_workflow`, menu group **FORM PE**
  (order 2; MASTER DATA moved to order 3).
- `015_pe_form_lepto.sql` (generated; rollback `015_rollback.sql`): Lepto v1 definition + submenu "Leptospirosis" (/pe/lepto).

## API
`GET /api/v1/pe/forms` · `GET /api/v1/pe/forms/:key` (schema + workflow + today) · `GET /api/v1/pe/cases?form&status&classification&search&page`
(patient as initials, no NIK) · `POST /api/v1/pe/cases` · `GET|PUT /api/v1/pe/cases/:id` · `POST /api/v1/pe/cases/:id/status {to,note}` ·
`PUT /api/v1/pe/cases/:id/classification {code,reason}` · `GET|POST /api/v1/pe/clusters` · `PUT /api/v1/pe/clusters/:id` · `GET /api/v1/pe/ebs-search`.

## Frontend
- Menu FORM PE → Form PE → Leptospirosis (from DB). `/pe/[form]` list (status chips with counts, classification filter, search, pagination,
  tab Klaster/KLB), `/pe/[form]/baru`, `/pe/[form]/[id]`. Generic for all PE forms.
- Editor: 7-step stepper with per-step issue count, progress bar (required answers filled), inline validation (on blur / when leaving a
  step), autosave 1,5 s after typing (draft created on first save, No. PE assigned then), Provinsi → Kab/Kota pickers, chips for
  multi-select, repeatable rows, side panel with classification (+ correction), warnings, workflow buttons, history. Full width, Bahasa
  Indonesia (`skdr.pe.*` keys in id/en).

## Tests (2026-10-21)
- Rust unit tests (box): age calculation, Lepto classification (suspek / tidak memenuhi / probable A / probable B / konfirmasi),
  validation rules (NIK, phone, dates, exclusive option, lab dropdown condition, Tanggal hasil wajib, hidden fields skipped): 3/3 PASS.
- `scripts/pe/pe_api_test.py http://localhost:8091 lepto`: 32/32 PASS (draft, No. PE, no auto-fill, kab/kota ↔ province, 422 on
  incomplete send, 409 on invalid transition / edit after send / override on final, complete data 0 errors, age stored, classification
  konfirmasi, manual-vs-system warning, full workflow incl. dikembalikan with note, override with reason + event, cluster N1–N9 rules 422
  and valid save, PE linked to cluster, list masks names and has no NIK).
- tsc OK; pages /pe/lepto, /pe/lepto/baru, /pe/lepto/:id 200; smoke PASS; master round trip PASS; screenshots
  `docs/screenshots/skdr-pe-lepto-*.png`, `skdr-sidebar-form-pe.png`.
- Test rows left in place (synthetic, "UJI PR006 …"): PE-LEP-2026-000001 (final), PE-LEP-2026-000002 (draf), cluster KL-LEP-2026-000001.

## Open points (need Timker/Yosua decision)
- Keep "Probable" for Lepto (sheet has it; dashboard spec only knows suspek/konfirmasi).
- Facility/lab/kecamatan/kelurahan masters (fields are free text until then).
- PE data is not yet shown on the main dashboard (separate PR).

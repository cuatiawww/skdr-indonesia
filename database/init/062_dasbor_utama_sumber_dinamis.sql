-- PR 041: Dasbor Utama mengikuti Sumber (EBS / IBS) di semua seksi.
-- * dash_ibs_cases.status = 'terverifikasi' bila alert IBS asalnya terverifikasi (Alert SKDR lama: sts_verif), selain itu
--   'dikirim' - kartu "Kasus IBS terverifikasi" di Ringkasan tidak lagi selalu 0.
-- * app_settings.dashboard_executive.texts: catatan kaki dipisah per sumber (footnote = EBS, footnote_ibs = IBS).
-- * skdr_nsum (COMBINEFUNC) dan skdr_unit_ok dibuat PARALLEL SAFE: kueri agregat kasus IBS bisa paralel (~4-8x lebih cepat).
-- Rollback: database/rollback/062_rollback.sql
BEGIN;

CREATE OR REPLACE AGGREGATE skdr_nsum(int) (SFUNC = int84pl, STYPE = int8, INITCOND = '0', COMBINEFUNC = int8pl, PARALLEL = SAFE);
-- skdr_unit_ok hanya membaca GUC skdr.units (ikut ke worker paralel) -> boleh paralel; kueri KPI IBS 1,5 s -> 0,4 s.
ALTER FUNCTION skdr_unit_ok(text) PARALLEL SAFE;

CREATE OR REPLACE VIEW dash_ibs_cases AS
SELECT (r.laporan_id * 1000 + r.urutan * 10 + o.k)::bigint AS id,
       r.no_laporan || '/' || r.kode AS no_pe,
       COALESCE((SELECT d.form_key FROM pe_form_definitions d WHERE d.disease_id = r.disease_id AND d.is_active ORDER BY d.version DESC LIMIT 1), 'ibs') AS form_key,
       0 AS definition_id, 1 AS form_version, r.disease_id,
       CASE WHEN r.sts_verif THEN 'terverifikasi' ELSE 'dikirim' END AS status,
       jsonb_build_object('unit_pelapor', r.unit_nama, 'sumber', 'laporan_ibs', 'ibs_kode', r.kode, 'laporan_id', r.laporan_id) AS data,
       '[]'::jsonb AS errors, '[]'::jsonb AS warnings,
       CASE WHEN r.kode = '08DBT' THEN 'ghpr' ELSE 'suspek' END AS classification,
       'Laporan Agregat IBS'::text AS classification_basis, NULL::text AS classification_override, NULL::text AS override_reason,
       NULL::int AS cluster_id, NULL::text AS ebs_link, r.province_id, r.kabkota_id, 'dikirim'::text AS status_laporan,
       r.week_start AS tgl_laporan, NULL::date AS tgl_pe, NULL::date AS tgl_rumor, NULL::date AS onset_date, NULL::date AS first_visit_date,
       NULL::date AS death_date, o.outcome, NULL::text AS sex, NULL::int AS age_years, NULL::text AS patient_name, NULL::text AS nik,
       r.created_at, r.submitted_at AS updated_at, r.submitted_at, NULL::timestamptz AS verified_at, NULL::timestamptz AS finalized_at,
       NULL::timestamptz AS deleted_at, NULL::text AS deleted_by, o.n
FROM dash_ibs_rows r
CROSS JOIN LATERAL (VALUES (1, 'Meninggal'::text, r.kematian), (2, 'Sembuh'::text, r.kasus - r.kematian)) AS o(k, outcome, n)
WHERE r.kasus > 0 AND o.n > 0;

CREATE TABLE IF NOT EXISTS app_settings_bak_062 AS SELECT key, value FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings SET value = jsonb_set(jsonb_set(value::jsonb,
    '{texts,footnote}', '"* Satu Laporan EBS bisa berisi lebih dari satu kasus, jadi jumlah Laporan EBS tidak sama dengan jumlah kasus."'),
    '{texts,footnote_ibs}', '"* Angka IBS berasal dari Laporan Agregat IBS (rekap mingguan per unit; kasus agregat, bukan laporan per pasien). Terverifikasi = kasus dari alert IBS yang sudah diverifikasi."')::text,
  updated_at = now()
WHERE key = 'dashboard_executive' AND value::jsonb ? 'texts';

COMMIT;
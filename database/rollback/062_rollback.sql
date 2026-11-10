-- Rollback PR 041 (062_dasbor_utama_sumber_dinamis.sql): dash_ibs_cases kembali ke versi 060, teks app_settings dikembalikan.
BEGIN;

CREATE OR REPLACE AGGREGATE skdr_nsum(int) (SFUNC = int84pl, STYPE = int8, INITCOND = '0');
ALTER FUNCTION skdr_unit_ok(text) PARALLEL UNSAFE;

CREATE OR REPLACE VIEW dash_ibs_cases AS
SELECT (r.laporan_id * 1000 + r.urutan * 10 + o.k)::bigint AS id,
       r.no_laporan || '/' || r.kode AS no_pe,
       COALESCE((SELECT d.form_key FROM pe_form_definitions d WHERE d.disease_id = r.disease_id AND d.is_active ORDER BY d.version DESC LIMIT 1), 'ibs') AS form_key,
       0 AS definition_id, 1 AS form_version, r.disease_id, 'dikirim'::text AS status,
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

UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_062 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_062;
DELETE FROM schema_migrations WHERE filename = '062_dasbor_utama_sumber_dinamis.sql';
COMMIT;
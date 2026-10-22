-- Rollback PR 019 / 035: view surveillance_reports tanpa unit_name; hapus fungsi, tabel, dan pengaturan fasyankes.
BEGIN;
DROP VIEW IF EXISTS surveillance_reports;
CREATE VIEW surveillance_reports AS
SELECT 'form'::text AS source,
    r.id::text AS id,
    r.disease_id,
    NULL::text AS diagnosa,
    r.location_id,
    r.kabkota_id,
    r.location_name,
    r.latitude,
    r.longitude,
    r.report_date,
    r.cases,
    r.deaths,
    r.is_reviewed,
    r.created_at,
    r.notes
   FROM case_reports r
UNION ALL
 SELECT 'ebs'::text AS source,
    'ebs-'::text || e.id_ebs AS id,
    e.disease_id,
    NULLIF(TRIM(BOTH FROM e.diagnosa), ''::text) AS diagnosa,
    e.province_id AS location_id,
    e.kabkota_id,
    NULL::text AS location_name,
    COALESCE(e.latitude, k.latitude, p.latitude) AS latitude,
    COALESCE(e.longitude, k.longitude, p.longitude) AS longitude,
    COALESCE(e.tgl_laporan, e.create_date::date) AS report_date,
    e.jml_kasus AS cases,
    LEAST(e.jml_kematian, e.jml_kasus) AS deaths,
    e.sts_rumor = 'Terverifikasi'::text AS is_reviewed,
    COALESCE((e.create_date AT TIME ZONE 'Asia/Jakarta'::text), e.synced_at) AS created_at,
    NULL::text AS notes
   FROM ebs_reports e
     LEFT JOIN master_kabkota k ON k.id = e.kabkota_id
     LEFT JOIN master_locations p ON p.id = e.province_id
UNION ALL
 SELECT 'pe'::text AS source,
    'pe-'::text || c.id AS id,
    c.disease_id,
    NULL::text AS diagnosa,
    c.province_id AS location_id,
    c.kabkota_id,
    NULL::text AS location_name,
    COALESCE(k.latitude, p.latitude) AS latitude,
    COALESCE(k.longitude, p.longitude) AS longitude,
    COALESCE(c.tgl_laporan, c.created_at::date) AS report_date,
    1 AS cases,
        CASE
            WHEN c.outcome = 'Meninggal'::text THEN 1
            ELSE 0
        END AS deaths,
    c.status = ANY (ARRAY['terverifikasi'::text, 'final'::text]) AS is_reviewed,
    c.created_at,
    NULL::text AS notes
   FROM pe_cases c
     LEFT JOIN master_kabkota k ON k.id = c.kabkota_id
     LEFT JOIN master_locations p ON p.id = c.province_id
  WHERE c.deleted_at IS NULL AND (c.status IN ( SELECT jsonb_array_elements_text(app_settings.value::jsonb -> 'pe_count_statuses'::text) AS jsonb_array_elements_text
           FROM app_settings
          WHERE app_settings.key = 'dashboard_executive'::text));
DROP FUNCTION IF EXISTS skdr_unit_ok(text);
DROP TABLE IF EXISTS fasyankes_sync_log;
DROP TABLE IF EXISTS master_fasyankes;
DELETE FROM app_settings WHERE key = 'fasyankes_sync';
COMMIT;

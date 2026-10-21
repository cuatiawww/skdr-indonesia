-- Rollback 021 (PR 012)
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_021 b WHERE a.key = b.key;
CREATE OR REPLACE VIEW surveillance_reports AS
 SELECT 'form'::text AS source, (r.id)::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
    r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes
   FROM case_reports r
UNION ALL
 SELECT 'ebs'::text, ('ebs-'::text || e.id_ebs), e.disease_id, NULLIF(TRIM(BOTH FROM e.diagnosa), ''::text), e.province_id, e.kabkota_id, NULL::text,
    COALESCE(e.latitude, k.latitude, p.latitude), COALESCE(e.longitude, k.longitude, p.longitude), COALESCE(e.tgl_laporan, (e.create_date)::date),
    e.jml_kasus, LEAST(e.jml_kematian, e.jml_kasus), (e.sts_rumor = 'Terverifikasi'::text),
    COALESCE((e.create_date AT TIME ZONE 'Asia/Jakarta'::text), e.synced_at), NULL::text
   FROM ebs_reports e LEFT JOIN master_kabkota k ON k.id = e.kabkota_id LEFT JOIN master_locations p ON p.id = e.province_id;
UPDATE master_diseases d SET description = b.description FROM master_diseases_bak_021 b WHERE b.id = d.id;
ALTER TABLE master_diseases DROP COLUMN IF EXISTS icd10, DROP COLUMN IF EXISTS symptoms, DROP COLUMN IF EXISTS transmission;
DROP TABLE IF EXISTS master_diseases_bak_021, app_settings_bak_021;
DELETE FROM schema_migrations WHERE filename = '021_penyakit_dashboard.sql';
COMMIT;

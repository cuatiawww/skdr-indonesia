-- Rollback PR 039 (060_dasbor_utama_laporan_ebs_ibs.sql): view surveillance_reports kembali ke versi 035 (EBS sinkron + Form PE),
-- view dash_*, tabel laporan_ibs_baris/laporan_impor_lama_log dan fungsi impor dihapus; laporan hasil impor API SKDR lama
-- (data._impor, created_by NULL) dihapus beserta event-nya dan laporan_counters disetel ulang. Laporan dari form tidak disentuh.
BEGIN;
CREATE OR REPLACE VIEW surveillance_reports AS  SELECT 'form'::text AS source,
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
    r.notes,
    NULL::text AS unit_name
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
    NULL::text AS notes,
    NULLIF(TRIM(BOTH FROM e.unit), ''::text) AS unit_name
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
    NULL::text AS notes,
    NULLIF(TRIM(BOTH FROM c.data ->> 'unit_pelapor'::text), ''::text) AS unit_name
   FROM pe_cases c
     LEFT JOIN master_kabkota k ON k.id = c.kabkota_id
     LEFT JOIN master_locations p ON p.id = c.province_id
  WHERE c.deleted_at IS NULL AND (c.status IN ( SELECT jsonb_array_elements_text(app_settings.value::jsonb -> 'pe_count_statuses'::text) AS jsonb_array_elements_text
           FROM app_settings
          WHERE app_settings.key = 'dashboard_executive'::text));
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_060 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_060;
DROP VIEW IF EXISTS dash_ibs_individu;
DROP VIEW IF EXISTS dash_ibs_cases;
DROP VIEW IF EXISTS dash_ibs_fakta;
DROP VIEW IF EXISTS dash_ibs_rows;
DROP VIEW IF EXISTS dash_ebs_reports;
DROP TRIGGER IF EXISTS trg_laporan_ibs_baris ON laporan_ibs;
DELETE FROM laporan_events e USING laporan_ebs l WHERE e.jenis = 'ebs' AND e.laporan_id = l.id AND l.created_by IS NULL AND (l.data #>> '{_impor,id_ebs}') IS NOT NULL;
DELETE FROM laporan_ebs WHERE created_by IS NULL AND (data #>> '{_impor,id_ebs}') IS NOT NULL;
DELETE FROM laporan_events e USING laporan_ibs l WHERE e.jenis = 'ibs' AND e.laporan_id = l.id AND l.created_by IS NULL AND l.data ? '_impor';
DELETE FROM laporan_ibs WHERE created_by IS NULL AND data ? '_impor';
UPDATE laporan_counters c SET last_no = COALESCE((SELECT max(split_part(no_laporan, '-', 3)::int) FROM laporan_ebs WHERE split_part(no_laporan, '-', 2) = c.year::text), 0) WHERE c.jenis = 'ebs';
UPDATE laporan_counters c SET last_no = COALESCE((SELECT max(split_part(no_laporan, '-', 3)::int) FROM laporan_ibs WHERE split_part(no_laporan, '-', 2) = c.year::text), 0) WHERE c.jenis = 'ibs';
DROP FUNCTION IF EXISTS skdr_impor_lama_jalankan();
DROP FUNCTION IF EXISTS skdr_impor_ibs_lama(timestamptz, int, text);
DROP FUNCTION IF EXISTS skdr_impor_ebs_lama(timestamptz, date, text);
DROP FUNCTION IF EXISTS skdr_ebs_lama_data(ebs_reports);
DROP TABLE IF EXISTS laporan_impor_lama_log;
DROP INDEX IF EXISTS ux_laporan_ebs_impor;
DROP INDEX IF EXISTS idx_laporan_ibs_dasbor;
DROP INDEX IF EXISTS idx_laporan_ebs_dasbor;
DELETE FROM app_settings WHERE key = 'laporan_impor_lama';
DROP TABLE IF EXISTS laporan_ibs_baris;
DROP FUNCTION IF EXISTS laporan_ibs_baris_trg();
DROP FUNCTION IF EXISTS laporan_ibs_baris_isi(bigint);
ALTER TABLE laporan_ebs DROP COLUMN IF EXISTS dsb_jenis_unit, DROP COLUMN IF EXISTS dsb_kecamatan, DROP COLUMN IF EXISTS dsb_kecamatan_nama,
  DROP COLUMN IF EXISTS dsb_status, DROP COLUMN IF EXISTS dsb_verifikasi, DROP COLUMN IF EXISTS dsb_klb, DROP COLUMN IF EXISTS dsb_impor_id, DROP COLUMN IF EXISTS dsb_impor_update,
  DROP COLUMN IF EXISTS dsb_impor_disease_id;
DROP AGGREGATE IF EXISTS skdr_nsum(int);
DROP FUNCTION IF EXISTS skdr_jint(text);
DROP FUNCTION IF EXISTS skdr_mmwr_week_start(int, int);
DELETE FROM schema_migrations WHERE filename = '060_dasbor_utama_laporan_ebs_ibs.sql';
COMMIT;

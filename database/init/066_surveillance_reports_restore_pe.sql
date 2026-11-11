-- PR 049: Kembalikan branch Form PE (pe_cases) ke surveillance_reports dan pisahkan dari Laporan Agregat IBS.
-- Memastikan Dasbor Zoonosis Lite (/dasbor/zoonosis-lite) dapat memfilter sumber Form PE ('pe')
-- tanpa mencampurkan data agregat mingguan IBS ('ibs') yang membuat ribuan titik menumpuk di peta Zoonosis.
-- Rollback: rollback/066_rollback.sql
BEGIN;

CREATE OR REPLACE VIEW surveillance_reports AS
SELECT 'form'::text AS source, r.id::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
       r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes, NULL::text AS unit_name
FROM case_reports r
UNION ALL
SELECT 'ebs'::text AS source, 'ebs-' || e.id_ebs AS id, e.disease_id, e.diagnosa, e.province_id AS location_id, e.kabkota_id, NULL::text AS location_name,
       e.latitude, e.longitude, e.tgl_laporan AS report_date, e.jml_kasus AS cases, e.jml_kematian AS deaths,
       COALESCE(e.sts_rumor ILIKE 'Terverifikasi%', false) AS is_reviewed, (e.create_date AT TIME ZONE 'Asia/Jakarta') AS created_at, NULL::text AS notes, e.unit AS unit_name
FROM dash_ebs_reports e
UNION ALL
SELECT 'pe'::text AS source, 'pe-' || c.id AS id, c.disease_id, NULL::text AS diagnosa, c.province_id AS location_id, c.kabkota_id, NULL::text AS location_name,
       COALESCE(k.latitude, p.latitude) AS latitude, COALESCE(k.longitude, p.longitude) AS longitude,
       COALESCE(c.tgl_laporan, c.created_at::date) AS report_date, 1 AS cases,
       CASE WHEN c.outcome = 'Meninggal' THEN 1 ELSE 0 END AS deaths,
       c.status = ANY (ARRAY['terverifikasi'::text, 'final'::text]) AS is_reviewed,
       c.created_at, NULL::text AS notes,
       NULLIF(TRIM(BOTH FROM c.data ->> 'unit_pelapor'), ''::text) AS unit_name
FROM pe_cases c
LEFT JOIN master_kabkota k ON k.id = c.kabkota_id
LEFT JOIN master_locations p ON p.id = c.province_id
WHERE c.deleted_at IS NULL
UNION ALL
SELECT 'ibs'::text AS source, 'ibs-' || r.laporan_id || '-' || r.kode AS id, r.disease_id, r.nama AS diagnosa, r.province_id AS location_id, r.kabkota_id, NULL::text AS location_name,
       COALESCE(k.latitude, p.latitude) AS latitude, COALESCE(k.longitude, p.longitude) AS longitude,
       r.week_start AS report_date, r.kasus AS cases, r.kematian AS deaths,
       true AS is_reviewed, r.submitted_at AS created_at, NULL::text AS notes, r.unit_nama AS unit_name
FROM dash_ibs_rows r
LEFT JOIN master_kabkota k ON k.id = r.kabkota_id
LEFT JOIN master_locations p ON p.id = r.province_id
WHERE r.kasus > 0;

COMMIT;

-- Rollback PR 049 (066_surveillance_reports_restore_pe.sql): kembalikan surveillance_reports ke versi 060 (tanpa branch 'pe').
BEGIN;

CREATE OR REPLACE VIEW surveillance_reports AS
SELECT 'form'::text AS source, r.id::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
       r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes, NULL::text AS unit_name
FROM case_reports r
UNION ALL
SELECT 'ebs'::text, 'ebs-' || e.id_ebs, e.disease_id, e.diagnosa, e.province_id, e.kabkota_id, NULL::text,
       e.latitude, e.longitude, e.tgl_laporan, e.jml_kasus, e.jml_kematian,
       COALESCE(e.sts_rumor ILIKE 'Terverifikasi%', false), (e.create_date AT TIME ZONE 'Asia/Jakarta'), NULL::text, e.unit
FROM dash_ebs_reports e
UNION ALL
SELECT 'ibs'::text, 'ibs-' || r.laporan_id || '-' || r.kode, r.disease_id, r.nama, r.province_id, r.kabkota_id, NULL::text,
       COALESCE(k.latitude, p.latitude), COALESCE(k.longitude, p.longitude), r.week_start, r.kasus, r.kematian,
       true, r.submitted_at, NULL::text, r.unit_nama
FROM dash_ibs_rows r
LEFT JOIN master_kabkota k ON k.id = r.kabkota_id
LEFT JOIN master_locations p ON p.id = r.province_id
WHERE r.kasus > 0;

DELETE FROM schema_migrations WHERE filename = '066_surveillance_reports_restore_pe.sql';

COMMIT;


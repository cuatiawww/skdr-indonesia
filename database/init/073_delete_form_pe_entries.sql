-- PR 061: Hapus isian data Form PE & audit Dasbor Zoonosis Lite
-- 1. Hapus semua entri transaksi dari Form PE (pe_cases, pe_case_events, pe_clusters, case_reports)
--    sesuai instruksi: "SAY AINGIN AD MIGRASI DELETE ISIAN YG DARI FORM pe".
-- 2. Update view dash_ibs_cases & surveillance_reports agar penyakit ber-Form PE
--    (Rabies, Antraks, Leptospirosis, Flu Burung) secara konsisten bersumber dari pe_cases murni,
--    bukan data agregat IBS mingguan yang memicu angka 215k Rabies dan titik wajik semu pada peta.
-- Rollback: rollback/073_rollback.sql
BEGIN;

-- 1. Bersihkan transaksi Form PE dan reset sequence
DELETE FROM pe_case_events;
DELETE FROM pe_cases;
DELETE FROM pe_clusters;
DELETE FROM case_reports;

ALTER SEQUENCE IF EXISTS pe_cases_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS pe_clusters_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS case_reports_id_seq RESTART WITH 1;

-- 2. Update dash_ibs_cases: penyakit ber-Form PE membaca pe_cases murni
CREATE OR REPLACE VIEW dash_ibs_cases AS
SELECT c.id,
       c.no_pe,
       c.form_key,
       c.definition_id,
       c.form_version,
       c.disease_id,
       c.status,
       c.data,
       c.errors,
       c.warnings,
       c.classification,
       c.classification_basis,
       c.classification_override,
       c.override_reason,
       c.cluster_id,
       c.ebs_link,
       c.province_id,
       c.kabkota_id,
       c.status_laporan,
       c.tgl_laporan,
       c.tgl_pe,
       c.tgl_rumor,
       c.onset_date,
       c.first_visit_date,
       c.death_date,
       c.outcome,
       c.sex,
       c.age_years,
       c.patient_name,
       c.nik,
       c.created_at,
       c.updated_at,
       c.submitted_at,
       c.verified_at,
       c.finalized_at,
       c.deleted_at,
       c.deleted_by,
       1 AS n
FROM pe_cases c
WHERE c.deleted_at IS NULL
UNION ALL
SELECT (r.laporan_id * 1000 + r.urutan * 10 + o.k)::bigint AS id,
       r.no_laporan || '/' || r.kode AS no_pe,
       'ibs'::text AS form_key,
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
WHERE r.kasus > 0 AND o.n > 0
  AND r.disease_id NOT IN (
    SELECT disease_id FROM pe_form_definitions WHERE is_active
  );

-- 3. Update surveillance_reports: penyakit ber-Form PE hanya memetakan EBS & pe_cases
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
WHERE r.kasus > 0
  AND r.disease_id NOT IN (
    SELECT disease_id FROM pe_form_definitions WHERE is_active
  );

COMMIT;

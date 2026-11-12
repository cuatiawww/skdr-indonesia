-- Rollback 073: Kembalikan dash_ebs_reports, dash_ibs_cases (062) dan surveillance_reports (066)
BEGIN;

CREATE OR REPLACE VIEW dash_ebs_reports AS
SELECT l.id,
   - l.id AS id_ebs,
   l.no_ebs,
   p.name AS propinsi,
   k.name AS kota,
   l.dsb_kecamatan_nama AS distrik,
   l.dsb_jenis_unit AS kel_unit,
   NULLIF(TRIM(BOTH FROM l.unit_nama), ''::text) AS unit,
   p.code AS kode_depdagri_prop,
   k.kemendagri_code AS kode_depdagri_kota,
   l.dsb_kecamatan AS kode_depdagri_distrik,
   l.dsb_status AS sts_rumor,
   NULLIF(TRIM(BOTH FROM l.penyakit_rumor), ''::text) AS diagnosa,
   l.dsb_verifikasi AS verifikasi,
   GREATEST(COALESCE(l.jml_kasus, 0), 0) AS jml_kasus,
   LEAST(GREATEST(COALESCE(l.jml_kematian, 0), 0), GREATEST(COALESCE(l.jml_kasus, 0), 0)) AS jml_kematian,
   NULLIF(TRIM(BOTH FROM l.data ->> 'kronologi'::text), ''::text) AS kronologi,
   COALESCE(NULLIF(TRIM(BOTH FROM l.data ->> 'pfr_uraian'::text), ''::text), NULLIF(TRIM(BOTH FROM l.data #>> '{_impor,tindakan}'::text[]), ''::text)) AS tindakan,
   NULLIF(TRIM(BOTH FROM l.data #>> '{_impor,saran}'::text[]), ''::text) AS saran,
   l.dsb_klb AS klb,
   COALESCE(k.latitude, p.latitude) AS latitude,
   COALESCE(k.longitude, p.longitude) AS longitude,
   COALESCE(l.tgl_laporan, (l.submitted_at AT TIME ZONE 'Asia/Jakarta'::text)::date) AS tgl_laporan,
   (COALESCE(l.submitted_at, l.created_at) AT TIME ZONE 'Asia/Jakarta'::text) AS create_date,
       CASE
           WHEN l.dsb_impor_id IS NOT NULL THEN NULLIF(l.dsb_impor_update, ''::text)::timestamp without time zone
           WHEN l.updated_at > (COALESCE(l.submitted_at, l.created_at) + '00:01:00'::interval) THEN (l.updated_at AT TIME ZONE 'Asia/Jakarta'::text)
           ELSE NULL::timestamp without time zone
       END AS update_date,
   l.province_id,
   l.kabkota_id,
       CASE
           WHEN l.dsb_impor_id IS NOT NULL THEN l.dsb_impor_disease_id
           ELSE COALESCE(( SELECT a.disease_id
              FROM ebs_diagnosa_alias a
             WHERE a.diagnosa = lower(l.dsb_verifikasi)), ( SELECT a.disease_id
              FROM ebs_diagnosa_alias a
             WHERE a.diagnosa = lower(TRIM(BOTH FROM l.penyakit_rumor))))
       END AS disease_id,
   l.data AS raw,
   l.created_at AS first_synced_at,
   l.updated_at AS synced_at
FROM laporan_ebs l
    LEFT JOIN master_locations p ON p.id = l.province_id
    LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
WHERE l.status = 'dikirim'::text AND l.deleted_at IS NULL;

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

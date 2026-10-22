-- PR 019: master fasilitas pelayanan kesehatan (SATUSEHAT Master Sarana Index) + filter Unit pelapor.
-- Idempoten. Rollback: rollback/035_rollback.sql. Data EBS/PE tidak diubah.
BEGIN;
CREATE TABLE IF NOT EXISTS master_fasyankes (
  kode_satusehat text PRIMARY KEY,
  kode_sarana    text,
  nama           text NOT NULL,
  jenis_kode     text,
  jenis_nama     text,
  subjenis_nama  text,
  kelas_nama     text,
  kode_provinsi  text,
  kode_kabkota   text,
  kode_kecamatan text,
  nama_kecamatan text,
  province_id    int REFERENCES master_locations(id),
  kabkota_id     int REFERENCES master_kabkota(id),
  alamat         text,
  telp           text,
  latitude       double precision,
  longitude      double precision,
  status_aktif   boolean,
  operasional    boolean,
  status_sarana  text,
  organization_id text,
  sumber         text NOT NULL DEFAULT 'satusehat',
  src_updated_at timestamptz,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  nama_norm      text GENERATED ALWAYS AS (trim(lower(regexp_replace(nama, '[^A-Za-z0-9]+', ' ', 'g')))) STORED
);
CREATE INDEX IF NOT EXISTS master_fasyankes_jenis_idx ON master_fasyankes (jenis_kode, province_id, kabkota_id);
CREATE INDEX IF NOT EXISTS master_fasyankes_nama_idx ON master_fasyankes (nama_norm);
CREATE INDEX IF NOT EXISTS master_fasyankes_kab_idx ON master_fasyankes (kabkota_id);

CREATE TABLE IF NOT EXISTS fasyankes_sync_log (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  scope jsonb,
  pages int NOT NULL DEFAULT 0,
  upserted int NOT NULL DEFAULT 0,
  message text
);

-- Konfigurasi sinkronisasi (tanpa kredensial; client id/secret dari .env SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET).
INSERT INTO app_settings (key, value) VALUES ('fasyankes_sync', '{
  "auth_url": "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1",
  "base_url": "https://api-satusehat-stg.kemkes.go.id",
  "path": "/masterdata/v1/mastersaranaindex/mastersarana",
  "environment": "staging",
  "jenis": [{"kode": "102", "label": "Puskesmas", "slug": "puskesmas"}, {"kode": "104", "label": "Rumah Sakit", "slug": "rumah-sakit"}],
  "page_limit": 100,
  "delay_ms": 250,
  "timeout_secs": 60,
  "max_retries": 3,
  "provinces": []
}')
ON CONFLICT (key) DO NOTHING;

-- Filter Unit pelapor: backend mengisi set_config('skdr.units', ..., false) pada setiap permintaan dasbor
-- (kosong = semua unit). Pemisah antarnama: chr(31).
CREATE OR REPLACE FUNCTION skdr_unit_ok(u text) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT COALESCE(current_setting('skdr.units', true), '') = ''
      OR lower(trim(COALESCE(u, ''))) = ANY (string_to_array(current_setting('skdr.units', true), chr(31)))
$f$;

CREATE OR REPLACE VIEW surveillance_reports AS
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
    NULLIF(TRIM(BOTH FROM c.data ->> 'unit_pelapor'), ''::text) AS unit_name
   FROM pe_cases c
     LEFT JOIN master_kabkota k ON k.id = c.kabkota_id
     LEFT JOIN master_locations p ON p.id = c.province_id
  WHERE c.deleted_at IS NULL AND (c.status IN ( SELECT jsonb_array_elements_text(app_settings.value::jsonb -> 'pe_count_statuses'::text) AS jsonb_array_elements_text
           FROM app_settings
          WHERE app_settings.key = 'dashboard_executive'::text));
COMMIT;

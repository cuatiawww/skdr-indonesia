-- 012: EBS (Event Based Surveillance) sync from the SKDR Kemenkes API (PR 005, Yosua 2026-10-21).
--  * ebs_reports: one row per EBS report, upsert on id_ebs. Reporter name/phone and the free-text "informasi"
--    field (patient names) are NOT stored, neither as columns nor in raw (raw = API row minus those fields).
--  * Links: province by kode_depdagri_prop = master_locations.code; kab/kota by kode_depdagri_kota (NNNN) ->
--    master_kabkota.kemendagri_code (NN.NN); diagnosa -> master_diseases via ebs_diagnosa_alias (unmatched kept, disease_id NULL).
--  * ebs_sync_log: one row per sync run. Config in app_settings.ebs_sync_config (the User-Key stays in .env: SKDR_EBS_USER_KEY).
--  * surveillance_reports view = form case_reports + EBS, used by the dashboard with a source filter.
-- Rollback: database/rollback/012_rollback.sql
CREATE TABLE IF NOT EXISTS ebs_reports (
  id BIGSERIAL PRIMARY KEY,
  id_ebs BIGINT NOT NULL UNIQUE,
  no_ebs TEXT,
  propinsi TEXT, kota TEXT, distrik TEXT, kel_unit TEXT, unit TEXT,
  kode_depdagri_prop TEXT, kode_depdagri_kota TEXT, kode_depdagri_distrik TEXT,
  sts_rumor TEXT, diagnosa TEXT, verifikasi TEXT,
  jml_kasus INT NOT NULL DEFAULT 0 CHECK (jml_kasus >= 0),
  jml_kematian INT NOT NULL DEFAULT 0 CHECK (jml_kematian >= 0),
  kronologi TEXT, tindakan TEXT, saran TEXT, klb TEXT,
  latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  tgl_laporan DATE, create_date TIMESTAMP, update_date TIMESTAMP,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  disease_id INT REFERENCES master_diseases(id),
  raw JSONB NOT NULL,
  first_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ebs_tgl ON ebs_reports (tgl_laporan);
CREATE INDEX IF NOT EXISTS idx_ebs_prov ON ebs_reports (province_id);
CREATE INDEX IF NOT EXISTS idx_ebs_kab ON ebs_reports (kabkota_id);
CREATE INDEX IF NOT EXISTS idx_ebs_disease ON ebs_reports (disease_id);
CREATE INDEX IF NOT EXISTS idx_ebs_diag ON ebs_reports (lower(trim(diagnosa)));

-- diagnosa text (lower/trim) -> master disease; disease_id NULL = not mapped (kept, shown under its EBS diagnosa).
CREATE TABLE IF NOT EXISTS ebs_diagnosa_alias (
  id SERIAL PRIMARY KEY,
  diagnosa TEXT NOT NULL UNIQUE,
  disease_id INT REFERENCES master_diseases(id),
  match_source TEXT,            -- 'otomatis' (name/alias match), 'manual' (set in UI), 'seed' (migration)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ebs_sync_log (
  id BIGSERIAL PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('jadwal','manual')),
  years TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('berjalan','sukses','gagal')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  pages INT NOT NULL DEFAULT 0,
  rows_fetched INT NOT NULL DEFAULT 0,
  rows_upserted INT NOT NULL DEFAULT 0,
  retries INT NOT NULL DEFAULT 0,
  error TEXT
);

INSERT INTO app_settings (key, value) VALUES ('ebs_sync_config',
  '{"enabled":true,"api_url":"https://skdr.surveilans.org/api/ebs","years":["current","previous"],"interval_minutes":180,"page_size":1000,"max_retries":3,"retry_delay_secs":10,"timeout_secs":180}')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW surveillance_reports AS
SELECT 'form'::text AS source, r.id::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
       r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes
FROM case_reports r
UNION ALL
SELECT 'ebs', 'ebs-' || e.id_ebs, e.disease_id, NULLIF(trim(e.diagnosa), ''), e.province_id, e.kabkota_id, NULL,
       COALESCE(e.latitude, k.latitude, p.latitude), COALESCE(e.longitude, k.longitude, p.longitude),
       COALESCE(e.tgl_laporan, e.create_date::date), e.jml_kasus, LEAST(e.jml_kematian, e.jml_kasus),
       e.sts_rumor = 'Terverifikasi', COALESCE(e.create_date AT TIME ZONE 'Asia/Jakarta', e.synced_at), NULL
FROM ebs_reports e
LEFT JOIN master_kabkota k ON k.id = e.kabkota_id
LEFT JOIN master_locations p ON p.id = e.province_id;

-- Sidebar: "Sinkronisasi EBS" under SURVEILANS.
CREATE TABLE app_settings_bak_012 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_surveillance'
           THEN jsonb_set(g, '{items}', (g->'items') || '[{"id":"mod_ebs_sync","label":"Sinkronisasi EBS","icon":"Radio","href":"/ebs","order":4,"enabled":true}]'::jsonb)
           ELSE g END ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(g, ord))::text, updated_at = now()
WHERE key = 'navigation_menu';

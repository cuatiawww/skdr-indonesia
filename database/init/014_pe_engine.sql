-- 014: PE (Penyelidikan Epidemiologi) form engine — shared core (PR 006, Yosua 2026-10-21).
--  * pe_form_definitions: versioned, config-driven form schemas (one row per form_key + version; JSON built from the
--    tracker sheet by scripts/pe/build_<form>.py). A saved case keeps the form_version it was filled with.
--  * pe_cases: one PE per case. All answers in data (JSONB, incl. repeatable tables as arrays of rows); fields the
--    dashboard/list needs are copied to indexed columns on every save. Classification is computed by the server
--    from the schema's case-definition rules; an override needs a reason and is logged in pe_case_events.
--  * pe_clusters: one row per KLB/cluster; outbreak-level aggregates (Lepto N1–N9) live here, not on each PE.
--  * pe_case_events: status / classification history (role hook: actor_role, no login yet).
--  * app_settings.pe_workflow: status transitions draf → dikirim → terverifikasi → final (+ dikembalikan), roles kept
--    as hooks (enforce_roles=false until login exists).
--  * Menu group "FORM PE" (submenus added per form migration).
-- Rollback: database/rollback/014_rollback.sql
CREATE TABLE IF NOT EXISTS pe_form_definitions (
  id SERIAL PRIMARY KEY,
  form_key TEXT NOT NULL,
  version INT NOT NULL CHECK (version >= 1),
  disease_id INT REFERENCES master_diseases(id),
  title TEXT NOT NULL,
  schema JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_key, version)
);

CREATE TABLE IF NOT EXISTS pe_counters (
  form_key TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (form_key, year)
);

CREATE TABLE IF NOT EXISTS pe_clusters (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  form_key TEXT NOT NULL,
  disease_id INT REFERENCES master_diseases(id),
  name TEXT NOT NULL,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  kecamatan TEXT,
  tgl_rumor DATE,
  lokasi TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','selesai')),
  monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pe_clusters_form ON pe_clusters (form_key, status);

CREATE TABLE IF NOT EXISTS pe_cases (
  id BIGSERIAL PRIMARY KEY,
  no_pe TEXT NOT NULL UNIQUE,
  form_key TEXT NOT NULL,
  definition_id INT NOT NULL REFERENCES pe_form_definitions(id),
  form_version INT NOT NULL,
  disease_id INT REFERENCES master_diseases(id),
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','dikirim','terverifikasi','final','dikembalikan')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification TEXT,
  classification_basis TEXT,
  classification_override TEXT,
  override_reason TEXT,
  cluster_id INT REFERENCES pe_clusters(id),
  ebs_link TEXT,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  status_laporan TEXT,
  tgl_laporan DATE, tgl_pe DATE, tgl_rumor DATE, onset_date DATE, first_visit_date DATE, death_date DATE,
  outcome TEXT, sex TEXT, age_years INT,
  patient_name TEXT, nik TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, finalized_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pe_cases_form ON pe_cases (form_key, status);
CREATE INDEX IF NOT EXISTS idx_pe_cases_tgl ON pe_cases (tgl_laporan);
CREATE INDEX IF NOT EXISTS idx_pe_cases_kab ON pe_cases (kabkota_id);
CREATE INDEX IF NOT EXISTS idx_pe_cases_cluster ON pe_cases (cluster_id);

CREATE TABLE IF NOT EXISTS pe_case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES pe_cases(id) ON DELETE CASCADE,
  event TEXT NOT NULL,              -- 'dibuat','status','klasifikasi','koreksi_klasifikasi'
  from_value TEXT, to_value TEXT, note TEXT,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pe_events_case ON pe_case_events (case_id, id);

INSERT INTO app_settings (key, value) VALUES ('pe_workflow', '{
 "enforce_roles": false, "default_role": "petugas", "utc_offset_hours": 7, "editable_status": ["draf","dikembalikan"],
 "status_labels": {"draf":"Draf","dikirim":"Dikirim","terverifikasi":"Terverifikasi","final":"Final","dikembalikan":"Dikembalikan"},
 "transitions": [
  {"from":"draf","to":"dikirim","label":"Kirim","roles":["petugas","admin"],"validate":true},
  {"from":"dikembalikan","to":"dikirim","label":"Kirim ulang","roles":["petugas","admin"],"validate":true},
  {"from":"dikirim","to":"terverifikasi","label":"Verifikasi","roles":["verifikator","admin"],"validate":true},
  {"from":"dikirim","to":"dikembalikan","label":"Kembalikan untuk revisi","roles":["verifikator","admin"],"note_required":true},
  {"from":"terverifikasi","to":"dikembalikan","label":"Kembalikan untuk revisi","roles":["verifikator","admin"],"note_required":true},
  {"from":"terverifikasi","to":"final","label":"Finalkan","roles":["verifikator","admin"],"validate":true}
 ]}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE app_settings_bak_014 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = ((
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_master_data' THEN jsonb_set(g, '{order}', '3') ELSE g END ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(g, ord)
) || '[{"id":"grp_form_pe","title":"FORM PE","order":2,"enabled":true,"items":[{"id":"mod_form_pe","label":"Form PE","icon":"FileText","href":"#","order":1,"enabled":true,"subItems":[]}]}]'::jsonb)::text, updated_at = now()
WHERE key = 'navigation_menu';

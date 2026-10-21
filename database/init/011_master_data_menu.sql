-- 011: Master Data pages (PR 004, Yosua 2026-10-21).
--  * updated_at columns for the three master tables (CRUD edits), created_at for master_kabkota.
--  * Sidebar menu group "MASTER DATA" (Data Provinsi, Data Kabupaten/Kota, Data Penyakit) stored in app_settings.navigation_menu.
-- Soft delete only (is_active). Rollback: database/rollback/011_rollback.sql
ALTER TABLE master_locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE master_kabkota ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE master_kabkota ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE master_diseases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_kabkota_name ON master_kabkota (lower(name));

CREATE TABLE app_settings_bak_011 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (value::jsonb || '[{"id":"grp_master_data","title":"MASTER DATA","order":2,"enabled":true,"items":[{"id":"mod_master_data","label":"Master Data","icon":"Database","href":"#","order":1,"enabled":true,"subItems":[{"id":"sub_master_provinsi","label":"Data Provinsi","icon":"Globe2","href":"/master/provinsi","order":1,"enabled":true},{"id":"sub_master_kabupaten","label":"Data Kabupaten/Kota","icon":"MapPin","href":"/master/kabupaten","order":2,"enabled":true},{"id":"sub_master_penyakit","label":"Data Penyakit","icon":"Stethoscope","href":"/master/penyakit","order":3,"enabled":true}]}]}]'::jsonb)::text,
  updated_at = now()
WHERE key = 'navigation_menu';

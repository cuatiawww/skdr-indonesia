-- Rollback PR 016 (kinerja): hapus indeks dan konfigurasi cache, pulihkan api_cache lama bila ada.
BEGIN;
DROP INDEX IF EXISTS idx_ebs_reports_dash_cover;
DROP INDEX IF EXISTS idx_pe_cases_disease_active;
DELETE FROM app_settings WHERE key = 'api_cache';
INSERT INTO app_settings SELECT * FROM app_settings_bak_025 ON CONFLICT (key) DO NOTHING;
DROP TABLE IF EXISTS app_settings_bak_025;
DELETE FROM schema_migrations WHERE filename = '025_kinerja_indeks_cache.sql';
COMMIT;

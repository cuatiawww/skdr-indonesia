-- Rollback 024 (PR 016): remove theme_palette / dashboard_sources (frontend falls back to app/globals.css defaults),
-- restoring previous rows from app_settings_bak_024 if they existed.
BEGIN;
DELETE FROM app_settings WHERE key IN ('theme_palette', 'dashboard_sources');
INSERT INTO app_settings (key, value) SELECT key, value FROM app_settings_bak_024 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
DROP TABLE IF EXISTS app_settings_bak_024;
DELETE FROM schema_migrations WHERE filename = '024_theme_kemenkes_sumber_global.sql';
COMMIT;

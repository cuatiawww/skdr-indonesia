-- Rollback PR 017 (grup "Lainnya"): pulihkan navigation_menu dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_029 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_029;
DELETE FROM schema_migrations WHERE filename = '029_nav_lainnya.sql';
COMMIT;

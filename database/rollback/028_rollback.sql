-- Rollback PR 017 (navigasi grup): pulihkan navigation_menu dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_028 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_028;
DELETE FROM schema_migrations WHERE filename = '028_navigasi_grup.sql';
COMMIT;

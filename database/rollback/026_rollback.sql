-- Rollback PR 016 (ambang 7-1-7): pulihkan dashboard_executive dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_026 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_026;
DELETE FROM schema_migrations WHERE filename = '026_t717_ambang.sql';
COMMIT;

-- Rollback PR 012 indicator status update.
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_022 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_022;
DELETE FROM schema_migrations WHERE filename = '022_indicator_status_pr012.sql';

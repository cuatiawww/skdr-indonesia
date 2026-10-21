-- Rollback 010: restore English settings values.
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_010 b WHERE a.key = b.key;
DROP TABLE app_settings_bak_010;
DELETE FROM schema_migrations WHERE filename = '010_settings_id.sql';

-- Rollback PR 014 branding update.
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_023 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_023;
DELETE FROM schema_migrations WHERE filename = '023_branding_skdr.sql';

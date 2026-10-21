-- Rollback 012: drop EBS sync objects (synced EBS data is removed; form data untouched) and restore the menu.
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_012 b WHERE a.key = b.key;
DROP TABLE app_settings_bak_012;
DROP VIEW IF EXISTS surveillance_reports;
DROP TABLE IF EXISTS ebs_sync_log;
DROP TABLE IF EXISTS ebs_reports;
DROP TABLE IF EXISTS ebs_diagnosa_alias;
DELETE FROM app_settings WHERE key = 'ebs_sync_config';
DELETE FROM schema_migrations WHERE filename = '012_ebs_sync.sql';

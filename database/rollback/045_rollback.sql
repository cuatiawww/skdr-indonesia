-- PR 021 rollback 045: tampilkan lagi menu Laboratorium & Klaster.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_045 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_045;
DELETE FROM schema_migrations WHERE filename = '045_nav_sembunyikan_lab_klaster.sql';
COMMIT;

-- PR 021 rollback 041: kembalikan navigation_menu dari app_settings_bak_041.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_041 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_041;
DELETE FROM schema_migrations WHERE filename = '041_nav_kategori_lab_klaster.sql';
COMMIT;

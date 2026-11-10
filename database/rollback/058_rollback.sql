-- Rollback PR 036 (058_dasbor_mbg.sql): mengembalikan navigation_menu dari app_settings_bak_058.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_058 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_058;
DELETE FROM schema_migrations WHERE filename = '058_dasbor_mbg.sql';
COMMIT;

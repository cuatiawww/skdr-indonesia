-- Rollback PR 037 (059_landing_page.sql): mengembalikan navigation_menu dari app_settings_bak_059.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_059 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_059;
DELETE FROM schema_migrations WHERE filename = '059_landing_page.sql';
COMMIT;

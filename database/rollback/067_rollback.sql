-- Rollback PR 052 (067_dasbor_mbg_menu_program.sql): kembalikan navigation_menu dari app_settings_bak_067.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_067 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_067;
DELETE FROM schema_migrations WHERE filename = '067_dasbor_mbg_menu_program.sql';
COMMIT;

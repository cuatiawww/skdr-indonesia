-- Rollback PR 052b (068_dasbor_mbg_kategori.sql): kembalikan navigation_menu dari app_settings_bak_068.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_068 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_068;
DELETE FROM schema_migrations WHERE filename = '068_dasbor_mbg_kategori.sql';
COMMIT;

-- Rollback PR 035 (061_label_laporan_ebs_ibs.sql): mengembalikan navigation_menu dari app_settings_bak_061.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_061 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_061;
DELETE FROM schema_migrations WHERE filename = '061_label_laporan_ebs_ibs.sql';
COMMIT;

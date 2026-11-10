-- Rollback PR 035 (057_dasbor_ebs_ibs.sql): mengembalikan navigation_menu dari app_settings_bak_057.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_057 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_057;
DELETE FROM schema_migrations WHERE filename = '057_dasbor_ebs_ibs.sql';
COMMIT;


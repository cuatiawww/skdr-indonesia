-- Rollback 011: restore the sidebar menu and drop the added timestamp columns/index (data rows untouched).
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_011 b WHERE a.key = b.key;
DROP TABLE app_settings_bak_011;
DROP INDEX IF EXISTS idx_kabkota_name;
ALTER TABLE master_diseases DROP COLUMN IF EXISTS updated_at;
ALTER TABLE master_kabkota DROP COLUMN IF EXISTS updated_at;
ALTER TABLE master_kabkota DROP COLUMN IF EXISTS created_at;
ALTER TABLE master_locations DROP COLUMN IF EXISTS updated_at;
DELETE FROM schema_migrations WHERE filename = '011_master_data_menu.sql';

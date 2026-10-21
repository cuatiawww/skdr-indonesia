-- Rollback 009: drop kab/kota master, restore previous province names/coords.
ALTER TABLE case_reports DROP COLUMN IF EXISTS kabkota_id;
DROP TABLE IF EXISTS master_kabkota;
UPDATE master_locations m SET name = b.name, latitude = b.latitude, longitude = b.longitude FROM master_locations_bak_009 b WHERE b.id = m.id;
DROP TABLE master_locations_bak_009;
DELETE FROM schema_migrations WHERE filename = '009_master_kabkota.sql';

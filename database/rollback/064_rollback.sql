-- Rollback PR 044 (064_spasial.sql): tabel koordinat unit + fungsi dihapus, menu dikembalikan.
BEGIN;
DROP MATERIALIZED VIEW IF EXISTS analisa_unit_lokasi;
DROP FUNCTION IF EXISTS skdr_norm_nama(text);
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_064 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_064;
DELETE FROM schema_migrations WHERE filename = '064_spasial.sql';
COMMIT;

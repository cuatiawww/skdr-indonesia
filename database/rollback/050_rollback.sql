-- PR 028 rollback 050: kembalikan lab_klaster_config tanpa lab_specimen_map, lalu klasifikasi ulang baris berkode.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_050 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_050;
UPDATE skdr_alerts SET lab_kelas = NULL WHERE trim(spesimen_diperiksa) IN ('1', '2');
DELETE FROM schema_migrations WHERE filename = '050_lab_spesimen_map.sql';
COMMIT;

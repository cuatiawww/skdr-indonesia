-- PR 021 rollback 042: hapus kolom turunan Alert SKDR, kembalikan lab_klaster_config.
BEGIN;
ALTER TABLE skdr_alerts DROP COLUMN IF EXISTS ada_spesimen, DROP COLUMN IF EXISTS lab_kelas, DROP COLUMN IF EXISTS is_klb, DROP COLUMN IF EXISTS respon24_ok;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_042 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_042;
DELETE FROM schema_migrations WHERE filename = '042_skdr_alert_kelas.sql';
COMMIT;

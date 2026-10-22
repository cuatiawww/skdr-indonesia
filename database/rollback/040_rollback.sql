-- PR 021 rollback 040: hapus tabel Alert SKDR dan konfigurasinya.
BEGIN;
DROP TABLE IF EXISTS skdr_alerts;
DROP TABLE IF EXISTS skdr_alert_sync_log;
DROP TABLE IF EXISTS skdr_penyakit_map;
DELETE FROM app_settings WHERE key IN ('skdr_alert_sync','lab_klaster_config');
DELETE FROM schema_migrations WHERE filename = '040_skdr_alert.sql';
COMMIT;

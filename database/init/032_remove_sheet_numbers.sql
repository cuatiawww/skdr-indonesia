-- PR 018: hapus rujukan nomor sheet progres ("sheet No. 36") dari teks yang tampil di UI (dashboard_executive.texts).
-- Idempoten. Backup: app_settings_bak_032. Rollback: rollback/032_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_032 AS SELECT key, value FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings
   SET value = replace(value, ' (sheet No. 36)', ''), updated_at = now()
 WHERE key = 'dashboard_executive' AND value LIKE '% (sheet No. 36)%';
COMMIT;

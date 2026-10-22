-- PR 022 rollback 046
BEGIN;
ALTER TABLE skdr_alert_fakta DROP COLUMN IF EXISTS sts_verif, DROP COLUMN IF EXISTS tgl_verifikasi, DROP COLUMN IF EXISTS klb_kode;
DELETE FROM schema_migrations WHERE filename = '046_skdr_alert_fakta_verifikasi.sql';
COMMIT;

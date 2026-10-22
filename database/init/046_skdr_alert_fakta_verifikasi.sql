-- PR 022: kolom verifikasi/KLB di skdr_alert_fakta untuk seksi Alert, CFR dan 7-1-7 Dasbor Utama (tanpa join ke skdr_alerts 2,6 GB).
-- Rollback: rollback/046_rollback.sql
BEGIN;
ALTER TABLE skdr_alert_fakta ADD COLUMN IF NOT EXISTS sts_verif boolean NOT NULL DEFAULT false;
ALTER TABLE skdr_alert_fakta ADD COLUMN IF NOT EXISTS tgl_verifikasi timestamp;
ALTER TABLE skdr_alert_fakta ADD COLUMN IF NOT EXISTS klb_kode text;
UPDATE skdr_alert_fakta f SET sts_verif = (trim(COALESCE(s.sts_verifikasi,'')) = '1'), tgl_verifikasi = s.tgl_verifikasi, klb_kode = trim(s.klb)
FROM skdr_alerts s WHERE s.id = f.alert_id;
COMMIT;
ANALYZE skdr_alert_fakta;

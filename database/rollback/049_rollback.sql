-- PR 023 rollback 049 (EBS 2024 tetap tersimpan di ebs_reports; hapus manual bila perlu: DELETE FROM ebs_reports WHERE tgl_laporan < '2025-01-01')
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_049 b WHERE a.key = b.key;
UPDATE ebs_reports e SET kabkota_id = NULL FROM ebs_kabkota_bak_049 b WHERE b.id = e.id;
DELETE FROM app_settings WHERE key = 'ebs_dashboard_config';
DROP TABLE IF EXISTS app_settings_bak_049, ebs_kabkota_bak_049;
DELETE FROM schema_migrations WHERE filename = '049_ebs_2024_dasbor_ebs.sql';
COMMIT;

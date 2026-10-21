-- PR 016: ambang warna 7-1-7 (sheet "Spesifikasi Dashboard Executive" No. 45: hijau ≥80%, kuning 60–79%, merah <60%;
-- masih contoh, perlu disepakati). Disimpan di app_settings.dashboard_executive -> t717.thresholds. Rollback: rollback/026_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_026 AS SELECT * FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings
   SET value = jsonb_set(value::jsonb, '{t717}', '{"thresholds": {"green": 80, "yellow": 60}, "notification_max_days": 1}'::jsonb, true)::text,
       updated_at = now()
 WHERE key = 'dashboard_executive';
COMMIT;

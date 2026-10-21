-- Rollback PR 016 (registri status kasus Leptospirosis): pulihkan dashboard_executive dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_027 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_027;
DELETE FROM schema_migrations WHERE filename = '027_lepto_status_kasus.sql';
COMMIT;
-- Rollback PR 058: Restore navigation_menu from app_settings_bak_072
BEGIN;

UPDATE app_settings
SET value = (SELECT value FROM app_settings_bak_072 WHERE key = 'navigation_menu'),
    updated_at = now()
WHERE key = 'navigation_menu'
  AND EXISTS (SELECT 1 FROM app_settings_bak_072 WHERE key = 'navigation_menu');

DROP TABLE IF EXISTS app_settings_bak_072;

COMMIT;


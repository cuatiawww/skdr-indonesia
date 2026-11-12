-- Rollback PR 068: Kembalikan navigation_menu dari app_settings_bak_075
BEGIN;

UPDATE app_settings SET value = b.value, updated_at = now()
FROM app_settings_bak_075 b
WHERE app_settings.key = b.key;

DROP TABLE IF EXISTS app_settings_bak_075;

COMMIT;

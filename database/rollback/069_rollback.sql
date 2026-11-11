-- Rollback PR 054 (069_dasbor_mbg_submenu_under_dasbor.sql)
BEGIN;

UPDATE app_settings s
SET value = b.value,
    updated_at = now()
FROM app_settings_bak_069 b
WHERE s.key = 'navigation_menu'
  AND b.key = 'navigation_menu';

DROP TABLE IF EXISTS app_settings_bak_069;

COMMIT;


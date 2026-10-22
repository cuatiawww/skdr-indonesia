BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_037 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_037;
COMMIT;

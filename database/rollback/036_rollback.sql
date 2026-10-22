BEGIN;
UPDATE app_settings a SET value = b.value FROM app_settings_bak_036 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_036;
COMMIT;

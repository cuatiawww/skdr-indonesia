-- Rollback PR 018 / 032: kembalikan teks dashboard_executive dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_032 b WHERE a.key = b.key;
COMMIT;

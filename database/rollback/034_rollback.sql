-- Rollback PR 018 / 034: kembalikan map_choropleth (kelas tetap 033) dari backup.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_034 b WHERE a.key = b.key;
COMMIT;

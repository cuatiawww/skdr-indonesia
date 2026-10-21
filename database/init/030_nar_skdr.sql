-- PR 018: konfigurasi bagian NAR–SKDR (Spesifikasi Dashboard Executive No. 76–81).
-- nar.exclude_classes: klasifikasi PE yang tidak dihitung pada % NIK terisi (No. 76: tanpa GHPR).
-- nar.nik_valid_pattern: pola NIK valid (16 digit).
-- Rollback: rollback/030_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_030 AS SELECT key, value FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings
   SET value = jsonb_set(value::jsonb, '{nar}', '{"exclude_classes": ["ghpr"], "nik_valid_pattern": "^[0-9]{16}$"}'::jsonb, true)::text,
       updated_at = now()
 WHERE key = 'dashboard_executive' AND NOT (value::jsonb ? 'nar');
COMMIT;

-- PR 014: SKDR branding — header subtitle "Sistem Kewaspadaan Dini dan Respons", title "SKDR INDONESIA".
-- Backup in app_settings_bak_023.
CREATE TABLE IF NOT EXISTS app_settings_bak_023 AS SELECT key, value FROM app_settings WHERE key IN ('app_name', 'app_tagline', 'footer_text');
UPDATE app_settings SET value = 'SKDR INDONESIA', updated_at = now() WHERE key = 'app_name';
UPDATE app_settings SET value = 'Sistem Kewaspadaan Dini dan Respons', updated_at = now() WHERE key = 'app_tagline';
UPDATE app_settings SET value = 'SKDR Indonesia', updated_at = now() WHERE key = 'footer_text';

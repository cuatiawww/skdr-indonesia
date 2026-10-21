-- 010: Bahasa Indonesia UI (Yosua, 2026-10-21): app tagline/footer and navigation menu labels in Indonesian.
-- Rollback: database/rollback/010_rollback.sql
CREATE TABLE app_settings_bak_010 AS SELECT key, value FROM app_settings WHERE key IN ('app_tagline','footer_text','navigation_menu');
UPDATE app_settings SET value = 'Sistem Kewaspadaan Dini dan Respons — Dasbor Pelaporan Kasus', updated_at = now() WHERE key = 'app_tagline';
UPDATE app_settings SET value = 'SKDR Indonesia', updated_at = now() WHERE key = 'footer_text';
UPDATE app_settings SET value = '[{"id":"grp_surveillance","title":"SURVEILANS","order":1,"enabled":true,"items":[{"id":"mod_main_dashboard","label":"Dasbor Utama","icon":"LayoutDashboard","href":"/main-dashboard","order":1,"enabled":true},{"id":"mod_case_form","label":"Formulir Laporan Kasus","icon":"FileText","href":"/form","order":2,"enabled":true},{"id":"mod_case_reports","label":"Laporan Kasus","icon":"FileSpreadsheet","href":"/reports","order":3,"enabled":true}]}]', updated_at = now() WHERE key = 'navigation_menu';

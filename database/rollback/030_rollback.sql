-- Rollback PR 018 / 030: hapus konfigurasi NAR–SKDR.
BEGIN;
UPDATE app_settings SET value = (value::jsonb - 'nar')::text, updated_at = now() WHERE key = 'dashboard_executive';
COMMIT;

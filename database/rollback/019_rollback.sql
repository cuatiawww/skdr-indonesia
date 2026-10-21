-- Rollback 019: remove the executive dashboard config (the dashboard falls back to empty cards).
DELETE FROM app_settings WHERE key = 'dashboard_executive';
DELETE FROM schema_migrations WHERE filename = '019_dashboard_executive.sql';

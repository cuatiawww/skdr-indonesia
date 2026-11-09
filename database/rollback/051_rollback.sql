-- PR 029 rollback 051: kembalikan navigation_menu, hapus tabel auth (semua pengguna & sesi ikut terhapus).
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_051 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_051;
DROP TABLE IF EXISTS user_activity_log;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS user_roles;
DELETE FROM app_settings WHERE key IN ('session_idle_timeout_seconds', 'session_absolute_timeout_seconds');
DELETE FROM schema_migrations WHERE filename = '051_auth_users_roles.sql';
COMMIT;

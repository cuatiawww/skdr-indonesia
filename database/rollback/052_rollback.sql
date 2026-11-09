-- PR 029 rollback 052: kembalikan navigation_menu, hapus admin hasil seed yang belum pernah mengganti kata sandi,
-- hapus kolom must_change_password.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_052 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_052;
DELETE FROM users WHERE created_by = 'seed:052' AND must_change_password AND last_login_at IS NULL;
ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;
DELETE FROM schema_migrations WHERE filename = '052_seed_admin_must_change_password.sql';
COMMIT;

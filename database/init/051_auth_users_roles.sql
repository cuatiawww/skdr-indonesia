-- PR 029: login + manajemen akses pengguna, dan pemisahan navigasi /dashboard vs /tatakelola.
-- * user_roles: peran + daftar hak akses (JSONB). Peran bawaan (is_system) tidak bisa dihapus.
-- * users: password_hash = Argon2id. Admin pertama di-seed oleh migrasi 052 (wajib ganti kata sandi).
-- * user_sessions: hanya SHA-256 token yang disimpan; timeout idle/absolut dari app_settings.
-- * user_activity_log: jejak login/logout dan perubahan pengguna/peran.
-- * navigation_menu: tiap grup diberi "area" (home | dashboard | tatakelola); tambah grup Dasbor Limited
--   (Spasial, Matriks Analisa = segera hadir), Tata Kelola, dan Manajemen Akses. Hanya UPDATE satu baris app_settings.
-- Tabel baru kosong/kecil, tidak menyentuh tabel data besar (ringan).
-- Rollback: rollback/051_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO user_roles (id, name, description, permissions, is_system) VALUES
  ('admin', 'Administrator', 'Akses penuh: dasbor, tata kelola, dan manajemen akses', '["*"]', TRUE),
  ('pengelola', 'Pengelola Data', 'Tata kelola: Form PE (input & verifikasi), master data, integrasi', '["dashboard_limited","tatakelola","pe_input","pe_verify","master_data","integrasi"]', TRUE),
  ('verifikator', 'Verifikator PE', 'Input dan verifikasi Form PE', '["dashboard_limited","tatakelola","pe_input","pe_verify"]', TRUE),
  ('petugas', 'Petugas Input', 'Input Form PE', '["dashboard_limited","tatakelola","pe_input"]', TRUE),
  ('viewer', 'Pengguna Dasbor', 'Dasbor publik dan Dasbor Limited saja', '["dashboard_limited"]', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES user_roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);

CREATE TABLE IF NOT EXISTS user_activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  username TEXT,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created ON user_activity_log (created_at DESC);

INSERT INTO app_settings (key, value) VALUES
  ('session_idle_timeout_seconds', '28800'),
  ('session_absolute_timeout_seconds', '604800')
ON CONFLICT (key) DO NOTHING;

-- navigation_menu: area per grup + grup baru (idempoten: dilewati bila grp_akses sudah ada)
CREATE TABLE IF NOT EXISTS app_settings_bak_051 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(g ORDER BY (g->>'order')::numeric) FROM (
    SELECT CASE e.g->>'id'
      WHEN 'grp_beranda'   THEN e.g || '{"area": "home", "order": 1}'::jsonb
      WHEN 'grp_dasbor'    THEN jsonb_set(e.g || '{"area": "dashboard", "order": 2, "title": "Dasbor Publik"}'::jsonb, '{items}',
                                 '[{"id": "mod_dashboard_home", "label": "Ringkasan Dasbor", "href": "/dashboard", "icon": "LayoutDashboard", "description": "Semua dasbor dalam satu halaman", "order": 0, "enabled": true}]'::jsonb || (e.g->'items'))
      WHEN 'grp_transaksi' THEN e.g || '{"area": "tatakelola", "order": 5}'::jsonb
      WHEN 'grp_integrasi' THEN e.g || '{"area": "tatakelola", "order": 6, "permission": "integrasi"}'::jsonb
      WHEN 'grp_master'    THEN e.g || '{"area": "tatakelola", "order": 7, "permission": "master_data"}'::jsonb
      WHEN 'grp_bantuan'   THEN e.g || '{"area": "dashboard", "order": 9}'::jsonb
      ELSE e.g END AS g
    FROM jsonb_array_elements(value::jsonb) AS e(g)
    UNION ALL SELECT '{"id": "grp_dasbor_limited", "title": "Dasbor Limited", "order": 3, "enabled": true, "area": "dashboard", "requiresAuth": true, "items": [
        {"id": "mod_spasial", "label": "Spasial", "href": "/dashboard/spasial", "icon": "MapPin", "description": "Analisis spasial (segera hadir)", "badge": "Segera", "order": 1, "enabled": true},
        {"id": "mod_matriks_analisa", "label": "Matriks Analisa", "href": "/dashboard/matriks-analisa", "icon": "Layers", "description": "Matriks analisa (segera hadir)", "badge": "Segera", "order": 2, "enabled": true}]}'::jsonb
    UNION ALL SELECT '{"id": "grp_tatakelola", "title": "Tata Kelola", "order": 4, "enabled": true, "area": "tatakelola", "requiresAuth": true, "permission": "tatakelola", "items": [
        {"id": "mod_tatakelola_home", "label": "Ringkasan Tata Kelola", "href": "/tatakelola", "icon": "Shield", "description": "Formulir, master data, integrasi, dan manajemen akses", "order": 1, "enabled": true}]}'::jsonb
    UNION ALL SELECT '{"id": "grp_akses", "title": "Manajemen Akses", "order": 8, "enabled": true, "area": "tatakelola", "requiresAuth": true, "permission": "user_management", "items": [
        {"id": "mod_pengguna", "label": "Pengguna", "href": "/tatakelola/pengguna", "icon": "Users", "description": "Tambah, ubah, aktif/nonaktifkan pengguna", "order": 1, "enabled": true},
        {"id": "mod_peran", "label": "Peran & Hak Akses", "href": "/tatakelola/peran", "icon": "ShieldCheck", "description": "Peran dan hak akses per peran", "order": 2, "enabled": true},
        {"id": "mod_log_akses", "label": "Log Akses", "href": "/tatakelola/log-akses", "icon": "History", "description": "Riwayat login dan perubahan akses", "order": 3, "enabled": true}]}'::jsonb
  ) x
), updated_at = now()
WHERE key = 'navigation_menu' AND NOT (value::jsonb @> '[{"id": "grp_akses"}]'::jsonb);
COMMIT;

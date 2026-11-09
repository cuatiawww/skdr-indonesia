-- PR 029 (lanjutan): admin pertama di-seed lewat migrasi (bukan dari .env) + wajib ganti kata sandi saat login pertama;
-- semua dasbor kini wajib login, grup "Dasbor Publik" kembali bernama "Dasbor".
-- Kata sandi bawaan admin didokumentasikan di docs/PR/029-login-manajemen-akses-tatakelola.md (disimpan sebagai
-- hash Argon2id, bukan teks). Ringan: 1 kolom baru, 1 baris users (ON CONFLICT DO NOTHING), 1 baris app_settings.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO users (username, full_name, password_hash, role, is_active, created_by, must_change_password)
VALUES ('admin', 'Administrator', '$argon2id$v=19$m=19456,t=2,p=1$ZjIzk+Zh94zsm1LwgDi7Yg$MElD86ySxI5uURrhVJ2dS6J/r3hW/T8juwckd9keK9U', 'admin', TRUE, 'seed:052', TRUE)
ON CONFLICT DO NOTHING;

-- navigation_menu: "Dasbor Publik" -> "Dasbor" (semua dasbor sekarang perlu login)
CREATE TABLE IF NOT EXISTS app_settings_bak_052 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_dasbor' THEN e.g || '{"title": "Dasbor", "requiresAuth": true}'::jsonb ELSE e.g END ORDER BY e.n)
    FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
), updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_dasbor", "title": "Dasbor Publik"}]'::jsonb;

COMMIT;

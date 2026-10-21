-- PR 017: grup navigasi "Bantuan & Dokumentasi" diganti nama menjadi "Lainnya" (isi tetap: Dokumentasi).
-- Rollback: rollback/029_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_029 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_bantuan' THEN jsonb_set(g, '{title}', '"Lainnya"') ELSE g END ORDER BY i)
    FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY x(g, i)
), updated_at = now()
WHERE key = 'navigation_menu';
COMMIT;

-- PR 021: Laboratorium & Klaster jadi seksi di Dasbor Utama; menu sidebar-nya disembunyikan (enabled=false), halaman tetap ada.
-- Rollback: rollback/045_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_045 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_dasbor' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(CASE WHEN e->>'id' IN ('mod_laboratorium','mod_klaster') THEN jsonb_set(e, '{enabled}', 'false') ELSE e END ORDER BY o)
      FROM jsonb_array_elements(g->'items') WITH ORDINALITY y(e, o))) ELSE g END ORDER BY i)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY x(g, i)
), updated_at = now() WHERE key = 'navigation_menu';
COMMIT;

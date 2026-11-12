-- PR 068: Modul Pengaturan Navigasi & Menu Sidebar SKDR (Tata Kelola)
-- Menambahkan menu mod_navigasi (Modul & Navigasi) di bawah grup Tata Kelola (grp_tatakelola)
-- Rollback: rollback/075_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_075 AS
SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN g->>'id' = 'grp_tatakelola' THEN
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(g->'items') AS it WHERE it->>'id' = 'mod_navigasi'
          ) THEN
            jsonb_set(
              g,
              '{items}',
              (g->'items') || '[{"id":"mod_navigasi","label":"Modul & Navigasi","icon":"SlidersHorizontal","href":"/tatakelola/navigasi","order":2,"enabled":true,"description":"Pengaturan dinamis nama navigasi, menu, dan sub-menu sidebar"}]'::jsonb
            )
          ELSE g
        END
      ELSE g
    END
    ORDER BY go
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

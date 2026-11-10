-- PR 037: Integrasi SKDR Landing Page pada '/' & pemindahan Beranda autentikasi ke '/beranda'.
-- Backup app_settings.navigation_menu ke app_settings_bak_059. Rollback: rollback/059_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_059 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE WHEN e.g->>'id' = 'grp_beranda' THEN
      jsonb_set(
        e.g,
        '{items}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN it.item->>'id' = 'mod_beranda'
              THEN jsonb_set(it.item, '{href}', '"/beranda"'::jsonb)
              ELSE it.item
            END
            ORDER BY it.n
          )
          FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS it(item, n)
        ), '[]'::jsonb)
      )
    ELSE e.g
    END
    ORDER BY e.n
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_beranda"}]'::jsonb;

COMMIT;

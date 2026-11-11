-- PR 048: Sembunyikan Dasbor SKDR EBS & IBS (mod_dasbor_ebs_ibs) dari sidebar menu
-- dan ubah label "Dasbor Utama" (mod_main_dashboard) menjadi "Dasbor SKDR".
-- Halaman /dasbor/ebs-ibs tetap ada, hanya dinonaktifkan dari navigasi sidebar.
-- Rollback: rollback/065_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_065 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE WHEN g->>'id' = 'grp_dasbor' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(
        CASE
          WHEN i->>'id' = 'mod_dasbor_ebs_ibs' THEN jsonb_set(i, '{enabled}', 'false'::jsonb)
          WHEN i->>'id' = 'mod_main_dashboard' THEN jsonb_set(i, '{label}', '"Dasbor SKDR"'::jsonb)
          ELSE i
        END
        ORDER BY o
      )
      FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)
    ))
    ELSE g END
    ORDER BY go
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

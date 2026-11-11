-- PR 058: Rename Dasbor Kategori to Dasbor Zoonosis & integrate Zoonosis Lite
-- Mengubah label menu mod_dasbor_kategori menjadi "Dasbor Zoonosis",
-- ikon menjadi "Bug", dan memastikan mod_zoonosis_lite masuk sebagai sub-menu di bawahnya.
-- Rollback: rollback/072_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_072 AS
SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE WHEN g->>'id' = 'grp_dasbor' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(
        CASE
          WHEN i->>'id' = 'mod_dasbor_kategori' THEN
            jsonb_set(
              jsonb_set(
                jsonb_set(i, '{label}', '"Dasbor Zoonosis"'::jsonb),
                '{description}', '"Dasbor analitik penyakit zoonosis dan per kategori"'::jsonb
              ),
              '{icon}', '"Bug"'::jsonb
            )
          ELSE i
        END
        ORDER BY o
      )
      FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)
      WHERE i->>'id' != 'mod_zoonosis_lite'
    ))
    ELSE g END
    ORDER BY go
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

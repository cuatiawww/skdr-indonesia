-- PR 072: Sub-Menu Dokumentasi 3 Bidang (SKDR, MBG, Zoonosis)
-- Menambahkan 3 sub-item pada mod_dokumentasi di bawah grup LAINNYA (grp_bantuan)
-- Rollback: rollback/077_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_077 AS
SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

WITH dok_subs AS (
  SELECT '[
    {"id": "sub_dok_skdr", "label": "Dokumentasi SKDR", "href": "/dokumentasi/skdr", "icon": "Activity", "order": 1, "enabled": true, "description": "Sistem lama vs baru IBS dan EBS, form mingguan, dan dasbor SKDR"},
    {"id": "sub_dok_mbg", "label": "Dokumentasi MBG", "href": "/dokumentasi/mbg", "icon": "Utensils", "order": 2, "enabled": true, "description": "Sistem lama vs baru Program MBG: Pengawasan Gizi SPPG dan Keracunan Pangan"},
    {"id": "sub_dok_zoonosis", "label": "Dokumentasi Zoonosis", "href": "/dokumentasi/zoonosis", "icon": "Bug", "order": 3, "enabled": true, "description": "Sistem baru Form PE Zoonosis One Health dan Dasbor Analitik Zoonosis"}
  ]'::jsonb AS data
)
UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN g->>'id' = 'grp_bantuan' THEN
        jsonb_set(
          g,
          '{items}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN i->>'id' = 'mod_dokumentasi' THEN
                  jsonb_set(i, '{subItems}', (SELECT data FROM dok_subs))
                ELSE i
              END
              ORDER BY o
            )
            FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)
          )
        )
      ELSE g
    END
    ORDER BY go
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

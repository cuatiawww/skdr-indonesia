-- PR 052: Dasbor MBG (revamp) — tautan "Dasbor MBG" juga ditaruh sebagai sub-menu pertama Program MBG (grup Transaksi),
-- di samping Pengawasan Gizi MBG & Keracunan Pangan MBG, supaya alur pencegahan → kejadian → analisis ada di satu menu.
-- Item Dasbor MBG di grup Dasbor (PR 036) tetap ada. Ringan: UPDATE idempoten satu baris app_settings.
-- Rollback: rollback/067_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_067 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', (
      SELECT COALESCE(jsonb_agg(CASE WHEN i.it->>'id' = 'mod_program_mbg' THEN jsonb_set(i.it, '{subItems}',
          '[{"id": "mod_dasbor_mbg_program", "label": "Dasbor MBG", "href": "/dasbor/mbg", "icon": "LayoutDashboard", "order": 0, "enabled": true,
             "description": "Ringkasan & tautan risiko: Keracunan Pangan MBG (kejadian) × Pengawasan Gizi MBG (pencegahan)"}]'::jsonb
          || COALESCE(i.it->'subItems', '[]'::jsonb))
        ELSE i.it END ORDER BY i.n), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)
    ))
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu'
  AND jsonb_typeof(value::jsonb) = 'array'
  AND value::jsonb::text LIKE '%mod_program_mbg%'
  AND value::jsonb::text NOT LIKE '%mod_dasbor_mbg_program%';

COMMIT;

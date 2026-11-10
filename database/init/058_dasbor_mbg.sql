-- PR 036: Dasbor MBG (/dasbor/mbg) — menu baru di grup Dasbor (navigation_menu).
-- Mengambil data langsung dari Transaksi Form Program MBG:
-- * Pengawasan Gizi MBG (`mbg_kunjungan`, `mbg_form`)
-- * Keracunan Pangan MBG (`mbg_keracunan`, `mbg_keracunan_update`)
-- Ringan: hanya UPDATE idempoten satu baris app_settings. Rollback: rollback/058_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_058 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_dasbor' THEN jsonb_set(e.g, '{items}',
      CASE WHEN COALESCE(e.g->'items', '[]'::jsonb) @> '[{"id": "mod_dasbor_mbg"}]'::jsonb
        THEN COALESCE(e.g->'items', '[]'::jsonb)
        ELSE COALESCE(e.g->'items', '[]'::jsonb) || '[{
          "id": "mod_dasbor_mbg",
          "label": "Dasbor MBG",
          "href": "/dasbor/mbg",
          "icon": "Utensils",
          "order": 1.9,
          "enabled": true,
          "description": "Dasbor Program Makan Bergizi Gratis: pengawasan standar gizi SPPG dan kejadian keracunan pangan MBG"
        }]'::jsonb
      END
    )
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_dasbor"}]'::jsonb;

COMMIT;

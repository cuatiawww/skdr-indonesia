-- PR 035: Dasbor SKDR EBS & IBS (/dasbor/ebs-ibs) — menu baru di grup Dasbor (navigation_menu).
-- Mengambil data langsung dari Transaksi Form Laporan EBS (laporan_ebs), Entri Data Agregat IBS (laporan_ibs),
-- dan Form Individu IBS (laporan_ibs_individu). Ringan: hanya UPDATE idempoten satu baris app_settings.
-- Rollback: rollback/057_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_057 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_dasbor' THEN jsonb_set(e.g, '{items}',
      CASE WHEN COALESCE(e.g->'items', '[]'::jsonb) @> '[{"id": "mod_dasbor_ebs_ibs"}]'::jsonb
        THEN COALESCE(e.g->'items', '[]'::jsonb)
        ELSE COALESCE(e.g->'items', '[]'::jsonb) || '[{
          "id": "mod_dasbor_ebs_ibs",
          "label": "Dasbor SKDR EBS & IBS",
          "href": "/dasbor/ebs-ibs",
          "icon": "BarChart3",
          "order": 1.8,
          "enabled": true,
          "description": "Dasbor analitik dari Transaksi Form Laporan EBS, Entri Data Agregat IBS, dan Form Individu IBS"
        }]'::jsonb
      END
    )
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_dasbor"}]'::jsonb;

COMMIT;


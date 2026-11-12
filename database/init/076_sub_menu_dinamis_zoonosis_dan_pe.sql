-- PR 070: Lepaskan Hardcoded Navigasi & Jadikan Seluruh Sub-Menu Sepenuhnya Dinamis
-- Mengisi subItems eksplisit untuk mod_dasbor_kategori (7 sub-item) dan mod_form_pe (5 sub-item),
-- serta menghapus flag 'source' agar seluruh menu dan sub-menu dikelola 100% dinamis melalui DB / Navigasi Manager.
-- Rollback: rollback/076_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_076 AS
SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

WITH zoonosis_subs AS (
  SELECT '[
    {"id": "sub_zoonosis_general", "label": "Zoonosis General", "href": "/dasbor/zoonosis-general", "icon": "LayoutDashboard", "order": 1, "enabled": true, "description": "Sintesis komprehensif penyakit zoonosis: beban kasus, CFR, kurva tren, alert SKDR, dan peta sebaran"},
    {"id": "sub_zoonosis_lite", "label": "Zoonosis Lite", "href": "/dasbor/zoonosis-lite", "icon": "Activity", "order": 2, "enabled": true, "description": "Antraks, Rabies, Leptospirosis, Flu Burung: CFR dan peta sebaran"},
    {"id": "sub_kategori_pd3i", "label": "PD3I", "href": "/dasbor/kategori/pd3i", "icon": "Shield", "order": 3, "enabled": true, "description": "Penyakit yang Dapat Dicegah Dengan Imunisasi (PD3I)"},
    {"id": "sub_kategori_tular_vektor", "label": "Tular Vektor", "href": "/dasbor/kategori/tular-vektor", "icon": "Bug", "order": 4, "enabled": true, "description": "Penyakit Tular Vektor dan Zoonotik"},
    {"id": "sub_kategori_menular_langsung", "label": "Menular Langsung", "href": "/dasbor/kategori/menular-langsung", "icon": "Users", "order": 5, "enabled": true, "description": "Penyakit Menular Langsung"},
    {"id": "sub_kategori_tular_makanan_air", "label": "Tular Makanan & Air", "href": "/dasbor/kategori/tular-makanan-air", "icon": "Layers", "order": 6, "enabled": true, "description": "Penyakit Tular Makanan dan Air Terkontaminasi"},
    {"id": "sub_kategori_pie", "label": "PIE", "href": "/dasbor/kategori/pie", "icon": "AlertTriangle", "order": 7, "enabled": true, "description": "Penyakit Infeksi Emerging (PIE)"}
  ]'::jsonb AS data
),
pe_subs AS (
  SELECT '[
    {"id": "sub_pe_daftar", "label": "Daftar PE", "href": "/pe", "icon": "FileSpreadsheet", "order": 1, "enabled": true, "description": "Daftar dan ringkasan penyelidikan epidemiologi semua penyakit"},
    {"id": "sub_pe_lepto", "label": "Leptospirosis", "href": "/pe/lepto", "icon": "FileText", "order": 2, "enabled": true, "description": "Formulir PE Leptospirosis"},
    {"id": "sub_pe_rabies", "label": "Rabies", "href": "/pe/rabies", "icon": "FileText", "order": 3, "enabled": true, "description": "Formulir PE Rabies / GHPR"},
    {"id": "sub_pe_antraks", "label": "Antraks", "href": "/pe/antraks", "icon": "FileText", "order": 4, "enabled": true, "description": "Formulir PE Antraks"},
    {"id": "sub_pe_ai", "label": "Flu Burung", "href": "/pe/ai", "icon": "FileText", "order": 5, "enabled": true, "description": "Formulir PE Flu Burung / Avian Influenza"}
  ]'::jsonb AS data
)
UPDATE app_settings SET value = (
  SELECT jsonb_agg(
    CASE
      WHEN g->>'id' = 'grp_dasbor' THEN
        jsonb_set(
          g,
          '{items}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN i->>'id' = 'mod_dasbor_kategori' THEN
                  jsonb_set((i - 'source'), '{subItems}', (SELECT data FROM zoonosis_subs))
                ELSE i
              END
              ORDER BY o
            )
            FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)
          )
        )
      WHEN g->>'id' = 'grp_transaksi' THEN
        jsonb_set(
          g,
          '{items}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN i->>'id' = 'mod_form_pe' THEN
                  jsonb_set((i - 'source'), '{subItems}', (SELECT data FROM pe_subs))
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

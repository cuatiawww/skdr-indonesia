-- PR 054: Mengembalikan "Dasbor MBG" menjadi 1 item menu induk (mod_dasbor_mbg) di dalam grup "Dasbor" (grp_dasbor)
-- dengan 3 sub-menu (subItems): Ringkasan Eksekutif, Keracunan Pangan, dan Pengawasan Gizi, serta menghapus grup
-- terpisah grp_dasbor_mbg dari app_settings.navigation_menu.
-- Idempoten + tabel cadangan app_settings_bak_069. Rollback: database/rollback/069_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_069 AS
SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings
SET value = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN e.g->>'id' = 'grp_dasbor' THEN jsonb_set(
          e.g,
          '{items}',
          (
            SELECT COALESCE(jsonb_agg(i.it ORDER BY i.n), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)
            WHERE i.it->>'id' IS DISTINCT FROM 'mod_dasbor_mbg'
          ) || '[{
            "id": "mod_dasbor_mbg",
            "label": "Dasbor MBG",
            "href": "#",
            "icon": "Utensils",
            "order": 1.9,
            "enabled": true,
            "description": "Dasbor analitik Program Makan Bergizi Gratis (MBG): Ringkasan Eksekutif, Analisa Keracunan Pangan, dan Analisa Pengawasan Gizi",
            "subItems": [
              {
                "id": "mod_dasbor_mbg_ringkasan",
                "label": "Ringkasan Eksekutif",
                "href": "/dashboard/mbg/ringkasan",
                "icon": "LayoutDashboard",
                "order": 1,
                "enabled": true,
                "description": "Kajian eksekutif pimpinan, rekomendasi pengerahan sumber daya, korelasi risiko pengawasan × kejadian, dan peta komparasi spasial"
              },
              {
                "id": "mod_dasbor_mbg_keracunan",
                "label": "Keracunan Pangan",
                "href": "/dashboard/mbg/keracunan",
                "icon": "AlertTriangle",
                "order": 2,
                "enabled": true,
                "description": "Analisa epidemiologi KLB keracunan pangan: beban kasus/CFR, peta sebaran, kurva epidemi, ketepatan respons 24 jam, etiologi lab & lingkungan dapur"
              },
              {
                "id": "mod_dasbor_mbg_pengawasan",
                "label": "Pengawasan Gizi",
                "href": "/dashboard/mbg/pengawasan",
                "icon": "ClipboardCheck",
                "order": 3,
                "enabled": true,
                "description": "Analisa kepatuhan standar gizi & audit SPPG (Formulir 1–13): cakupan, aspek terlemah, matriks SPPG × formulir, temuan & daftar prioritas pembinaan"
              }
            ]
          }]'::jsonb
        )
        ELSE e.g
      END
      ORDER BY e.n
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
  WHERE e.g->>'id' IS DISTINCT FROM 'grp_dasbor_mbg'
)::text,
updated_at = now()
WHERE key = 'navigation_menu'
  AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

-- PR 057: Menjadikan "Dasbor SKDR" (mod_main_dashboard) di dalam grup "Dasbor" (grp_dasbor)
-- memiliki 6 sub-menu terpadu (subItems): Ringkasan Utama (IBS & EBS), Tren Penyakit (IBS),
-- Distribusi & Demografi, WHO 7-1-7 & Kinerja EBS, Deteksi Outbreak & Iklim, dan Buletin & Infografis.
-- Idempoten + tabel cadangan app_settings_bak_071. Rollback: database/rollback/071_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_071 AS
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
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN i.it->>'id' = 'mod_main_dashboard' THEN '{
                    "id": "mod_main_dashboard",
                    "label": "Dasbor SKDR",
                    "href": "#",
                    "icon": "LayoutDashboard",
                    "order": 1,
                    "enabled": true,
                    "description": "Dasbor komando surveilans terpadu SKDR: Ringkasan IBS & EBS, Tren Penyakit, Distribusi Demografi, Kinerja 7-1-7, Deteksi Outbreak, dan Buletin",
                    "subItems": [
                      {
                        "id": "mod_skdr_ringkasan",
                        "label": "Ringkasan Utama (IBS & EBS)",
                        "href": "/dashboard/skdr/ringkasan",
                        "icon": "LayoutDashboard",
                        "order": 1,
                        "enabled": true,
                        "description": "Sintesis komando surveilans nasional: beban kasus IBS, rumor & sinyal EBS, kelengkapan & ketepatan faskes (target ≥80%), serta peta spasial klaster"
                      },
                      {
                        "id": "mod_skdr_tren",
                        "label": "Tren Penyakit (IBS)",
                        "href": "/dashboard/skdr/tren",
                        "icon": "TrendingUp",
                        "order": 2,
                        "enabled": true,
                        "description": "Kurva epidemiologi mingguan (Minggu 1–52) per penyakit indikator dengan ambang batas (Mean + 2SD), komparasi multi-tahun, multi-wilayah, dan korelasi iklim ERA5"
                      },
                      {
                        "id": "mod_skdr_distribusi",
                        "label": "Distribusi & Demografi",
                        "href": "/dashboard/skdr/distribusi",
                        "icon": "Users",
                        "order": 3,
                        "enabled": true,
                        "description": "Analisa distribusi orang (piramida golongan usia dan jenis kelamin), sebaran unit pelapor (Puskesmas, RS, Klinik, Lab), serta peringkat insidensi wilayah"
                      },
                      {
                        "id": "mod_skdr_717",
                        "label": "WHO 7-1-7 & Kinerja EBS",
                        "href": "/dashboard/skdr/717",
                        "icon": "Clock",
                        "order": 4,
                        "enabled": true,
                        "description": "Pengukuran ketepatan respon standar internasional WHO: deteksi ≤7 hari, notifikasi ≤1 hari, respon ≤7 hari, kualitas sinyal, konversi KLB, dan AAR"
                      },
                      {
                        "id": "mod_skdr_deteksi",
                        "label": "Deteksi Outbreak & Iklim",
                        "href": "/dashboard/skdr/deteksi",
                        "icon": "Activity",
                        "order": 5,
                        "enabled": true,
                        "description": "Algoritma statistik deteksi dini KLB (EARS C1–C3 & Farrington), korelasi titik panas karhutla (NASA FIRMS) vs lonjakan ISPA, serta radar kapasitas IHR/JEE"
                      },
                      {
                        "id": "mod_skdr_buletin",
                        "label": "Buletin & Infografis",
                        "href": "/dashboard/skdr/buletin",
                        "icon": "FileText",
                        "order": 6,
                        "enabled": true,
                        "description": "Generator laporan buletin mingguan otomatis skala nasional/provinsi dan infografis digital responsif siap unduh (PNG) serta cetak PDF"
                      }
                    ]
                  }'::jsonb
                  ELSE i.it
                END
                ORDER BY i.n
              ),
              '[]'::jsonb
            )
            FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)
          )
        )
        ELSE e.g
      END
      ORDER BY e.n
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text,
updated_at = now()
WHERE key = 'navigation_menu'
  AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

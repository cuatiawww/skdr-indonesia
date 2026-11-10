-- PR 044: Spasial (Dasbor Limited) - peta analisa SKDR IBS & EBS (choropleth, titik unit pelapor, kluster, heatmap, hotspot).
-- * skdr_norm_nama(text)  : nama unit pelapor dinormalkan (huruf besar, spasi tunggal) untuk pencocokan koordinat.
-- * analisa_unit_lokasi   : tabel turunan (materialized view, +/- 25 ribu baris) koordinat unit pelapor.
--     kunci 'k:<kode unit>'                 -> Laporan Agregat/Individu IBS (unit_key = kode unit SKDR)
--     kunci 'n:<NAMA UNIT>|<kabkota_id>'    -> Laporan EBS (unit pelapor hanya berupa nama + kab/kota)
--   Sumber koordinat: titik unit pada Alert SKDR (skdr_alerts, koordinat terbanyak per unit), cadangan master_fasyankes.
--   Koordinat di luar kotak batas Indonesia / (0,0) diabaikan. Di-refresh backend (CONCURRENTLY) paling sering 1x per 12 jam.
-- * navigation_menu       : badge "Segera" pada menu Spasial dihapus.
-- Laporan EBS / IBS sendiri tidak menyimpan koordinat; tidak ada data yang diubah.
-- Rollback: database/rollback/064_rollback.sql
BEGIN;

CREATE OR REPLACE FUNCTION skdr_norm_nama(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT NULLIF(upper(regexp_replace(trim(t), '\s+', ' ', 'g')), '') $$;

DROP MATERIALIZED VIEW IF EXISTS analisa_unit_lokasi;
CREATE MATERIALIZED VIEW analisa_unit_lokasi AS
WITH a AS (
  SELECT NULLIF(trim(kode_unit), '') AS kode, skdr_norm_nama(unit) AS nama, kabkota_id,
         round(latitude::numeric, 5)::float8 AS lat, round(longitude::numeric, 5)::float8 AS lon, count(*) AS n
  FROM skdr_alerts
  WHERE latitude BETWEEN -11.5 AND 6.5 AND longitude BETWEEN 94.5 AND 141.5
  GROUP BY 1, 2, 3, 4, 5
), m AS (
  SELECT NULLIF(trim(kode_sarana), '') AS kode, skdr_norm_nama(nama) AS nama, kabkota_id, latitude AS lat, longitude AS lon
  FROM master_fasyankes
  WHERE latitude BETWEEN -11.5 AND 6.5 AND longitude BETWEEN 94.5 AND 141.5
), c AS (
  SELECT 'k:' || kode AS kunci, lat, lon, 'Alert SKDR'::text AS sumber, 1 AS pr, n FROM a WHERE kode IS NOT NULL
  UNION ALL SELECT 'n:' || nama || '|' || kabkota_id, lat, lon, 'Alert SKDR', 1, n FROM a WHERE nama IS NOT NULL AND kabkota_id IS NOT NULL
  UNION ALL SELECT 'k:' || kode, lat, lon, 'Master fasyankes', 2, 1 FROM m WHERE kode IS NOT NULL
  UNION ALL SELECT 'n:' || nama || '|' || kabkota_id, lat, lon, 'Master fasyankes', 2, 1 FROM m WHERE nama IS NOT NULL AND kabkota_id IS NOT NULL
)
SELECT DISTINCT ON (kunci) kunci, lat, lon, sumber FROM c ORDER BY kunci, pr, n DESC, lat, lon;

CREATE UNIQUE INDEX analisa_unit_lokasi_kunci ON analisa_unit_lokasi (kunci);

CREATE TABLE IF NOT EXISTS app_settings_bak_064 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_dasbor_limited' THEN jsonb_set(g, '{items}', (
           SELECT jsonb_agg(CASE WHEN i->>'id' = 'mod_spasial'
                                 THEN (i - 'badge') || '{"description": "Peta analisa SKDR EBS & IBS: choropleth wilayah, titik unit pelapor, kluster, heatmap, hotspot dan putar ulang per minggu epid"}'::jsonb
                                 ELSE i END ORDER BY o)
           FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)))
         ELSE g END ORDER BY go)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go))::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

COMMIT;

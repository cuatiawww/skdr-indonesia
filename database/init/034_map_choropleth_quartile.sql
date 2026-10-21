-- PR 018: kelas choropleth mengikuti Spesifikasi Dashboard Executive No. 57:
-- "Lima kelas warna: 0, lalu empat kelas berdasarkan kuartil" — batas dihitung ulang untuk setiap peta dari wilayah
-- bernilai > 0 pada tingkat yang ditampilkan (kuartil 25/50/75%), sehingga ambang provinsi, kab/kota, dan unit berbeda.
-- DB menyimpan aturan (kuantil) + warna; batas angka dihitung frontend dari data terfilter. Backup: app_settings_bak_034.
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_034 AS SELECT key, value FROM app_settings WHERE key = 'map_choropleth';
INSERT INTO app_settings (key, value) VALUES ('map_choropleth', '{"mode":"quantile","quantiles":[0.25,0.5,0.75],
 "zero_color":"#E3ECEA","colors":["#B9DDD6","#7CC4B8","#3A9E90","#0F6E64"]}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
COMMIT;

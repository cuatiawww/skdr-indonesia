-- PR 019: grup sidebar "Master Data" dilengkapi Provinsi, Kabupaten/Kota, Penyakit (halaman /master/* sudah ada sejak PR 004).
-- Ketiganya pernah ada di menu (011, grup MASTER DATA) lalu terhapus saat 028 menulis ulang seluruh menu.
-- Urutan: Provinsi, Kabupaten/Kota, Penyakit, Puskesmas, Rumah Sakit. Rollback: rollback/037_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_037 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_master' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(it ORDER BY (it->>'order')::numeric) FROM (
        SELECT * FROM jsonb_array_elements(jsonb_build_array(
          jsonb_build_object('id','mod_master_provinsi','href','/master/provinsi','icon','Globe2','label','Provinsi','order',1,'enabled',true,'description','Master data provinsi'),
          jsonb_build_object('id','mod_master_kabupaten','href','/master/kabupaten','icon','MapPin','label','Kabupaten/Kota','order',2,'enabled',true,'description','Master data kabupaten/kota'),
          jsonb_build_object('id','mod_master_penyakit','href','/master/penyakit','icon','Stethoscope','label','Penyakit','order',3,'enabled',true,'description','Master data penyakit')))
        UNION ALL
        SELECT CASE e->>'id' WHEN 'mod_master_puskesmas' THEN jsonb_set(e,'{order}','4') WHEN 'mod_master_rs' THEN jsonb_set(e,'{order}','5') ELSE e END
          FROM jsonb_array_elements(g->'items') e
          WHERE e->>'id' NOT IN ('mod_master_provinsi','mod_master_kabupaten','mod_master_penyakit')
      ) s(it))) ELSE g END ORDER BY i)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY x(g, i)
), updated_at = now()
WHERE key = 'navigation_menu';
COMMIT;

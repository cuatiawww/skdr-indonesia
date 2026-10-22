-- PR 021: grup Dasbor: Dasbor Utama, Dasbor Kategori (sub-menu dibuat dari master_disease_categories), Penyakit,
-- Laboratorium, Klaster, Mode TV. Grup lain (termasuk Master Data) tidak diubah. Rollback: rollback/041_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_041 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_dasbor' THEN jsonb_set(g, '{items}', (
      SELECT jsonb_agg(it ORDER BY (it->>'order')::numeric) FROM (
        SELECT CASE e->>'id' WHEN 'mod_main_dashboard' THEN jsonb_set(e,'{order}','1') WHEN 'mod_penyakit' THEN jsonb_set(e,'{order}','3')
                             WHEN 'mod_tv' THEN jsonb_set(e,'{order}','6') ELSE e END
          FROM jsonb_array_elements(g->'items') e
          WHERE e->>'id' NOT IN ('mod_dasbor_kategori','mod_laboratorium','mod_klaster')
        UNION ALL
        SELECT * FROM jsonb_array_elements(jsonb_build_array(
          jsonb_build_object('id','mod_dasbor_kategori','href','#','icon','Layers','label','Dasbor Kategori','order',2,'enabled',true,
                             'source','disease_categories','description','Dasbor per kategori penyakit'),
          jsonb_build_object('id','mod_laboratorium','href','/laboratorium','icon','Activity','label','Laboratorium','order',4,'enabled',true,
                             'description','Pemeriksaan spesimen dan hasil laboratorium dari Alert SKDR'),
          jsonb_build_object('id','mod_klaster','href','/klaster','icon','Waypoints','label','Klaster','order',5,'enabled',true,
                             'description','Klaster dan KLB dari Alert SKDR dan EBS')))
      ) s(it))) ELSE g END ORDER BY i)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY x(g, i)
), updated_at = now()
WHERE key = 'navigation_menu';
COMMIT;

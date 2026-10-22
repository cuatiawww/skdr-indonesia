-- PR 019: sidebar group "Master Data" with Puskesmas / Rumah Sakit (SATUSEHAT master fasyankes). Rollback: rollback/036_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_036 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = ((
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_bantuan' THEN jsonb_set(g, '{order}', '6') ELSE g END ORDER BY (g->>'order')::numeric)
  FROM jsonb_array_elements(value::jsonb) g WHERE g->>'id' <> 'grp_master'
) || jsonb_build_array(jsonb_build_object(
  'id', 'grp_master', 'title', 'Master Data', 'order', 5, 'enabled', true, 'items', jsonb_build_array(
    jsonb_build_object('id', 'mod_master_puskesmas', 'href', '/master/puskesmas', 'icon', 'Building2', 'label', 'Puskesmas', 'order', 1, 'enabled', true,
      'description', 'Master Puskesmas dari SATUSEHAT Master Sarana Index'),
    jsonb_build_object('id', 'mod_master_rs', 'href', '/master/rumah-sakit', 'icon', 'Hospital', 'label', 'Rumah Sakit', 'order', 2, 'enabled', true,
      'description', 'Master Rumah Sakit dari SATUSEHAT Master Sarana Index')))))::text
WHERE key = 'navigation_menu';
COMMIT;

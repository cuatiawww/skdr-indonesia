-- Rollback 016: remove Form PE Rabies/GHPR (its PE cases, clusters and definition rows) and its submenu.
DELETE FROM pe_cases WHERE form_key = 'rabies';
DELETE FROM pe_clusters WHERE form_key = 'rabies';
DELETE FROM pe_counters WHERE form_key = 'rabies';
DELETE FROM pe_form_definitions WHERE form_key = 'rabies';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_form_pe'
           THEN jsonb_set(g, '{items,0,subItems}', COALESCE((SELECT jsonb_agg(s) FROM jsonb_array_elements(g->'items'->0->'subItems') s WHERE s->>'id' <> 'sub_pe_rabies'), '[]'::jsonb))
           ELSE g END ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(g, ord))::text, updated_at = now()
WHERE key = 'navigation_menu';
DELETE FROM schema_migrations WHERE filename = '016_pe_form_rabies.sql';

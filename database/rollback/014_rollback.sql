-- Rollback 014: drop the PE engine (all PE cases, clusters and form definitions are removed) and restore the menu.
-- Run the per-form rollbacks (015+) first.
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_014 b WHERE a.key = b.key;
DROP TABLE app_settings_bak_014;
DELETE FROM app_settings WHERE key = 'pe_workflow';
DROP TABLE IF EXISTS pe_case_events;
DROP TABLE IF EXISTS pe_cases;
DROP TABLE IF EXISTS pe_clusters;
DROP TABLE IF EXISTS pe_counters;
DROP TABLE IF EXISTS pe_form_definitions;
DELETE FROM schema_migrations WHERE filename = '014_pe_engine.sql';

DROP TABLE IF EXISTS case_reports; DROP TABLE IF EXISTS master_locations;
DROP TABLE IF EXISTS master_diseases; DROP TABLE IF EXISTS app_settings;
DELETE FROM schema_migrations WHERE filename IN ('001_schema.sql','002_seed_master.sql');

-- 007: Indonesia only (Yosua, 2026-10-21). Drop region/country master (ASEAN/ASEAN+3/GLOBAL, 67 countries).
-- Rollback: database/rollback/007_rollback.sql
ALTER TABLE case_reports DROP COLUMN IF EXISTS country_id;
ALTER TABLE master_locations DROP COLUMN IF EXISTS country_iso2;
DROP TABLE IF EXISTS master_country_regions;
DROP TABLE IF EXISTS master_countries;
DROP TABLE IF EXISTS master_regions;

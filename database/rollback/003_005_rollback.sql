DELETE FROM app_settings WHERE key IN ('navigation_menu','session_idle_timeout_seconds','session_absolute_timeout_seconds');
DROP TABLE IF EXISTS user_sessions; DROP TABLE IF EXISTS users;
ALTER TABLE case_reports DROP COLUMN IF EXISTS country_id, DROP COLUMN IF EXISTS location_name, DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude, DROP COLUMN IF EXISTS is_reviewed, DROP COLUMN IF EXISTS reviewed_at, DROP COLUMN IF EXISTS created_by;
ALTER TABLE master_locations DROP COLUMN IF EXISTS country_iso2, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
DROP TABLE IF EXISTS master_country_regions; DROP TABLE IF EXISTS master_countries; DROP TABLE IF EXISTS master_regions;
DELETE FROM schema_migrations WHERE filename IN ('003_dashboard_schema.sql','004_seed_countries.sql','005_location_coords.sql');

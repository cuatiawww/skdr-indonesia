-- 003: tables needed by the NLP main-dashboard copy (countries/regions, coords, review flag, auth).
CREATE TABLE IF NOT EXISTS master_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 999,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS master_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 TEXT NOT NULL UNIQUE,
  iso3 TEXT NOT NULL,
  name TEXT NOT NULL,
  flag_code TEXT,
  home_region TEXT,
  display_order INT NOT NULL DEFAULT 999,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS master_country_regions (
  country_id UUID NOT NULL REFERENCES master_countries(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES master_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (country_id, region_id)
);

ALTER TABLE master_locations ADD COLUMN IF NOT EXISTS country_iso2 TEXT NOT NULL DEFAULT 'ID';
ALTER TABLE master_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE master_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE case_reports ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES master_countries(id);
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180);
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE case_reports ADD COLUMN IF NOT EXISTS created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_case_reports_country ON case_reports (country_id);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

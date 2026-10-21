-- 001: core schema for SKDR Indonesia (form + dashboard)
CREATE TABLE IF NOT EXISTS master_diseases (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS master_locations (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'province',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS case_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disease_id INT NOT NULL REFERENCES master_diseases(id),
  location_id INT NOT NULL REFERENCES master_locations(id),
  report_date DATE NOT NULL,
  cases INT NOT NULL CHECK (cases >= 0),
  deaths INT NOT NULL DEFAULT 0 CHECK (deaths >= 0 AND deaths <= cases),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_reports_date ON case_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_case_reports_disease ON case_reports (disease_id);
CREATE INDEX IF NOT EXISTS idx_case_reports_location ON case_reports (location_id);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

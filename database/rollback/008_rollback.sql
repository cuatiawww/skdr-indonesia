-- Rollback 008: restore the 14 diseases of 002 (same ids) and each report's previous disease.
ALTER TABLE master_diseases DROP CONSTRAINT IF EXISTS master_diseases_code_key;
INSERT INTO master_diseases (id, code, name, is_active, created_at) SELECT id, 'OLD_' || code, name, is_active, created_at FROM master_diseases_bak_008;
UPDATE case_reports r SET disease_id = o.id FROM case_reports_disease_bak_008 b JOIN master_diseases_bak_008 o ON o.code = b.old_code WHERE b.report_id = r.id;
DELETE FROM master_diseases WHERE code NOT LIKE 'OLD\_%' AND id NOT IN (SELECT disease_id FROM case_reports);
UPDATE master_diseases SET code = substr(code, 5) WHERE code LIKE 'OLD\_%';
ALTER TABLE master_diseases ADD CONSTRAINT master_diseases_code_key UNIQUE (code);
ALTER TABLE master_diseases DROP COLUMN IF EXISTS canonical_name, DROP COLUMN IF EXISTS english_name, DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS is_zoonotic, DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS aliases_id;
DROP TABLE case_reports_disease_bak_008; DROP TABLE master_diseases_bak_008;
DELETE FROM schema_migrations WHERE filename = '008_master_diseases_31.sql';

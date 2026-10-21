-- Rollback 013: un-map the seeded diagnosa (manual mappings untouched) and refresh ebs_reports.disease_id.
UPDATE ebs_diagnosa_alias SET disease_id = NULL, match_source = NULL, updated_at = now() WHERE match_source = 'seed';
UPDATE ebs_reports e SET disease_id = a.disease_id FROM ebs_diagnosa_alias a
WHERE a.diagnosa = lower(trim(e.diagnosa)) AND e.disease_id IS DISTINCT FROM a.disease_id;
DELETE FROM schema_migrations WHERE filename = '013_ebs_diagnosa_seed.sql';

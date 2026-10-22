-- PR 021 rollback: kembalikan data form dari skema backup_pr021 (urutan mengikuti foreign key).
BEGIN;
INSERT INTO case_reports   SELECT * FROM backup_pr021.case_reports   ON CONFLICT DO NOTHING;
INSERT INTO pe_counters    SELECT * FROM backup_pr021.pe_counters    ON CONFLICT DO NOTHING;
INSERT INTO pe_clusters    SELECT * FROM backup_pr021.pe_clusters    ON CONFLICT DO NOTHING;
INSERT INTO pe_cases       SELECT * FROM backup_pr021.pe_cases       ON CONFLICT DO NOTHING;
INSERT INTO pe_case_events SELECT * FROM backup_pr021.pe_case_events ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('pe_cases','id'),       GREATEST((SELECT COALESCE(MAX(id),0) FROM pe_cases),1));
SELECT setval(pg_get_serial_sequence('pe_case_events','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM pe_case_events),1));
SELECT setval(pg_get_serial_sequence('pe_clusters','id'),    GREATEST((SELECT COALESCE(MAX(id),0) FROM pe_clusters),1));
COMMIT;
SELECT 'pe_cases' t, COUNT(*) FROM pe_cases UNION ALL SELECT 'pe_case_events', COUNT(*) FROM pe_case_events UNION ALL
SELECT 'pe_clusters', COUNT(*) FROM pe_clusters UNION ALL SELECT 'pe_counters', COUNT(*) FROM pe_counters UNION ALL SELECT 'case_reports', COUNT(*) FROM case_reports;

-- PR 021 rollback 043
BEGIN;
DROP TABLE IF EXISTS skdr_alert_fakta;
DELETE FROM schema_migrations WHERE filename = '043_skdr_alert_fakta.sql';
COMMIT;

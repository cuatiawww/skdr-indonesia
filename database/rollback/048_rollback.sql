-- PR 022 rollback 048
UPDATE app_settings SET value = (value::jsonb - 'max_kasus_per_alert')::text WHERE key = 'epicurve_config';
DELETE FROM schema_migrations WHERE filename = '048_epicurve_batas_kasus.sql';

-- PR 022 rollback 047 (heatmap tampil lagi; urutan kembali ke bawaan komponen)
BEGIN;
DELETE FROM app_settings WHERE key IN ('dashboard_sections','epicurve_config');
DELETE FROM schema_migrations WHERE filename = '047_dasbor_seksi_epicurve.sql';
COMMIT;

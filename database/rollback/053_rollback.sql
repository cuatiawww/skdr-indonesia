-- Rollback PR 030 (053_laporan_ebs_ibs.sql). Menghapus tabel laporan EBS/IBS (termasuk draf & lampiran!) dan
-- mengembalikan navigation_menu dari app_settings_bak_053.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_053 b WHERE a.key = b.key;
DROP TABLE IF EXISTS laporan_lampiran;
DROP TABLE IF EXISTS laporan_events;
DROP TABLE IF EXISTS laporan_ebs;
DROP TABLE IF EXISTS laporan_ibs;
DROP TABLE IF EXISTS laporan_counters;
DROP TABLE IF EXISTS ibs_penyakit;
DROP TABLE IF EXISTS laporan_opsi;
DROP TABLE IF EXISTS app_settings_bak_053;
DELETE FROM schema_migrations WHERE filename = '053_laporan_ebs_ibs.sql';
COMMIT;

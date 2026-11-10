-- Rollback PR 034 (056_keracunan_pangan_mbg.sql). Menghapus tabel Keracunan Pangan MBG (termasuk laporan, update harian & lampiran!),
-- riwayat & nomor urut jenis 'kpm', mengembalikan CHECK laporan_events dan navigation_menu dari app_settings_bak_056.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_056 b WHERE a.key = b.key;
DELETE FROM laporan_events WHERE jenis = 'kpm';
ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs', 'individu', 'mbg'));
DELETE FROM laporan_counters WHERE jenis = 'kpm';
DROP TABLE IF EXISTS mbg_keracunan_lampiran;
DROP TABLE IF EXISTS mbg_keracunan_update;
DROP TABLE IF EXISTS mbg_keracunan;
DROP TABLE IF EXISTS app_settings_bak_056;
DELETE FROM schema_migrations WHERE filename = '056_keracunan_pangan_mbg.sql';
COMMIT;

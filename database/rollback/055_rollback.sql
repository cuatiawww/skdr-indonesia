-- Rollback PR 033 (055_pengawasan_gizi_mbg.sql). Menghapus tabel Pengawasan Gizi MBG (termasuk draf & lampiran!),
-- riwayat & nomor urut jenis 'mbg', mengembalikan CHECK laporan_events dan navigation_menu dari app_settings_bak_055.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_055 b WHERE a.key = b.key;
DELETE FROM laporan_events WHERE jenis = 'mbg';
ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs', 'individu'));
DELETE FROM laporan_counters WHERE jenis = 'mbg';
DROP TABLE IF EXISTS mbg_lampiran;
DROP TABLE IF EXISTS mbg_form;
DROP TABLE IF EXISTS mbg_kunjungan;
DROP TABLE IF EXISTS app_settings_bak_055;
DELETE FROM schema_migrations WHERE filename = '055_pengawasan_gizi_mbg.sql';
COMMIT;

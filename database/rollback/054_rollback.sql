-- Rollback PR 031 (054_laporan_ibs_individu.sql). Menghapus tabel Form Individu IBS (termasuk draf!), opsi baru,
-- riwayat & nomor urut jenis 'individu', dan mengembalikan navigation_menu dari app_settings_bak_054.
BEGIN;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_054 b WHERE a.key = b.key;
DELETE FROM laporan_events WHERE jenis = 'individu';
ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs'));
DELETE FROM laporan_counters WHERE jenis = 'individu';
DELETE FROM laporan_opsi WHERE kelompok IN ('pekerjaan', 'kelamin', 'status_imunisasi', 'status_akhir');
DROP TABLE IF EXISTS laporan_ibs_individu;
DROP TABLE IF EXISTS app_settings_bak_054;
DELETE FROM schema_migrations WHERE filename = '054_laporan_ibs_individu.sql';
COMMIT;

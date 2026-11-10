-- Rollback PR 042 (063_matriks_analisa.sql): view/fungsi/trigger/indeks/kolom analisa dihapus, menu & api_cache dikembalikan.
BEGIN;
DROP VIEW IF EXISTS analisa_ebs_fakta;
DROP VIEW IF EXISTS analisa_ibs_fakta;
DROP FUNCTION IF EXISTS skdr_epi_ws(date);
DROP FUNCTION IF EXISTS skdr_tgl(text);
DROP TRIGGER IF EXISTS trg_laporan_ibs_baris_meta ON laporan_ibs_baris;
DROP FUNCTION IF EXISTS laporan_ibs_baris_meta_trg();
DROP INDEX IF EXISTS idx_laporan_ibs_baris_analisa;
DROP INDEX IF EXISTS idx_laporan_ibs_kinerja;
ALTER TABLE laporan_ibs_baris DROP COLUMN IF EXISTS kecamatan, DROP COLUMN IF EXISTS jenis_unit, DROP COLUMN IF EXISTS kelompok;
UPDATE app_settings a SET value = b.value, updated_at = now() FROM app_settings_bak_063 b WHERE a.key = b.key;
DROP TABLE IF EXISTS app_settings_bak_063;
DELETE FROM app_settings WHERE key = 'matriks_analisa';
DELETE FROM schema_migrations WHERE filename = '063_matriks_analisa.sql';
COMMIT;

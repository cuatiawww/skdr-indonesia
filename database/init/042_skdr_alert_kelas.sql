-- PR 021: kolom turunan Alert SKDR (dihitung saat sinkronisasi dari lab_klaster_config) supaya seksi Laboratorium/Klaster
-- tidak mengklasifikasi ulang 500 ribu baris tiap permintaan. Nilai API: spesimen Ya/Tidak/-, hasil positif/negatif/dalam_proses/-,
-- respon24 Ya/Tidak, klb 0/1/2. Rollback: rollback/042_rollback.sql
BEGIN;
ALTER TABLE skdr_alerts ADD COLUMN IF NOT EXISTS ada_spesimen BOOLEAN, ADD COLUMN IF NOT EXISTS lab_kelas TEXT,
  ADD COLUMN IF NOT EXISTS is_klb BOOLEAN, ADD COLUMN IF NOT EXISTS respon24_ok BOOLEAN;
CREATE INDEX IF NOT EXISTS skdr_alerts_klb ON skdr_alerts(tahun, minggu) WHERE is_klb;
CREATE INDEX IF NOT EXISTS skdr_alerts_spesimen ON skdr_alerts(tahun, minggu) WHERE ada_spesimen;
CREATE TABLE IF NOT EXISTS app_settings_bak_042 AS SELECT key, value FROM app_settings WHERE key = 'lab_klaster_config';
UPDATE app_settings SET value = (value::jsonb || '{"respon24_ok":["ya","1"],"lab_result_map":{"positif":"positif","negatif":"negatif","dalam_proses":"proses"},"lab_class_labels":{"positif":"Positif","negatif":"Negatif","proses":"Dalam proses","lainnya":"Hasil lain","belum":"Belum ada hasil"}}'::jsonb)::text,
  updated_at = now() WHERE key = 'lab_klaster_config';
COMMIT;

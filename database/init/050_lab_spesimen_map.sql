-- PR 028: kolom "spesimen diperiksa" Alert SKDR kadang berisi kode "1"/"2" (bukan "ya"/"tidak").
-- Aturan baru lab_klaster_config.lab_specimen_map menerjemahkan kode itu sebelum uji nilai-kosong (alert.rs classify),
-- nilai sumber tidak diubah. Baris berkode di-reset lab_kelas = NULL agar scheduler mengklasifikasi ulang
-- (lalu membangun ulang skdr_alert_fakta). Kode hasil lab "1"/"2"/"3" sengaja TIDAK dipetakan (masih pertanyaan terbuka).
-- Rollback: rollback/050_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_050 AS SELECT key, value FROM app_settings WHERE key = 'lab_klaster_config';
UPDATE app_settings
   SET value = jsonb_set(value::jsonb, '{lab_specimen_map}', '{"1": "ya", "2": "tidak"}'::jsonb, true)::text, updated_at = now()
 WHERE key = 'lab_klaster_config' AND NOT (value::jsonb ? 'lab_specimen_map');
UPDATE skdr_alerts SET lab_kelas = NULL WHERE trim(spesimen_diperiksa) IN ('1', '2');
COMMIT;

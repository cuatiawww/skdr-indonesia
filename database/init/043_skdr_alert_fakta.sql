-- PR 021: tabel ramping Alert SKDR untuk seksi Laboratorium/Klaster (skdr_alerts ~2,6 GB karena teks kronologi/raw;
-- agregasi langsung di sana 17-28 detik). Diisi ulang otomatis di akhir tiap sinkronisasi (alert::classify).
-- Rollback: rollback/043_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS skdr_alert_fakta (
  alert_id BIGINT PRIMARY KEY, tahun INT NOT NULL, minggu INT NOT NULL, yw INT NOT NULL,
  province_id INT, kabkota_id INT, disease_id INT, kode_penyakit TEXT, nama_penyakit TEXT,
  provinsi TEXT, kota TEXT, unit TEXT, unit_key TEXT, unit_id TEXT,
  kasus INT NOT NULL DEFAULT 0, jml_kematian INT NOT NULL DEFAULT 0, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  ada_spesimen BOOLEAN NOT NULL DEFAULT false, spesimen TEXT, lab_kelas TEXT NOT NULL DEFAULT 'belum',
  is_klb BOOLEAN NOT NULL DEFAULT false, respon24_ok BOOLEAN NOT NULL DEFAULT false, is_case BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS skdr_alert_fakta_yw ON skdr_alert_fakta(yw);
CREATE INDEX IF NOT EXISTS skdr_alert_fakta_klb ON skdr_alert_fakta(yw) WHERE is_klb;
COMMIT;

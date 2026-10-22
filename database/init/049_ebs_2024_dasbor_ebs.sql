-- PR 023: EBS 2024 ikut disinkron, kab/kota EBS dipetakan juga via kode wilayah baru (master_kabkota.code, mis. Papua Selatan 93xx),
-- dan parameter analitik EBS Dasbor Utama. Rollback: rollback/049_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_049 AS SELECT key, value FROM app_settings WHERE key = 'ebs_sync_config';
UPDATE app_settings SET value = jsonb_set(value::jsonb, '{years}', '["current","previous",2024]'::jsonb)::text, updated_at = now()
WHERE key = 'ebs_sync_config' AND NOT (value::jsonb -> 'years') @> '[2024]'::jsonb;

CREATE TABLE IF NOT EXISTS ebs_kabkota_bak_049 AS SELECT id, kabkota_id FROM ebs_reports WHERE kabkota_id IS NULL;
UPDATE ebs_reports e SET kabkota_id = k.id FROM master_kabkota k
WHERE e.kabkota_id IS NULL AND k.code = trim(e.kode_depdagri_kota);

INSERT INTO app_settings (key, value) VALUES ('ebs_dashboard_config', '{
  "max_kasus_per_laporan": 50000, "outlier_flag_kasus": 100, "histogram_bins": [0,1,2,5,10,20,50,100,500,1000],
  "silent_weeks": 4, "silent_baseline_weeks": 12, "top_units": 15, "respons_target_days": 7,
  "tindakan_kelas": {
    "Penyelidikan epidemiologi": ["penyelidikan epidemiologi", "pe ", "investigasi", "pelacakan"],
    "Vaksinasi / imunisasi": ["vaksin", "imunisasi", "var ", "sar "],
    "Pengambilan spesimen / lab": ["spesimen", "sampel", "laborator", "swab"],
    "Tata laksana / rujukan": ["rujuk", "rawat", "pengobatan", "terapi", "obat"],
    "Penyuluhan / KIE": ["penyuluhan", "edukasi", "kie", "sosialisasi"],
    "Pengendalian vektor": ["fogging", "psn", "larvasida", "abate", "jumantik"],
    "Koordinasi lintas sektor": ["lintas sektor", "koordinasi", "dinas peternakan", "keswan"]
  },
  "saran_kelas": {
    "Logistik / obat": ["logistik", "obat", "apd", "stok"],
    "Vaksin": ["vaksin", "imunisasi", "var "],
    "Laboratorium": ["laborator", "spesimen", "sampel"],
    "Koordinasi lintas sektor": ["lintas sektor", "koordinasi"],
    "Pemantauan / surveilans": ["pantau", "pemantauan", "surveilans", "monitoring"],
    "Penyuluhan": ["penyuluhan", "edukasi", "sosialisasi"]
  }
}') ON CONFLICT (key) DO NOTHING;

COMMIT;

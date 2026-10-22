-- PR 021: data Alert SKDR mingguan (API https://skdr.surveilans.org/api/alert) untuk seksi Laboratorium & Klaster.
-- Field pribadi (temuan, petugas_verifikasi) tidak disimpan. Rollback: rollback/040_rollback.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS skdr_alerts (
  id BIGSERIAL PRIMARY KEY,
  uniq_id BIGINT NOT NULL UNIQUE,
  kategori_unit_id TEXT, kategori_unit TEXT, unit_id TEXT, kode_unit TEXT,
  provinsi TEXT, kota TEXT, kecamatan TEXT, unit TEXT,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  nama_penyakit TEXT, kode_penyakit TEXT,
  tahun INT NOT NULL, minggu INT NOT NULL,
  kasus INT NOT NULL DEFAULT 0, jml_kematian INT NOT NULL DEFAULT 0,
  sts_verifikasi TEXT, tgl_verifikasi TIMESTAMP, klb TEXT, respon24 TEXT, jenis_verif TEXT,
  gejala TEXT, kronologi TEXT, tindakan TEXT, spesimen_diperiksa TEXT, hasil_pemeriksaan TEXT,
  province_id INT REFERENCES master_locations(id), kabkota_id INT REFERENCES master_kabkota(id), disease_id INT REFERENCES master_diseases(id),
  raw JSONB, first_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(), synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS skdr_alerts_week ON skdr_alerts(tahun, minggu);
CREATE INDEX IF NOT EXISTS skdr_alerts_disease ON skdr_alerts(disease_id);
CREATE INDEX IF NOT EXISTS skdr_alerts_kode ON skdr_alerts(kode_penyakit);
CREATE INDEX IF NOT EXISTS skdr_alerts_prov ON skdr_alerts(province_id, kabkota_id);

CREATE TABLE IF NOT EXISTS skdr_alert_sync_log (
  id BIGSERIAL PRIMARY KEY, trigger TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  pages INT NOT NULL DEFAULT 0, rows_fetched INT NOT NULL DEFAULT 0, rows_upserted INT NOT NULL DEFAULT 0, retries INT NOT NULL DEFAULT 0, error TEXT
);

-- Kode penyakit SKDR (API /penyakit) -> master penyakit. NULL = belum ada padanan di master (tetap tampil dengan nama SKDR).
CREATE TABLE IF NOT EXISTS skdr_penyakit_map (
  kode_penyakit TEXT PRIMARY KEY, nama TEXT, disease_id INT REFERENCES master_diseases(id),
  is_case BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
WITH m(kode, nama, dcode, is_case) AS (VALUES
 ('01AWD','Diare Akut',NULL,true), ('02JAD','Sindrom Jaundice Akut',NULL,true), ('03AFP','Acute Flacid Paralysis (AFP)','POLIO',true),
 ('04ARI','Pnemonia',NULL,true), ('05BDR','Diare Berdarah/ Disentri',NULL,true), ('07DPR','Kasus Observasi Difteri','DIPHTHERIA',true),
 ('08DBT','Gigitan Hewan Penular Rabies',NULL,true), ('11HAF','Suspek Flu Burung Pada Manusia','AVIAN_INFLUENZA',true),
 ('12MAL','Malaria Konfirmasi','MALARIA',true), ('13PTS','Suspek Pertusis','PERTUSSIS',true), ('14ATX','Suspek Antrax','ANTHRAX',true),
 ('15SCR','Suspek Kolera',NULL,true), ('16SDF','Suspek Dengue','DENGUE',true), ('18MEA','Suspek Campak','MEASLES',true),
 ('19MEN','Suspek Meningitis/Encephalitis',NULL,true), ('20STT','Suspek Tetanus',NULL,true), ('21STF','Suspek Demam Tifoid','TYPHOID',true),
 ('TOTA','Total Kunjungan',NULL,false), ('23STN','Suspek Tetanus Neonatorum',NULL,true), ('24ILI','ILI (Penyakit Serupa Influenza)',NULL,true),
 ('25CHK','Suspek Chikungunya','CHIKUNGUNYA',true), ('26LPT','Suspek Leptospirosis','LEPTOSPIROSIS',true), ('27HFMD','Suspek HFMD','HFMD',true),
 ('19COV','Covid-19 Konfirmasi','COVID19',true), ('ISPA','ISPA',NULL,true))
INSERT INTO skdr_penyakit_map (kode_penyakit, nama, disease_id, is_case)
SELECT m.kode, m.nama, d.id, m.is_case FROM m LEFT JOIN master_diseases d ON d.code = m.dcode
ON CONFLICT (kode_penyakit) DO NOTHING;

INSERT INTO app_settings (key, value) VALUES
 ('skdr_alert_sync', '{"enabled":true,"api_url":"https://skdr.surveilans.org/api/alert","weeks_back":8,"interval_minutes":360,"page_size":1000,"max_retries":3,"retry_delay_secs":10,"timeout_secs":180}'),
 ('lab_klaster_config', '{"lab_empty_values":["","-","--","0","tidak ada","tidak","belum","belum ada","tidak diperiksa","nihil"],"lab_positive_words":["positif","positive","reaktif","(+)"],"lab_negative_words":["negatif","negative","non reaktif","non-reaktif","(-)"],"klb_values":["1"],"ebs_klb_values":["1"],"ebs_cluster_diagnosa":["kluster penyakit yang tidak lazim"],"ebs_lab_diagnosa_words":["konfirm laboratorium","dengan hasil lab"],"suspek_prefix":"suspek","respon24_ok":["1"],"top_n":15}')
ON CONFLICT (key) DO NOTHING;
COMMIT;

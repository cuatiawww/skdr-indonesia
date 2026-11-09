-- PR 030: Form SKDR-EBS & SKDR-IBS versi wizard (input laporan di SKDR Indonesia, gaya Form PE).
-- * laporan_opsi   : daftar pilihan form (jenis unit, status kejadian, sumber informasi, hasil lab, dst.). Nilai diambil
--                    dari form resmi SKDR Kemkes (observasi read-only 9 Nov 2026). Sumber Informasi & Hasil Lab baru
--                    berisi 15 opsi pertama yang tercatat (form resmi: 32 & 44 opsi) — lengkapi lewat tabel ini.
--                    Penyakit Rumor/Terverifikasi TIDAK di sini: dibaca dari ebs_diagnosa_alias (nama diagnosa EBS resmi).
-- * ibs_penyakit   : 24 penyakit + Total Kunjungan pada tabel agregat IBS (kode SMS & kode penyakit dari form resmi;
--                    nama_asli = label resmi, nama = label yang dirapikan).
-- * laporan_ebs / laporan_ibs : draf & laporan terkirim (data JSONB + kolom ringkas untuk daftar & cek duplikat).
-- * laporan_lampiran : lampiran EBS (bytea, maks. 5 MB per file — dibatasi backend).
-- * laporan_events   : riwayat (dibuat, dikirim, dihapus) per laporan; laporan_counters: nomor urut per tahun.
-- * navigation_menu  : grup Transaksi + "Laporan EBS" (/ebs/laporan) dan "Laporan IBS" (/ibs/laporan).
-- Hanya tabel baru kecil + UPDATE satu baris app_settings (ringan). Rollback: rollback/053_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS laporan_opsi (
  id SERIAL PRIMARY KEY,
  kelompok TEXT NOT NULL,
  nilai TEXT NOT NULL,
  label TEXT,
  urutan INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (kelompok, nilai)
);
INSERT INTO laporan_opsi (kelompok, nilai, label, urutan) VALUES
  ('jenis_unit', 'BKK', NULL, 1), ('jenis_unit', 'Dinas Kesehatan Kabupaten', 'Dinas Kesehatan Kabupaten/Kota', 2),
  ('jenis_unit', 'Dinas Kesehatan Provinsi', NULL, 3), ('jenis_unit', 'Klinik', NULL, 4), ('jenis_unit', 'Laboratorium', NULL, 5),
  ('jenis_unit', 'PHEOC', NULL, 6), ('jenis_unit', 'Puskesmas', NULL, 7), ('jenis_unit', 'Rumah Sakit', NULL, 8),
  ('status_kejadian', 'Dalam investigasi', 'Dalam Investigasi', 1), ('status_kejadian', 'Discarded', 'Discarded (bukan kasus)', 2),
  ('status_kejadian', 'Terverifikasi', NULL, 3),
  ('status_kejadian', 'Terverifikasi dan sudah dilakukan koordinasi lintas sektor', NULL, 4),
  ('status_kejadian', 'Terverifikasi Penyakit Infeksi Emerging', NULL, 5),
  ('sumber_informasi', 'Alert SKDR', NULL, 1), ('sumber_informasi', 'BBLK', NULL, 2), ('sumber_informasi', 'BBLKL', NULL, 3),
  ('sumber_informasi', 'BBTKL PP', NULL, 4), ('sumber_informasi', 'BLKM', NULL, 5), ('sumber_informasi', 'BTKL PP', NULL, 6),
  ('sumber_informasi', 'EIOS', NULL, 7), ('sumber_informasi', 'Google Alert', NULL, 8), ('sumber_informasi', 'IDAI', NULL, 9),
  ('sumber_informasi', 'Kementerian Kesehatan Website', NULL, 10), ('sumber_informasi', 'Klinik', NULL, 11),
  ('sumber_informasi', 'Labkesda Kab/Kota', NULL, 12), ('sumber_informasi', 'Labkesda Provinsi', NULL, 13),
  ('sumber_informasi', 'Litbangkes', NULL, 14), ('sumber_informasi', 'lainnya', 'Lainnya', 99),
  ('hasil_lab', 'Cryptococcus neoformans', NULL, 1), ('hasil_lab', 'Cryptosporidium', NULL, 2), ('hasil_lab', 'DBD', NULL, 3),
  ('hasil_lab', 'Demam Dengue', NULL, 4), ('hasil_lab', 'Demam Kuning', NULL, 5), ('hasil_lab', 'disentriae', 'Disentriae', 6),
  ('hasil_lab', 'E. coli', NULL, 7), ('hasil_lab', 'Entero Toxin Escherichia coli (ETEC)', NULL, 8),
  ('hasil_lab', 'Enteropathogenic Escherechia coli (EPEC)', 'Enteropathogenic Escherichia coli (EPEC)', 9),
  ('hasil_lab', 'GHPR', NULL, 10), ('hasil_lab', 'Giardia lamblia', NULL, 11), ('hasil_lab', 'Hemophilus influenzae', 'Haemophilus influenzae', 12),
  ('hasil_lab', 'Hepatitis A', NULL, 13), ('hasil_lab', 'Hepatitis Akut yang tidak diketahui etiologinya', NULL, 14), ('hasil_lab', 'Hepatitis B', NULL, 15),
  ('tatalaksana', 'Isolasi', NULL, 1), ('tatalaksana', 'Karantina', NULL, 2), ('tatalaksana', 'Pengobatan', NULL, 3), ('tatalaksana', 'Rujukan', NULL, 4),
  ('sumber_w1', 'Dinkes Kako', 'Dinkes Kab/Kota', 1), ('sumber_w1', 'Puskesmas', NULL, 2),
  ('status_klb', 'Berakhir', NULL, 1), ('status_klb', 'Masih Berlangsung', NULL, 2),
  ('ya_tidak', 'Ya', NULL, 1), ('ya_tidak', 'Tidak', NULL, 2),
  ('kelompok_unit', 'Pemerintah', NULL, 1), ('kelompok_unit', 'TNI', NULL, 2), ('kelompok_unit', 'Polri', NULL, 3), ('kelompok_unit', 'Swasta', NULL, 4)
ON CONFLICT (kelompok, nilai) DO NOTHING;

CREATE TABLE IF NOT EXISTS ibs_penyakit (
  kode TEXT PRIMARY KEY,
  urutan INT NOT NULL,
  kode_sms TEXT NOT NULL,
  nama TEXT NOT NULL,
  nama_asli TEXT NOT NULL,
  is_total BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO ibs_penyakit (urutan, kode_sms, kode, nama, nama_asli, is_total) VALUES
  (1, 'A', '01AWD', 'Diare Akut', 'Diare Akut', FALSE),
  (2, 'B', '12MAL', 'Malaria Konfirmasi', 'Malaria Konfirmasi', FALSE),
  (3, 'C', '16SDF', 'Suspek Dengue', 'Suspek Dengue', FALSE),
  (4, 'D', '04ARI', 'Pneumonia', 'Pnemonia', FALSE),
  (5, 'E', '05BDR', 'Diare Berdarah/Disentri', 'Diare Berdarah/ Disentri', FALSE),
  (6, 'F', '21STF', 'Suspek Demam Tifoid', 'Suspek Demam Tifoid', FALSE),
  (7, 'G', '02JAD', 'Sindrom Jaundice Akut', 'Sindrom Jaundice Akut', FALSE),
  (8, 'H', '25CHK', 'Suspek Chikungunya', 'Suspek Chikungunya', FALSE),
  (9, 'J', '11HAF', 'Suspek Flu Burung pada Manusia', 'Suspek Flu Burung Pada Manusia', FALSE),
  (10, 'K', '18MEA', 'Suspek Campak', 'Suspek Campak', FALSE),
  (11, 'L', '07DPR', 'Kasus Observasi Difteri', 'Kasus Observasi Difteri', FALSE),
  (12, 'M', '13PTS', 'Suspek Pertusis', 'Suspek Pertusis', FALSE),
  (13, 'N', '03AFP', 'Acute Flaccid Paralysis (AFP)', 'Acute Flacid Paralysis (AFP)', FALSE),
  (14, 'P', '08DBT', 'Gigitan Hewan Penular Rabies', 'Gigitan Hewan Penular Rabies', FALSE),
  (15, 'Q', '14ATX', 'Suspek Antraks', 'Suspek Antrax', FALSE),
  (16, 'R', '26LPT', 'Suspek Leptospirosis', 'Suspek Leptospirosis', FALSE),
  (17, 'S', '15SCR', 'Suspek Kolera', 'Suspek Kolera', FALSE),
  (18, 'U', '19MEN', 'Suspek Meningitis/Ensefalitis', 'Suspek Meningitis/Encephalitis', FALSE),
  (19, 'V', '23STN', 'Suspek Tetanus Neonatorum', 'Suspek Tetanus Neonatorum', FALSE),
  (20, 'W', '20STT', 'Suspek Tetanus', 'Suspek Tetanus', FALSE),
  (21, 'Y', '24ILI', 'ILI (Penyakit Serupa Influenza)', 'ILI (Penyakit Serupa Influenza)', FALSE),
  (22, 'Z', '27HFMD', 'Suspek HFMD', 'Suspek HFMD', FALSE),
  (23, 'AA', 'ISPA', 'ISPA', 'ISPA', FALSE),
  (24, 'AC', '19COV', 'COVID-19 Konfirmasi', 'Covid-19 Konfirmasi', FALSE),
  (25, 'X', 'TOTA', 'Total Kunjungan', 'Total Kunjungan', TRUE)
ON CONFLICT (kode) DO NOTHING;

CREATE TABLE IF NOT EXISTS laporan_counters (
  jenis TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (jenis, year)
);

CREATE TABLE IF NOT EXISTS laporan_ebs (
  id BIGSERIAL PRIMARY KEY,
  no_laporan TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikirim')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  tgl_laporan DATE,
  tgl_rumor DATE,
  penyakit_rumor TEXT,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  dom_kabkota_id INT REFERENCES master_kabkota(id),
  unit_nama TEXT,
  jml_kasus INT,
  jml_kematian INT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_laporan_ebs_list ON laporan_ebs (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ebs_dup ON laporan_ebs (lower(penyakit_rumor), tgl_rumor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ebs_user ON laporan_ebs (created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS laporan_ibs (
  id BIGSERIAL PRIMARY KEY,
  no_laporan TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikirim')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  tahun INT,
  minggu INT CHECK (minggu IS NULL OR minggu BETWEEN 1 AND 53),
  unit_key TEXT,
  unit_nama TEXT,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  total_kasus INT,
  total_kematian INT,
  total_kunjungan INT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_list ON laporan_ibs (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_periode ON laporan_ibs (unit_key, tahun, minggu) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_user ON laporan_ibs (created_by, updated_at DESC);
-- satu laporan terkirim per unit + tahun + minggu
CREATE UNIQUE INDEX IF NOT EXISTS ux_laporan_ibs_terkirim ON laporan_ibs (unit_key, tahun, minggu) WHERE status = 'dikirim' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS laporan_lampiran (
  id BIGSERIAL PRIMARY KEY,
  laporan_id BIGINT NOT NULL REFERENCES laporan_ebs(id) ON DELETE CASCADE,
  judul TEXT,
  nama_file TEXT NOT NULL,
  tipe TEXT NOT NULL,
  ukuran INT NOT NULL CHECK (ukuran > 0),
  isi BYTEA NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_laporan_lampiran_laporan ON laporan_lampiran (laporan_id);

CREATE TABLE IF NOT EXISTS laporan_events (
  id BIGSERIAL PRIMARY KEY,
  jenis TEXT NOT NULL CHECK (jenis IN ('ebs', 'ibs')),
  laporan_id BIGINT NOT NULL,
  event TEXT NOT NULL,
  note TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_laporan_events ON laporan_events (jenis, laporan_id, id);

-- navigation_menu: item Laporan EBS & Laporan IBS di grup Transaksi (idempoten)
CREATE TABLE IF NOT EXISTS app_settings_bak_053 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', COALESCE(e.g->'items', '[]'::jsonb) || '[
      {"id": "mod_laporan_ebs", "label": "Laporan EBS", "href": "/ebs/laporan", "icon": "Radio", "description": "Formulir Surveilans Berbasis Kejadian (EBS) — wizard 7 langkah", "order": 2, "enabled": true},
      {"id": "mod_laporan_ibs", "label": "Laporan IBS (Agregat)", "href": "/ibs/laporan", "icon": "FileSpreadsheet", "description": "Entri data agregat mingguan per Puskesmas/unit (IBS)", "order": 3, "enabled": true}]'::jsonb)
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_transaksi"}]'::jsonb
  AND NOT (value::jsonb::text LIKE '%mod_laporan_ebs%');
COMMIT;

-- PR 021: kategori penyakit (DB-driven). Satu penyakit boleh masuk lebih dari satu kategori
-- (mis. Flu Burung = Zoonosis + PIE); is_primary menandai kategori utama untuk label/warna.
-- Rollback: rollback/039_rollback.sql. Tabel baru saja, tidak mengubah baris yang sudah ada.
BEGIN;
CREATE TABLE IF NOT EXISTS master_disease_categories (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  sort_order  INT NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS master_disease_category_map (
  disease_id  INT NOT NULL REFERENCES master_diseases(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES master_disease_categories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (disease_id, category_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS master_disease_category_map_primary ON master_disease_category_map(disease_id) WHERE is_primary;

INSERT INTO master_disease_categories (code, name, short_name, description, color, icon, sort_order) VALUES
 ('ZOONOSIS', 'Zoonosis', 'Zoonosis', 'Penyakit yang ditularkan dari hewan ke manusia (rabies, antraks, leptospirosis, flu burung, dll.).', '#B45309', 'Bug', 1),
 ('PD3I', 'Penyakit yang Dapat Dicegah dengan Imunisasi (PD3I)', 'PD3I', 'Penyakit yang dapat dicegah dengan imunisasi rutin (campak, difteri, pertusis, polio, dll.).', '#2563EB', 'ShieldCheck', 2),
 ('TULAR_VEKTOR', 'Penyakit Tular Vektor', 'Tular Vektor', 'Penyakit yang ditularkan oleh vektor seperti nyamuk dan kutu (dengue, malaria, chikungunya, zika, filariasis).', '#7C3AED', 'Bug', 3),
 ('MENULAR_LANGSUNG', 'Penyakit Menular Langsung & Saluran Napas', 'Menular Langsung', 'Penyakit yang menular antarmanusia secara langsung, termasuk infeksi saluran napas (COVID-19, TBC, HFMD, HIV/AIDS).', '#0F766E', 'Users', 4),
 ('TULAR_MAKANAN_AIR', 'Penyakit Tular Makanan, Air & Lingkungan', 'Tular Makanan & Air', 'Penyakit yang menular lewat makanan, air, atau lingkungan tercemar (tifoid, melioidosis).', '#0891B2', 'Droplets', 5),
 ('PIE', 'Penyakit Infeksi Emerging (PIE)', 'PIE', 'Penyakit infeksi baru atau muncul kembali yang berpotensi wabah (Ebola, MERS, Nipah, Mpox, penyakit tidak dikenal).', '#DC2626', 'AlertTriangle', 6)
ON CONFLICT (code) DO NOTHING;

-- Pemetaan per kode penyakit master (kategori utama = '*').
WITH m(dcode, ccode, prim) AS (VALUES
 ('ANTHRAX','ZOONOSIS',true),
 ('COVID19','MENULAR_LANGSUNG',true), ('COVID19','PIE',false),
 ('MPOX','PIE',true), ('MPOX','ZOONOSIS',false),
 ('MEASLES','PD3I',true),
 ('CHIKUNGUNYA','TULAR_VEKTOR',true),
 ('DENGUE','TULAR_VEKTOR',true),
 ('CRIMEAN_CONGO_HF','PIE',true), ('CRIMEAN_CONGO_HF','ZOONOSIS',false), ('CRIMEAN_CONGO_HF','TULAR_VEKTOR',false),
 ('LASSA_FEVER','PIE',true), ('LASSA_FEVER','ZOONOSIS',false),
 ('RIFT_VALLEY_FEVER','PIE',true), ('RIFT_VALLEY_FEVER','ZOONOSIS',false), ('RIFT_VALLEY_FEVER','TULAR_VEKTOR',false),
 ('DIPHTHERIA','PD3I',true),
 ('EBOLA','PIE',true), ('EBOLA','ZOONOSIS',false),
 ('LYMPHATIC_FILARIASIS','TULAR_VEKTOR',true),
 ('AVIAN_INFLUENZA','ZOONOSIS',true), ('AVIAN_INFLUENZA','PIE',false), ('AVIAN_INFLUENZA','MENULAR_LANGSUNG',false),
 ('HFMD','MENULAR_LANGSUNG',true),
 ('HIV_AIDS','MENULAR_LANGSUNG',true),
 ('HANTAVIRUS','ZOONOSIS',true),
 ('HENIPAVIRAL','ZOONOSIS',true), ('HENIPAVIRAL','PIE',false),
 ('LEPTOSPIROSIS','ZOONOSIS',true),
 ('MERS','PIE',true), ('MERS','ZOONOSIS',false), ('MERS','MENULAR_LANGSUNG',false),
 ('MALARIA','TULAR_VEKTOR',true),
 ('MARBURG','PIE',true), ('MARBURG','ZOONOSIS',false),
 ('MELIOIDOSIS','TULAR_MAKANAN_AIR',true),
 ('NIPAH','ZOONOSIS',true), ('NIPAH','PIE',false),
 ('UNKNOWN_DISEASE','PIE',true),
 ('PERTUSSIS','PD3I',true),
 ('POLIO','PD3I',true),
 ('RABIES','ZOONOSIS',true),
 ('TYPHOID','TULAR_MAKANAN_AIR',true),
 ('TUBERCULOSIS','MENULAR_LANGSUNG',true), ('TUBERCULOSIS','PD3I',false),
 ('WEST_NILE','TULAR_VEKTOR',true), ('WEST_NILE','ZOONOSIS',false), ('WEST_NILE','PIE',false),
 ('ZIKA','TULAR_VEKTOR',true), ('ZIKA','PIE',false))
INSERT INTO master_disease_category_map (disease_id, category_id, is_primary)
SELECT d.id, c.id, m.prim FROM m JOIN master_diseases d ON d.code = m.dcode JOIN master_disease_categories c ON c.code = m.ccode
ON CONFLICT (disease_id, category_id) DO NOTHING;
COMMIT;

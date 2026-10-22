-- PR 021: penyakit SKDR yang belum ada di master + kategori + pemetaan EBS diagnosa & kode Alert SKDR; GHPR -> Rabies.
-- Backup: ebs_diagnosa_alias_bak_044, skdr_penyakit_map_bak_044. Rollback: rollback/044_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS ebs_diagnosa_alias_bak_044 AS SELECT * FROM ebs_diagnosa_alias;
CREATE TABLE IF NOT EXISTS skdr_penyakit_map_bak_044 AS SELECT * FROM skdr_penyakit_map;

WITH n(code, name, en, cat_text, zoo) AS (VALUES
 ('DIARE_AKUT','Diare Akut','Acute Diarrhoea','Bacterial-Viral / Food & Water-borne',false),
 ('MUMPS','Parotitis (Mumps)','Mumps','Viral / Airborne',false),
 ('ILI','Penyakit Serupa Influenza (ILI)','Influenza-like Illness','Viral / Respiratory',false),
 ('INFLUENZA_A','Influenza A','Influenza A','Viral / Respiratory',false),
 ('PNEUMONIA','Pneumonia','Pneumonia','Respiratory',false),
 ('ISPA','ISPA','Acute Respiratory Infection','Respiratory',false),
 ('VARICELLA','Varisela (Cacar Air)','Varicella','Viral / Airborne',false),
 ('DISENTRI','Diare Berdarah / Disentri','Dysentery','Bacterial / Food & Water-borne',false),
 ('SINDROM_JAUNDICE','Sindrom Jaundice Akut','Acute Jaundice Syndrome','Viral / Food & Water-borne',false),
 ('HEPATITIS_A','Hepatitis A','Hepatitis A','Viral / Food & Water-borne',false),
 ('TETANUS','Tetanus','Tetanus','Bacterial / Environmental',false),
 ('TETANUS_NEONATORUM','Tetanus Neonatorum','Neonatal Tetanus','Bacterial / Environmental',false),
 ('MENINGITIS_ENSEFALITIS','Meningitis / Ensefalitis','Meningitis / Encephalitis','Bacterial-Viral / CNS',false),
 ('STREPTOCOCCUS_SUIS','Meningitis Streptococcus suis','Streptococcus suis','Bacterial / Zoonotic',true),
 ('JAPANESE_ENCEPHALITIS','Japanese Encephalitis','Japanese Encephalitis','Viral / Mosquito-borne',true),
 ('KOLERA','Kolera','Cholera','Bacterial / Water-borne',false),
 ('KERACUNAN_PANGAN','Keracunan Pangan','Food Poisoning','Food-borne',false),
 ('LEGIONELLOSIS','Legionellosis','Legionellosis','Bacterial / Environmental',false),
 ('KONJUNGTIVITIS','Konjungtivitis','Conjunctivitis','Contact',false),
 ('YELLOW_FEVER','Demam Kuning','Yellow Fever','Viral / Mosquito-borne',false),
 ('GGAPA','Gangguan Ginjal Akut Progresif Atipikal','Atypical Acute Kidney Injury','Unclassified / Outbreak',false))
INSERT INTO master_diseases (code, name, canonical_name, english_name, category, is_zoonotic, is_active, aliases_id)
SELECT code, name, code, en, cat_text, zoo, true, '[]'::jsonb FROM n ON CONFLICT (code) DO NOTHING;

WITH m(dcode, ccode, prim) AS (VALUES
 ('DIARE_AKUT','TULAR_MAKANAN_AIR',true), ('MUMPS','MENULAR_LANGSUNG',true), ('MUMPS','PD3I',false),
 ('ILI','MENULAR_LANGSUNG',true), ('INFLUENZA_A','MENULAR_LANGSUNG',true), ('PNEUMONIA','MENULAR_LANGSUNG',true), ('ISPA','MENULAR_LANGSUNG',true),
 ('VARICELLA','MENULAR_LANGSUNG',true), ('VARICELLA','PD3I',false), ('DISENTRI','TULAR_MAKANAN_AIR',true),
 ('SINDROM_JAUNDICE','TULAR_MAKANAN_AIR',true), ('HEPATITIS_A','TULAR_MAKANAN_AIR',true), ('HEPATITIS_A','PD3I',false),
 ('TETANUS','PD3I',true), ('TETANUS_NEONATORUM','PD3I',true), ('MENINGITIS_ENSEFALITIS','MENULAR_LANGSUNG',true),
 ('STREPTOCOCCUS_SUIS','ZOONOSIS',true), ('JAPANESE_ENCEPHALITIS','TULAR_VEKTOR',true), ('JAPANESE_ENCEPHALITIS','ZOONOSIS',false), ('JAPANESE_ENCEPHALITIS','PD3I',false),
 ('KOLERA','TULAR_MAKANAN_AIR',true), ('KERACUNAN_PANGAN','TULAR_MAKANAN_AIR',true), ('LEGIONELLOSIS','TULAR_MAKANAN_AIR',true),
 ('KONJUNGTIVITIS','MENULAR_LANGSUNG',true), ('YELLOW_FEVER','TULAR_VEKTOR',true), ('YELLOW_FEVER','PD3I',false), ('YELLOW_FEVER','PIE',false),
 ('GGAPA','PIE',true))
INSERT INTO master_disease_category_map (disease_id, category_id, is_primary)
SELECT d.id, c.id, m.prim FROM m JOIN master_diseases d ON d.code = m.dcode JOIN master_disease_categories c ON c.code = m.ccode
ON CONFLICT (disease_id, category_id) DO NOTHING;

-- EBS diagnosa (lower-case, as stored in ebs_diagnosa_alias) -> master code
WITH a(diag, dcode) AS (VALUES
 ('gigitan hewan penyebab rabies (ghpr)','RABIES'), ('diare akut','DIARE_AKUT'), ('suspek mumps','MUMPS'),
 ('ili (penyakit serupa influenza)','ILI'), ('influenza a','INFLUENZA_A'), ('suspek varicella','VARICELLA'),
 ('ispa/pneumoni (dengan hasil lab)','PNEUMONIA'), ('pnemonia','PNEUMONIA'), ('diare berdarah/ disentri','DISENTRI'),
 ('syndrome jaundice acute','SINDROM_JAUNDICE'), ('hepatitis a','HEPATITIS_A'), ('tetanus','TETANUS'), ('tetanus neonatorum','TETANUS_NEONATORUM'),
 ('suspek meninghitis','MENINGITIS_ENSEFALITIS'), ('meningitis/encephalitis','MENINGITIS_ENSEFALITIS'), ('meningitis streptococcus suis','STREPTOCOCCUS_SUIS'),
 ('suspek japanese encephalitis','JAPANESE_ENCEPHALITIS'), ('japanese encephalitis','JAPANESE_ENCEPHALITIS'),
 ('suspek kolera','KOLERA'), ('kolera','KOLERA'), ('keracunan pangan','KERACUNAN_PANGAN'),
 ('suspek legionellosis','LEGIONELLOSIS'), ('legionellosis','LEGIONELLOSIS'), ('conjunctivitis','KONJUNGTIVITIS'),
 ('demam kuning (yellow fever)','YELLOW_FEVER'), ('gangguan ginjal akut misterius','GGAPA'), ('kluster penyakit yang tidak lazim','UNKNOWN_DISEASE'))
UPDATE ebs_diagnosa_alias x SET disease_id = d.id, match_source = 'manual', updated_at = now()
FROM a JOIN master_diseases d ON d.code = a.dcode WHERE x.diagnosa = a.diag AND x.disease_id IS NULL;
UPDATE ebs_reports e SET disease_id = x.disease_id FROM ebs_diagnosa_alias x
WHERE x.diagnosa = lower(trim(e.diagnosa)) AND e.disease_id IS DISTINCT FROM x.disease_id;

-- Alert SKDR kode -> master code
WITH k(kode, dcode) AS (VALUES ('01AWD','DIARE_AKUT'), ('02JAD','SINDROM_JAUNDICE'), ('04ARI','PNEUMONIA'), ('05BDR','DISENTRI'),
 ('08DBT','RABIES'), ('15SCR','KOLERA'), ('19MEN','MENINGITIS_ENSEFALITIS'), ('20STT','TETANUS'), ('23STN','TETANUS_NEONATORUM'),
 ('24ILI','ILI'), ('ISPA','ISPA'))
UPDATE skdr_penyakit_map m SET disease_id = d.id, updated_at = now() FROM k JOIN master_diseases d ON d.code = k.dcode
WHERE m.kode_penyakit = k.kode AND m.disease_id IS NULL;
UPDATE skdr_alerts a SET disease_id = m.disease_id FROM skdr_penyakit_map m WHERE m.kode_penyakit = a.kode_penyakit AND a.disease_id IS DISTINCT FROM m.disease_id;
UPDATE skdr_alert_fakta f SET disease_id = m.disease_id FROM skdr_penyakit_map m WHERE m.kode_penyakit = f.kode_penyakit AND f.disease_id IS DISTINCT FROM m.disease_id;
COMMIT;

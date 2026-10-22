-- PR 021 rollback 044: kembalikan pemetaan EBS/Alert, hapus penyakit tambahan.
BEGIN;
DELETE FROM ebs_diagnosa_alias; INSERT INTO ebs_diagnosa_alias SELECT * FROM ebs_diagnosa_alias_bak_044;
DELETE FROM skdr_penyakit_map; INSERT INTO skdr_penyakit_map SELECT * FROM skdr_penyakit_map_bak_044;
UPDATE ebs_reports e SET disease_id = x.disease_id FROM ebs_diagnosa_alias x WHERE x.diagnosa = lower(trim(e.diagnosa)) AND e.disease_id IS DISTINCT FROM x.disease_id;
UPDATE skdr_alerts a SET disease_id = m.disease_id FROM skdr_penyakit_map m WHERE m.kode_penyakit = a.kode_penyakit AND a.disease_id IS DISTINCT FROM m.disease_id;
UPDATE skdr_alert_fakta f SET disease_id = m.disease_id FROM skdr_penyakit_map m WHERE m.kode_penyakit = f.kode_penyakit AND f.disease_id IS DISTINCT FROM m.disease_id;
DELETE FROM master_diseases WHERE code IN ('DIARE_AKUT','MUMPS','ILI','INFLUENZA_A','PNEUMONIA','ISPA','VARICELLA','DISENTRI','SINDROM_JAUNDICE','HEPATITIS_A',
 'TETANUS','TETANUS_NEONATORUM','MENINGITIS_ENSEFALITIS','STREPTOCOCCUS_SUIS','JAPANESE_ENCEPHALITIS','KOLERA','KERACUNAN_PANGAN','LEGIONELLOSIS',
 'KONJUNGTIVITIS','YELLOW_FEVER','GGAPA');
DROP TABLE IF EXISTS ebs_diagnosa_alias_bak_044; DROP TABLE IF EXISTS skdr_penyakit_map_bak_044;
DELETE FROM schema_migrations WHERE filename = '044_penyakit_skdr_tambahan.sql';
COMMIT;

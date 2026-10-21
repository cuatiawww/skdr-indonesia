-- 008: disease master = the 31 ASEAN master diseases used by NLP-PENYAKIT/ABVC.
-- Source: NLP-PENYAKIT database/init/120_clean_and_inject_asean_master_diseases.sql (disease_id, canonical_name, english_name,
-- category, is_zoonotic, description, Indonesian (language='id') aliases). name = Indonesian display name: NLP locales/id.json
-- diseases.<canonical_name> when present, otherwise the first NLP Indonesian alias. Replaces the 14-disease seed of 002.
-- Existing reports are re-pointed by code (TB->TUBERCULOSIS, LEPTO->LEPTOSPIROSIS, AFP->POLIO); others go to UNKNOWN_DISEASE.
-- Old disease of every report is kept in case_reports_disease_bak_008 for the rollback (database/rollback/008_rollback.sql).
ALTER TABLE master_diseases ADD COLUMN IF NOT EXISTS canonical_name TEXT, ADD COLUMN IF NOT EXISTS english_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT, ADD COLUMN IF NOT EXISTS is_zoonotic BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS aliases_id JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE case_reports_disease_bak_008 AS SELECT r.id AS report_id, d.code AS old_code FROM case_reports r JOIN master_diseases d ON d.id = r.disease_id;
CREATE TABLE master_diseases_bak_008 AS SELECT id, code, name, is_active, created_at FROM master_diseases;
ALTER TABLE master_diseases DROP CONSTRAINT IF EXISTS master_diseases_code_key;
UPDATE master_diseases SET code = 'OLD_' || code, is_active = FALSE;
INSERT INTO master_diseases (code, name, canonical_name, english_name, category, is_zoonotic, description, aliases_id) VALUES
 ('ANTHRAX', 'Antraks', 'Anthrax', 'Anthrax', 'Bacterial / Zoonotic', TRUE, 'Serious infectious disease caused by Bacillus anthracis bacteria.', '["Antraks", "Radang limpa", "Bacillus anthracis"]'::jsonb),
 ('COVID19', 'COVID-19', 'COVID-19', 'Coronavirus disease 2019', 'Viral / Respiratory', TRUE, 'Infectious respiratory disease caused by SARS-CoV-2 coronavirus.', '["COVID-19", "Korona", "Corona", "Virus korona"]'::jsonb),
 ('MPOX', 'Cacar monyet', 'Mpox (Monkeypox)', 'Mpox', 'Viral / Zoonotic', TRUE, 'Zoonotic orthopoxvirus causing fever, rash, and lesions.', '["Cacar monyet", "Mpox", "Monkeypox"]'::jsonb),
 ('MEASLES', 'Campak', 'Measles', 'Measles', 'Viral / Airborne', FALSE, 'Highly contagious viral disease marked by fever and rash.', '["Campak", "Morbili", "Gabagen"]'::jsonb),
 ('CHIKUNGUNYA', 'Chikungunya', 'Chikungunya', 'Chikungunya disease', 'Viral / Mosquito-borne', FALSE, 'Viral disease transmitted by mosquitoes causing fever and debilitating joint pain.', '["Chikungunya", "Cikungunya", "Flu tulang"]'::jsonb),
 ('DENGUE', 'Demam Berdarah', 'Dengue', 'Dengue', 'Viral / Mosquito-borne', FALSE, 'Mosquito-borne viral infection widespread throughout ASEAN tropical regions.', '["DBD", "Demam berdarah", "Demam berdarah dengue", "Infeksi dengue", "Dengue"]'::jsonb),
 ('CRIMEAN_CONGO_HF', 'Demam Berdarah Krimea-Kongo', 'Crimean-Congo Hemorrhagic Fever', 'Crimean-Congo hemorrhagic fever', 'Viral / Hemorrhagic', TRUE, 'Tick-borne viral disease causing severe hemorrhagic fever outbreaks.', '["Demam Berdarah Krimea-Kongo", "Demam Krimea-Kongo", "CCHF"]'::jsonb),
 ('LASSA_FEVER', 'Demam Lassa', 'Lassa fever', 'Lassa fever', 'Viral / Hemorrhagic', TRUE, 'Acute viral hemorrhagic illness caused by Lassa virus.', '["Demam Lassa", "Lassa", "Virus Lassa"]'::jsonb),
 ('RIFT_VALLEY_FEVER', 'Demam Lembah Rift', 'Rift Valley Fever', 'Rift Valley fever', 'Viral / Zoonotic', TRUE, 'Viral zoonosis affecting domestic animals and humans via mosquitoes.', '["Demam Lembah Rift", "Rift Valley Fever", "RVF"]'::jsonb),
 ('DIPHTHERIA', 'Difteri', 'Diphtheria', 'Diphtheria', 'Bacterial / Respiratory', FALSE, 'Serious infection caused by strains of Corynebacterium diphtheriae making toxin.', '["Difteri", "Difteria"]'::jsonb),
 ('EBOLA', 'Ebola', 'Ebola', 'Ebola disease', 'Viral / Hemorrhagic', TRUE, 'Severe, often fatal viral hemorrhagic disease caused by Ebola virus.', '["Ebola", "Virus Ebola", "Penyakit virus Ebola"]'::jsonb),
 ('LYMPHATIC_FILARIASIS', 'Filariasis', 'Lymphatic Filariasis', 'Lymphatic filariasis', 'Parasitic / Vector-borne', FALSE, 'Parasitic infection causing elephantiasis transmitted by mosquitoes.', '["Filariasis", "Kaki gajah", "Penyakit kaki gajah"]'::jsonb),
 ('AVIAN_INFLUENZA', 'Flu Burung', 'Avian Influenza (Bird Flu)', 'Avian influenza', 'Viral / Respiratory', TRUE, 'Infection caused by avian influenza viruses (H5N1, H7N9) adapted to birds.', '["Flu Burung", "Avian Influenza", "Virus H5N1"]'::jsonb),
 ('HFMD', 'Flu Singapura', 'Hand, Foot, and Mouth Disease (HFMD)', 'Hand, foot and mouth disease', 'Viral / Enteric', FALSE, 'Common contagious childhood illness caused by enteroviruses (EV-A71, Coxsackie).', '["Flu Singapura", "Penyakit tangan kaki dan mulut", "PTKM", "HFMD"]'::jsonb),
 ('HIV_AIDS', 'HIV/AIDS', 'HIV/AIDS', 'HIV disease', 'Viral / Immunodeficiency', FALSE, 'Human immunodeficiency virus infection and acquired immunodeficiency syndrome.', '["HIV/AIDS", "HIV", "AIDS", "Odha"]'::jsonb),
 ('HANTAVIRUS', 'Hantavirus', 'Hantavirus', 'Hantavirus disease', 'Viral / Zoonotic', TRUE, 'Virus transmitted by rodents causing hemorrhagic fever with renal syndrome or HPS.', '["Hantavirus", "Demam berdarah sindrom ginjal"]'::jsonb),
 ('HENIPAVIRAL', 'Henipavirus', 'Henipaviral disease', 'Henipavirus infection', 'Viral / Zoonotic', TRUE, 'Emerging zoonotic disease caused by Henipaviruses (Hendra, Nipah, Langya).', '["Henipavirus", "Penyakit Henipavirus", "Virus Hendra"]'::jsonb),
 ('LEPTOSPIROSIS', 'Leptospirosis', 'Leptospirosis', 'Leptospirosis', 'Bacterial / Zoonotic', TRUE, 'Bacterial disease spread through contact with water or soil contaminated by animal urine.', '["Leptospirosis", "Kencing tikus", "Demam kencing tikus"]'::jsonb),
 ('MERS', 'MERS', 'MERS', 'Middle East respiratory syndrome', 'Viral / Respiratory', TRUE, 'Middle East Respiratory Syndrome caused by MERS-CoV coronavirus.', '["MERS", "MERS-CoV", "Sindrom Pernapasan Timur Tengah"]'::jsonb),
 ('MALARIA', 'Malaria', 'Malaria', 'Malaria', 'Parasitic / Vector-borne', TRUE, 'Life-threatening disease caused by Plasmodium parasites transmitted by Anopheles mosquitoes.', '["Malaria", "Demam malaria"]'::jsonb),
 ('MARBURG', 'Marburg', 'Marburg', 'Marburg virus disease', 'Viral / Hemorrhagic', TRUE, 'Severe hemorrhagic fever caused by Marburg filovirus.', '["Marburg", "Virus Marburg", "Demam berdarah Marburg"]'::jsonb),
 ('MELIOIDOSIS', 'Melioidosis', 'Melioidosis', 'Melioidosis', 'Bacterial / Environmental', TRUE, 'Infectious disease caused by Burkholderia pseudomallei in soil and water.', '["Melioidosis", "Penyakit Whitmore"]'::jsonb),
 ('NIPAH', 'Nipah', 'Nipah', 'Nipah virus disease', 'Viral / Zoonotic', TRUE, 'Zoonotic virus causing severe encephalitis and respiratory illness.', '["Nipah", "Virus Nipah", "Penyakit virus Nipah"]'::jsonb),
 ('UNKNOWN_DISEASE', 'Penyakit Tidak Dikenal', 'Unknown Disease', 'Unknown or unclassified disease', 'Unclassified / Outbreak', FALSE, 'Unidentified or novel disease outbreak requiring epidemiological investigation.', '["Penyakit Tidak Dikenal", "Penyakit misterius", "Sindrom misterius", "Wabah misterius"]'::jsonb),
 ('PERTUSSIS', 'Pertusis', 'Pertussis (Whooping Cough)', 'Pertussis', 'Bacterial / Respiratory', FALSE, 'Highly contagious respiratory tract infection caused by Bordetella pertussis.', '["Pertusis", "Batuk rejan", "Batuk seratus hari", "Batuk 100 hari"]'::jsonb),
 ('POLIO', 'Polio', 'Polio (Paralysis)', 'Poliomyelitis', 'Viral / Enteric', FALSE, 'Poliomyelitis causing acute flaccid paralysis transmitted person-to-person.', '["Polio", "Poliomielitis", "Kelumpuhan layu akut", "Lumpuh layu"]'::jsonb),
 ('RABIES', 'Rabies', 'Rabies', 'Rabies', 'Viral / Zoonotic', TRUE, 'Preventable viral disease transmitted through the bite of a rabid animal.', '["Rabies", "Anjing gila", "Penyakit anjing gila"]'::jsonb),
 ('TYPHOID', 'Tifus', 'Typhoid', 'Typhoid fever', 'Bacterial / Food-borne', FALSE, 'Typhoid fever caused by Salmonella Typhi bacteria.', '["Tifus", "Tipus", "Tipes", "Demam Tifoid", "Typhoid"]'::jsonb),
 ('TUBERCULOSIS', 'Tuberkulosis (TBC)', 'Tuberculosis', 'Tuberculosis', 'Bacterial / Airborne', FALSE, 'Infectious bacterial disease mainly affecting lungs caused by Mycobacterium tuberculosis.', '["Tuberkulosis", "TBC", "TB paru", "flek paru"]'::jsonb),
 ('WEST_NILE', 'West Nile', 'West Nile', 'West Nile virus infection', 'Viral / Mosquito-borne', TRUE, 'West Nile virus infection transmitted by mosquitoes.', '["West Nile", "Virus West Nile", "Demam West Nile", "Nil Barat"]'::jsonb),
 ('ZIKA', 'Zika', 'Zika', 'Zika virus disease', 'Viral / Mosquito-borne', TRUE, 'Zika virus disease transmitted primarily by Aedes mosquitoes.', '["Zika", "Virus Zika", "Demam Zika"]'::jsonb);
UPDATE case_reports r SET disease_id = n.id FROM case_reports_disease_bak_008 b, master_diseases n
 WHERE b.report_id = r.id AND n.code = CASE b.old_code WHEN 'DENGUE' THEN 'DENGUE' WHEN 'MEASLES' THEN 'MEASLES' WHEN 'DIPHTHERIA' THEN 'DIPHTHERIA' WHEN 'MALARIA' THEN 'MALARIA' WHEN 'TB' THEN 'TUBERCULOSIS' WHEN 'COVID19' THEN 'COVID19' WHEN 'LEPTO' THEN 'LEPTOSPIROSIS' WHEN 'RABIES' THEN 'RABIES' WHEN 'PERTUSSIS' THEN 'PERTUSSIS' WHEN 'CHIKUNGUNYA' THEN 'CHIKUNGUNYA' WHEN 'AFP' THEN 'POLIO' ELSE 'UNKNOWN_DISEASE' END;
DELETE FROM master_diseases WHERE code LIKE 'OLD\_%';
ALTER TABLE master_diseases ADD CONSTRAINT master_diseases_code_key UNIQUE (code);

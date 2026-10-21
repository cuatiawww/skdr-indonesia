-- 002: master data (diseases, 38 provinces, app settings). Edit via new migrations.
INSERT INTO master_diseases (code, name) VALUES
 ('DENGUE','Dengue'),('MEASLES','Measles'),('DIPHTHERIA','Diphtheria'),('MALARIA','Malaria'),
 ('TB','Tuberculosis'),('COVID19','COVID-19'),('ILI','Influenza-like Illness'),
 ('ADD','Acute Diarrhea'),('PNEUMONIA','Pneumonia'),('LEPTO','Leptospirosis'),
 ('RABIES','Rabies'),('AFP','Acute Flaccid Paralysis'),('PERTUSSIS','Pertussis'),('CHIKUNGUNYA','Chikungunya')
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_locations (code, name) VALUES
 ('11','Aceh'),('12','North Sumatra'),('13','West Sumatra'),('14','Riau'),('15','Jambi'),
 ('16','South Sumatra'),('17','Bengkulu'),('18','Lampung'),('19','Bangka Belitung Islands'),
 ('21','Riau Islands'),('31','DKI Jakarta'),('32','West Java'),('33','Central Java'),
 ('34','DI Yogyakarta'),('35','East Java'),('36','Banten'),('51','Bali'),
 ('52','West Nusa Tenggara'),('53','East Nusa Tenggara'),('61','West Kalimantan'),
 ('62','Central Kalimantan'),('63','South Kalimantan'),('64','East Kalimantan'),
 ('65','North Kalimantan'),('71','North Sulawesi'),('72','Central Sulawesi'),
 ('73','South Sulawesi'),('74','Southeast Sulawesi'),('75','Gorontalo'),('76','West Sulawesi'),
 ('81','Maluku'),('82','North Maluku'),('91','Papua'),('92','West Papua'),
 ('93','South Papua'),('94','Central Papua'),('95','Highland Papua'),('96','Southwest Papua')
ON CONFLICT (code) DO NOTHING;

INSERT INTO app_settings (key, value) VALUES
 ('app_name','SKDR INDONESIA'),
 ('app_tagline','Early Warning and Response Surveillance System - Case Reporting Dashboard'),
 ('footer_text','SKDR Indonesia')
ON CONFLICT (key) DO NOTHING;

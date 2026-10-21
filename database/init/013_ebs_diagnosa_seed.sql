-- 013: seed EBS diagnosa -> master penyakit mappings (PR 005). Only unambiguous equivalents of the 31 master
-- diseases (suspect/probable/confirmed variants of the same disease). Not mapped on purpose (left for review):
-- GHPR (animal bite, not a rabies case), syndromes (ISPA, ILI, Diare, Pneumonia, Jaundice, Meningitis ...),
-- and diseases outside the 31 master (Mumps, Varicella, Tetanus, Influenza A, JE, Kolera, Legionellosis ...).
-- AFP -> POLIO follows the same rule as migration 008. Manual mappings (match_source='manual') are never overwritten.
-- Rollback: database/rollback/013_rollback.sql
INSERT INTO ebs_diagnosa_alias (diagnosa, disease_id, match_source, updated_at)
SELECT v.diagnosa, d.id, 'seed', now()
FROM (VALUES
  ('suspek campak', 'MEASLES'),
  ('suspek leptospirosis', 'LEPTOSPIROSIS'),
  ('suspek difteri', 'DIPHTHERIA'),
  ('difteri observasi', 'DIPHTHERIA'),
  ('difteri konfirm laboratorium', 'DIPHTHERIA'),
  ('difteri probable', 'DIPHTHERIA'),
  ('suspek pertusis', 'PERTUSSIS'),
  ('suspek mpox', 'MPOX'),
  ('suspek mers-cov', 'MERS'),
  ('suspek flu burung pada manusia', 'AVIAN_INFLUENZA'),
  ('flu burung pada manusia', 'AVIAN_INFLUENZA'),
  ('suspek hanta', 'HANTAVIRUS'),
  ('suspek penyakit virus nipah', 'NIPAH'),
  ('anthraks', 'ANTHRAX'),
  ('penyakit virus ebola (pve/evd)', 'EBOLA'),
  ('suspek zika', 'ZIKA'),
  ('tifoid', 'TYPHOID'),
  ('acute flaccid paralysis (afp)', 'POLIO')
) v(diagnosa, code)
JOIN master_diseases d ON d.code = v.code
ON CONFLICT (diagnosa) DO UPDATE SET disease_id = EXCLUDED.disease_id, match_source = 'seed', updated_at = now()
  WHERE ebs_diagnosa_alias.match_source IS DISTINCT FROM 'manual';

UPDATE ebs_reports e SET disease_id = a.disease_id FROM ebs_diagnosa_alias a
WHERE a.diagnosa = lower(trim(e.diagnosa)) AND e.disease_id IS DISTINCT FROM a.disease_id;

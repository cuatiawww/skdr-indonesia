-- PR 021: hapus SEMUA data yang diinput lewat form (Form PE + laporan kasus lama), supaya dasbor memakai data API (EBS/Alert SKDR).
-- SENGAJA tidak di database/init (tidak jalan otomatis saat backend start). Jalankan manual hanya setelah:
--   1) backup pg_dump (lihat docs/PR/021), 2) persetujuan Yosua untuk database utama.
-- Definisi form (pe_form_definitions), master data, dan data API tidak disentuh.
-- Rollback: database/manual/pr021_hapus_data_form_rollback.sql (memulihkan dari skema backup_pr021).
BEGIN;
CREATE SCHEMA IF NOT EXISTS backup_pr021;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='backup_pr021' AND table_name='pe_cases') THEN
    RAISE EXCEPTION 'backup_pr021 sudah ada; hapus/arsipkan dulu supaya backup lama tidak tertimpa';
  END IF;
END $$;
CREATE TABLE backup_pr021.pe_case_events AS TABLE pe_case_events;
CREATE TABLE backup_pr021.pe_cases       AS TABLE pe_cases;
CREATE TABLE backup_pr021.pe_clusters    AS TABLE pe_clusters;
CREATE TABLE backup_pr021.pe_counters    AS TABLE pe_counters;
CREATE TABLE backup_pr021.case_reports   AS TABLE case_reports;
CREATE TABLE backup_pr021.ringkasan AS
  SELECT 'pe_case_events' AS tabel, COUNT(*) AS baris, now() AS dibuat FROM pe_case_events UNION ALL
  SELECT 'pe_cases', COUNT(*), now() FROM pe_cases UNION ALL
  SELECT 'pe_clusters', COUNT(*), now() FROM pe_clusters UNION ALL
  SELECT 'pe_counters', COUNT(*), now() FROM pe_counters UNION ALL
  SELECT 'case_reports', COUNT(*), now() FROM case_reports;

DELETE FROM pe_case_events;
DELETE FROM pe_cases;          -- termasuk yang sudah soft delete (deleted_at)
DELETE FROM pe_clusters;
DELETE FROM pe_counters;       -- nomor PE mulai lagi dari 1
DELETE FROM case_reports;
COMMIT;
SELECT * FROM backup_pr021.ringkasan;

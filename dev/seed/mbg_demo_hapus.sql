-- Hapus DATA DEMO LOKAL Dasbor MBG (PR 052b): semua baris bertanda DEMO-MBG-*.
-- mbg_keracunan_update & mbg_form ikut terhapus (ON DELETE CASCADE).
BEGIN;
DELETE FROM mbg_keracunan WHERE no_laporan LIKE 'DEMO-MBG-%';
DELETE FROM mbg_kunjungan WHERE no_kunjungan LIKE 'DEMO-MBG-%';
COMMIT;

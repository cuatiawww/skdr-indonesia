-- Rollback PR 055: Menghapus data seed DEMO-MBG-% tanpa menyentuh laporan/kunjungan asli pengguna.
DELETE FROM mbg_keracunan WHERE no_laporan LIKE 'DEMO-MBG-%';
DELETE FROM mbg_kunjungan WHERE no_kunjungan LIKE 'DEMO-MBG-%';
DELETE FROM schema_migrations WHERE filename = '070_seed_mbg_demo_data.sql';

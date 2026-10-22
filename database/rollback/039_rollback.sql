-- PR 021 rollback 039: hapus tabel kategori penyakit.
BEGIN;
DROP TABLE IF EXISTS master_disease_category_map;
DROP TABLE IF EXISTS master_disease_categories;
DELETE FROM schema_migrations WHERE filename = '039_kategori_penyakit.sql';
COMMIT;

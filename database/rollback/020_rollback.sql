-- Rollback PR 011 soft delete. WARNING: soft-deleted rows become visible again.
BEGIN;
DROP INDEX IF EXISTS idx_pe_cases_active;
ALTER TABLE pe_cases DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE pe_cases DROP COLUMN IF EXISTS deleted_at;
DELETE FROM schema_migrations WHERE filename = '020_pe_soft_delete.sql';
COMMIT;

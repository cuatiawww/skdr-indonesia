-- PR 011: soft delete for PE cases (only Draf can be deleted; audit in pe_case_events, event = 'dihapus')
BEGIN;
ALTER TABLE pe_cases ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE pe_cases ADD COLUMN IF NOT EXISTS deleted_by text;
CREATE INDEX IF NOT EXISTS idx_pe_cases_active ON pe_cases (form_key, updated_at DESC) WHERE deleted_at IS NULL;
COMMIT;

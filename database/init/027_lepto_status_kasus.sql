-- PR 016: registri status kasus Leptospirosis mengikuti sheet "Spesifikasi Dashboard Executive" No. 17
-- (Leptospirosis: suspek, konfirmasi). Kode 'probable' dihapus dari groups[code=lepto].pe_status saja;
-- data pe_cases TIDAK diubah (laporan lama berstatus probable tampil sebagai "Belum diklasifikasi").
-- CFR (groups[].cfr) dan Rabies/GHPR tidak diubah. Rollback: rollback/027_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_027 AS SELECT * FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings
   SET value = jsonb_set(value::jsonb, '{groups}', (
         SELECT jsonb_agg(CASE WHEN g->>'code' = 'lepto'
                  THEN jsonb_set(g, '{pe_status}', COALESCE((SELECT jsonb_agg(s ORDER BY o) FROM jsonb_array_elements(g->'pe_status') WITH ORDINALITY x(s, o)
                                                              WHERE s->>'code' <> 'probable'), '[]'::jsonb))
                  ELSE g END ORDER BY i)
           FROM jsonb_array_elements(value::jsonb->'groups') WITH ORDINALITY y(g, i)))::text,
       updated_at = now()
 WHERE key = 'dashboard_executive';
COMMIT;
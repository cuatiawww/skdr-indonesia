-- PR 052b: "Dasbor MBG" menjadi kategori sidebar sendiri (grp_dasbor_mbg, area dashboard, setelah grup Dasbor) dengan
-- 3 sub-menu/rute: Ringkasan /dashboard/mbg/ringkasan · Keracunan /dashboard/mbg/keracunan · Pengawasan /dashboard/mbg/pengawasan.
-- Item lama mod_dasbor_mbg (/dasbor/mbg) dihapus dari grup Dasbor; tautan Program MBG (mod_dasbor_mbg_program, PR 052)
-- diarahkan ke /dashboard/mbg/ringkasan. Alamat lama /dasbor/mbg?tab=… tetap dialihkan oleh frontend.
-- Ringan: UPDATE idempoten satu baris app_settings + tabel cadangan. Rollback: rollback/068_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS app_settings_bak_068 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';

UPDATE app_settings SET value = ((
  SELECT COALESCE(jsonb_agg(CASE
      WHEN e.g->>'id' = 'grp_dasbor' THEN jsonb_set(e.g, '{items}', (
        SELECT COALESCE(jsonb_agg(i.it ORDER BY i.n), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)
        WHERE i.it->>'id' IS DISTINCT FROM 'mod_dasbor_mbg'))
      WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', (
        SELECT COALESCE(jsonb_agg(CASE WHEN i.it->>'id' = 'mod_program_mbg' AND i.it ? 'subItems' THEN jsonb_set(i.it, '{subItems}', (
            SELECT COALESCE(jsonb_agg(CASE WHEN s.si->>'id' = 'mod_dasbor_mbg_program'
                THEN jsonb_set(s.si, '{href}', '"/dashboard/mbg/ringkasan"') ELSE s.si END ORDER BY s.n), '[]'::jsonb)
            FROM jsonb_array_elements(i.it->'subItems') WITH ORDINALITY AS s(si, n)))
          ELSE i.it END ORDER BY i.n), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)))
      ELSE e.g END ORDER BY e.n), '[]'::jsonb)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
) || '[{"id": "grp_dasbor_mbg", "title": "Dasbor MBG", "order": 2.5, "enabled": true, "area": "dashboard", "items": [
  {"id": "mod_dasbor_mbg_ringkasan", "label": "Ringkasan", "href": "/dashboard/mbg/ringkasan", "icon": "LayoutDashboard", "order": 1, "enabled": true,
   "description": "Ringkasan Keracunan Pangan MBG × Pengawasan Gizi MBG, peta 2 kolom, tautan risiko SPPG"},
  {"id": "mod_dasbor_mbg_keracunan", "label": "Keracunan", "href": "/dashboard/mbg/keracunan", "icon": "AlertTriangle", "order": 2, "enabled": true,
   "description": "Dasbor Keracunan Pangan MBG: angka utama, peta, kurva epidemi, wilayah terdampak, daftar kejadian"},
  {"id": "mod_dasbor_mbg_pengawasan", "label": "Pengawasan", "href": "/dashboard/mbg/pengawasan", "icon": "ClipboardCheck", "order": 3, "enabled": true,
   "description": "Dasbor Pengawasan Gizi MBG: cakupan, skor, aspek lemah F1–F13, SPPG perlu tindak lanjut"}
]}]'::jsonb)::text, updated_at = now()
WHERE key = 'navigation_menu'
  AND jsonb_typeof(value::jsonb) = 'array'
  AND value::jsonb::text NOT LIKE '%grp_dasbor_mbg%';

COMMIT;

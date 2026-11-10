-- PR 035 (dinomori ulang dari 057_label karena bentrok dengan 057_dasbor_ebs_ibs): penamaan menu laporan dirapikan (hanya teks yang terlihat; id, URL, dan data tidak berubah):
--   mod_laporan_ebs      "Laporan EBS"        (label tetap; deskripsi menu diperbarui)
--   mod_laporan_ibs      "Entri Data Agregat" → "Laporan Agregat IBS"
--   mod_laporan_individu "Form Individu"      → "Laporan Individu IBS"
-- UPDATE satu baris app_settings (ringan, idempoten). Rollback: rollback/061_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS app_settings_bak_061 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', (
      SELECT COALESCE(jsonb_agg(CASE
          WHEN t.i->>'id' = 'mod_laporan_ebs' THEN t.i || '{"label":"Laporan EBS","description":"Laporan kejadian/rumor penyakit di masyarakat — jumlah kasus & kematian per kelompok usia dan jenis kelamin"}'::jsonb
          WHEN t.i->>'id' = 'mod_laporan_ibs' THEN t.i || '{"label":"Laporan Agregat IBS","description":"Rekap mingguan Puskesmas/unit — jumlah kasus, kematian, dan lab per penyakit + total kunjungan"}'::jsonb
          WHEN t.i->>'id' = 'mod_laporan_individu' THEN t.i || '{"label":"Laporan Individu IBS","description":"Data satu pasien per laporan — diagnosa, pemeriksaan, dan status akhir pasien"}'::jsonb
          ELSE t.i END ORDER BY t.n), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS t(i, n)
    ))
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_transaksi"}]'::jsonb;
COMMIT;

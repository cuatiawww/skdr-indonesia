-- PR 042: Matriks Analisa (Dasbor Limited) - satu menu analisa untuk Laporan EBS, Laporan Agregat IBS, Laporan Individu IBS.
-- * laporan_ibs_baris.kecamatan/jenis_unit/kelompok : salinan dari laporan_ibs.data (diisi trigger BEFORE INSERT, karena
--   laporan_ibs_baris_isi() menghapus + mengisi ulang baris setiap laporan disimpan) agar analisa per kecamatan / jenis unit /
--   kelompok unit tidak perlu join ke laporan_ibs (kueri setahun penuh 2,9 s -> < 0,5 s).
-- * skdr_epi_ws(tanggal)  : tanggal awal minggu epid (MMWR, Minggu) dari tanggal mana pun (Laporan EBS: dari tanggal laporan).
-- * analisa_ebs_fakta     : Laporan EBS terkirim, satu baris per laporan, kolom analisa (form EBS + hasil impor API lama).
-- * analisa_ibs_fakta     : baris matriks Laporan Agregat IBS terkirim (laporan x penyakit) + metadata alert.
-- * app_settings.matriks_analisa : ambang kinerja, batas ketepatan, baseline ambang KLB (bisa diubah tanpa ubah kode).
-- * navigation_menu       : badge "Segera" pada menu Matriks Analisa dihapus. api_cache: prefix /api/v1/analisa/.
-- Rollback: database/rollback/063_rollback.sql
BEGIN;

ALTER TABLE laporan_ibs_baris
  ADD COLUMN IF NOT EXISTS kecamatan text,
  ADD COLUMN IF NOT EXISTS jenis_unit text,
  ADD COLUMN IF NOT EXISTS kelompok text;

CREATE OR REPLACE FUNCTION laporan_ibs_baris_meta_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT NULLIF(initcap(trim(l.data->>'kecamatan_nama')), ''), NULLIF(trim(l.data->>'jenis_unit'), ''), NULLIF(trim(l.data->>'kelompok'), '')
    INTO NEW.kecamatan, NEW.jenis_unit, NEW.kelompok
  FROM laporan_ibs l WHERE l.id = NEW.laporan_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_laporan_ibs_baris_meta ON laporan_ibs_baris;
CREATE TRIGGER trg_laporan_ibs_baris_meta BEFORE INSERT ON laporan_ibs_baris
  FOR EACH ROW EXECUTE FUNCTION laporan_ibs_baris_meta_trg();

UPDATE laporan_ibs_baris b
SET kecamatan = NULLIF(initcap(trim(l.data->>'kecamatan_nama')), ''), jenis_unit = NULLIF(trim(l.data->>'jenis_unit'), ''),
    kelompok = NULLIF(trim(l.data->>'kelompok'), '')
FROM laporan_ibs l
WHERE l.id = b.laporan_id AND b.kecamatan IS NULL AND b.jenis_unit IS NULL;

CREATE INDEX IF NOT EXISTS idx_laporan_ibs_baris_analisa ON laporan_ibs_baris (week_start, province_id, kabkota_id) WHERE aktif;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_kinerja ON laporan_ibs (tahun, minggu) WHERE status = 'dikirim' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION skdr_epi_ws(d date) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT d - EXTRACT(DOW FROM d)::int $$;

CREATE OR REPLACE FUNCTION skdr_tgl(v text) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN trim(COALESCE(v, '')) ~ '^\d{4}-\d{2}-\d{2}' THEN substr(trim(v), 1, 10)::date END
$$;

CREATE OR REPLACE VIEW analisa_ebs_fakta AS
SELECT l.id, l.no_laporan,
       COALESCE(l.tgl_laporan, (l.submitted_at AT TIME ZONE 'Asia/Jakarta')::date) AS tgl,
       skdr_epi_ws(COALESCE(l.tgl_laporan, (l.submitted_at AT TIME ZONE 'Asia/Jakarta')::date)) AS ws,
       l.province_id, l.kabkota_id, initcap(l.dsb_kecamatan_nama) AS kecamatan,
       NULLIF(trim(l.unit_nama), '') AS unit, l.dsb_jenis_unit AS jenis_unit, NULLIF(trim(l.data->>'kelompok'), '') AS kelompok,
       CASE WHEN l.dsb_impor_id IS NOT NULL THEN l.dsb_impor_disease_id
            ELSE COALESCE((SELECT a.disease_id FROM ebs_diagnosa_alias a WHERE a.diagnosa = lower(l.dsb_verifikasi)),
                          (SELECT a.disease_id FROM ebs_diagnosa_alias a WHERE a.diagnosa = lower(trim(l.penyakit_rumor)))) END AS disease_id,
       NULLIF(trim(l.penyakit_rumor), '') AS penyakit_rumor, l.dsb_verifikasi AS penyakit_verif,
       GREATEST(COALESCE(l.jml_kasus, 0), 0) AS kasus,
       LEAST(GREATEST(COALESCE(l.jml_kematian, 0), 0), GREATEST(COALESCE(l.jml_kasus, 0), 0)) AS kematian,
       l.dsb_status AS status_rumor,
       CASE l.dsb_klb WHEN '1' THEN 'Ya' WHEN '0' THEN 'Tidak' END AS klb,
       NULLIF(trim(l.data->>'klb_status'), '') AS klb_status,
       NULLIF(trim(l.data->>'w1'), '') AS w1,
       NULLIF(trim(l.data->>'sumber_informasi'), '') AS sumber_informasi,
       NULLIF(trim(l.data->>'spesimen'), '') AS spesimen,
       skdr_jint(l.data->>'lab_jml_diperiksa') AS lab_diperiksa, skdr_jint(l.data->>'lab_jml_positif') AS lab_positif,
       CASE WHEN jsonb_typeof(l.data->'usia') = 'object' THEN l.data->'usia' END AS usia,
       skdr_tgl(l.data->>'tgl_rumor') AS tgl_rumor, skdr_tgl(l.data->>'tgl_onset') AS tgl_onset,
       skdr_tgl(l.data->>'klb_tgl_mulai') AS klb_tgl_mulai, skdr_tgl(l.data->>'klb_tgl_berakhir') AS klb_tgl_berakhir,
       LEAST(skdr_tgl(l.data->>'tatalaksana_tgl'), skdr_tgl(l.data->>'pfr_tgl'), skdr_tgl(l.data->>'tgc_tgl')) AS tgl_tanggulang,
       (COALESCE(l.submitted_at, l.created_at) AT TIME ZONE 'Asia/Jakarta') AS dibuat,
       CASE WHEN l.dsb_impor_id IS NOT NULL THEN NULLIF(l.dsb_impor_update, '')::timestamp
            WHEN l.updated_at > COALESCE(l.submitted_at, l.created_at) + interval '1 minute' THEN (l.updated_at AT TIME ZONE 'Asia/Jakarta') END AS respon_pertama,
       l.dsb_impor_id IS NOT NULL AS impor
FROM laporan_ebs l
WHERE l.status = 'dikirim' AND l.deleted_at IS NULL;

CREATE OR REPLACE VIEW analisa_ibs_fakta AS
SELECT b.laporan_id, b.no_laporan, b.tahun, b.minggu, b.week_start AS ws, b.province_id, b.kabkota_id, b.kecamatan,
       b.unit_key, b.unit_nama AS unit, b.jenis_unit, b.kelompok,
       ip.kode, ip.urutan, ip.nama, m.disease_id, b.kasus, b.kematian, b.lab,
       b.alert_id, b.sts_verif, b.tgl_verifikasi, b.is_klb, b.respon24_ok, b.ada_spesimen, b.lab_kelas, b.submitted_at
FROM laporan_ibs_baris b
JOIN ibs_penyakit ip ON ip.kode = b.kode AND NOT ip.is_total AND ip.is_active
LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = ip.kode
WHERE b.aktif;

CREATE TABLE IF NOT EXISTS app_settings_bak_063 AS SELECT key, value FROM app_settings WHERE key IN ('navigation_menu', 'api_cache');

INSERT INTO app_settings (key, value, updated_at) VALUES ('matriks_analisa', $ma${
  "target_pct": 80,
  "ambang": {"hijau": 80, "kuning": 60},
  "ketepatan_batas_hari": 10,
  "ketepatan_def": "Tepat waktu = Laporan Agregat IBS diterima paling lambat hari Selasa setelah minggu epid berakhir (sebelum awal minggu epid + 10 hari, WIB).",
  "kelengkapan_def": "Unit diharapkan = unit pelapor yang mengirim minimal satu Laporan Agregat IBS pada tahun yang sama di wilayah terpilih; satu unit dihitung satu kali per minggu epid.",
  "baseline": {"tahun": 3, "sd": 2, "minggu_bergerak": 8, "jendela": 1},
  "batas_baris_daftar": 50,
  "potensial_wabah": ["16SDF", "18MEA", "07DPR", "03AFP", "13PTS", "15SCR", "11HAF", "14ATX", "26LPT", "05BDR", "23STN", "19MEN", "25CHK"]
}$ma$, now())
ON CONFLICT (key) DO NOTHING;

UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN g->>'id' = 'grp_dasbor_limited' THEN jsonb_set(g, '{items}', (
           SELECT jsonb_agg(CASE WHEN i->>'id' = 'mod_matriks_analisa'
                                 THEN (i - 'badge') || '{"description": "Matriks analisa SKDR EBS & IBS: tren, matriks penyakit x wilayah, morbiditas, kinerja pelaporan, alert, profil kasus"}'::jsonb
                                 ELSE i END ORDER BY o)
           FROM jsonb_array_elements(g->'items') WITH ORDINALITY AS x(i, o)))
         ELSE g END ORDER BY go)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS y(g, go))::text, updated_at = now()
WHERE key = 'navigation_menu' AND jsonb_typeof(value::jsonb) = 'array';

UPDATE app_settings SET value = jsonb_set(value::jsonb, '{prefixes}', (value::jsonb->'prefixes') || '["/api/v1/analisa/"]'::jsonb)::text, updated_at = now()
WHERE key = 'api_cache' AND NOT (value::jsonb->'prefixes') ? '/api/v1/analisa/';

COMMIT;

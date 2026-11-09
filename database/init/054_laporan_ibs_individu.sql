-- PR 031: Form Individu IBS (per pasien) + Entri Data Agregat (label menu) — input laporan di SKDR Indonesia.
-- * laporan_ibs_individu : draf & laporan terkirim per pasien (data JSONB + kolom ringkas untuk daftar & cek duplikat).
--                          Padanan form resmi skdr.kemkes.go.id/form-individu-agregat (4 tab: Info Dasar, Info Pasien,
--                          Penyakit Agregat, Pemeriksaan). Penyakit Agregat = ibs_penyakit.kode (24 penyakit, tanpa Total Kunjungan).
-- * laporan_opsi         : kelompok baru pekerjaan, kelamin, status_imunisasi, status_akhir (nilai dari form resmi, observasi
--                          read-only 10 Nov 2026).
-- * laporan_events       : jenis 'individu' ditambahkan ke CHECK. laporan_counters: jenis 'individu' (tanpa CHECK, tidak berubah).
-- * navigation_menu      : "Laporan IBS (Agregat)" → "Entri Data Agregat" (URL tetap /ibs/laporan) + item baru "Form Individu"
--                          (/ibs/individu) di grup Transaksi.
-- Hanya satu tabel baru kecil + UPDATE satu baris app_settings (ringan). Rollback: rollback/054_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS laporan_ibs_individu (
  id BIGSERIAL PRIMARY KEY,
  no_laporan TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikirim')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  tahun INT,
  minggu INT CHECK (minggu IS NULL OR minggu BETWEEN 1 AND 53),
  unit_key TEXT,
  unit_nama TEXT,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  nama_pasien TEXT,
  kelamin TEXT,
  umur TEXT,
  penyakit TEXT,
  tgl_periksa DATE,
  keluhan TEXT,
  diagnosa TEXT,
  status_akhir TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_individu_list ON laporan_ibs_individu (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_individu_periode ON laporan_ibs_individu (unit_key, tahun, minggu) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_individu_dup ON laporan_ibs_individu (unit_key, lower(trim(nama_pasien)), tgl_periksa) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_individu_user ON laporan_ibs_individu (created_by, updated_at DESC);

INSERT INTO laporan_opsi (kelompok, nilai, label, urutan) VALUES
  ('pekerjaan', 'Dokter hewan', 'Dokter Hewan', 1), ('pekerjaan', 'Karyawan', NULL, 2), ('pekerjaan', 'Lain-lain', NULL, 99),
  ('pekerjaan', 'Mahasiswa', NULL, 4), ('pekerjaan', 'Pekerja pabrik makanan ternak', 'Pekerja Pabrik Makanan Ternak', 5),
  ('pekerjaan', 'Pekerja pabrik pupuk', 'Pekerja Pabrik Pupuk', 6), ('pekerjaan', 'Pekerja Pabrik Tekstil', NULL, 7),
  ('pekerjaan', 'Pekerja Peternakan', NULL, 8), ('pekerjaan', 'Pekerja tempat pemotongan hewan', 'Pekerja Tempat Pemotongan Hewan', 9),
  ('pekerjaan', 'Pelajar', NULL, 10), ('pekerjaan', 'Petani', NULL, 11), ('pekerjaan', 'Swasta', NULL, 12),
  ('pekerjaan', 'Tidak bekerja', 'Tidak Bekerja', 13), ('pekerjaan', 'Wiraswasta', NULL, 14),
  ('kelamin', 'Pria', 'Laki-laki (Pria)', 1), ('kelamin', 'Wanita', 'Perempuan (Wanita)', 2),
  ('status_imunisasi', '1x', NULL, 1), ('status_imunisasi', '2x', NULL, 2), ('status_imunisasi', '3x', NULL, 3), ('status_imunisasi', '4x', NULL, 4),
  ('status_imunisasi', 'Lengkap', NULL, 5), ('status_imunisasi', 'Tidak lengkap', 'Tidak Lengkap', 6), ('status_imunisasi', 'Tidak pernah', 'Tidak Pernah', 7),
  ('status_imunisasi', 'Tidak diketahui', 'Tidak Diketahui', 8),
  ('status_akhir', 'Masih dalam perawatan', 'Masih Dalam Perawatan', 1), ('status_akhir', 'Sakit', NULL, 2), ('status_akhir', 'Sehat', NULL, 3),
  ('status_akhir', 'Meninggal', NULL, 4)
ON CONFLICT (kelompok, nilai) DO NOTHING;

ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs', 'individu'));

-- navigation_menu: ganti label item IBS + tambah Form Individu (idempoten)
CREATE TABLE IF NOT EXISTS app_settings_bak_054 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', (
      SELECT COALESCE(jsonb_agg(CASE WHEN t.i->>'id' = 'mod_laporan_ibs'
          THEN t.i || '{"label": "Entri Data Agregat", "description": "Entri data agregat mingguan per Puskesmas/unit (SKDR-IBS) — tabel 24 penyakit + Total Kunjungan"}'::jsonb
          ELSE t.i END ORDER BY t.n), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS t(i, n)
    ) || CASE WHEN COALESCE(e.g->'items', '[]'::jsonb) @> '[{"id": "mod_laporan_individu"}]'::jsonb THEN '[]'::jsonb ELSE '[
      {"id": "mod_laporan_individu", "label": "Form Individu", "href": "/ibs/individu", "icon": "Stethoscope", "description": "Form Individu IBS — data per pasien (penyakit agregat, pemeriksaan, SOAP)", "order": 4, "enabled": true}]'::jsonb END)
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_transaksi"}]'::jsonb;
COMMIT;

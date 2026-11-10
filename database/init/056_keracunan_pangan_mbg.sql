-- PR 034: Keracunan Pangan MBG — laporan kejadian keracunan pangan Program Makan Bergizi Gratis (padanan /form-mbg SKDR Kemkes,
-- 113 isian di 6 tab) sebagai wizard 6 langkah: Laporan Cepat → Kasus & Gejala → Menu & Penanganan → Kesehatan Lingkungan →
-- Laboratorium → Lampiran & Kirim. Seluruh isian resmi tetap ada (paritas data), disusun ulang.
-- * mbg_keracunan         : satu kejadian (nomor KPM-YYYY-###### dari laporan_counters jenis 'kpm'); isian lengkap di `data` (JSONB:
--                           sekolah, gejala, SOP, sumber air, jadwal, sampel lab = array di dalam data) + kolom ringkas untuk daftar/filter.
--                           status: draf → dilaporkan (laporan cepat terkirim, tetap boleh dilengkapi) → ditutup (kesimpulan akhir).
--                           lab_status (belum/dikirim/hasil) dihitung server dari isian laboratorium.
-- * mbg_keracunan_update  : riwayat update kasus harian (satu baris per tanggal; angka terbaru ikut memperbarui total kejadian).
-- * mbg_keracunan_lampiran: lampiran umum / file lab / dokumentasi gejala (bytea, maks. 5 MB per file — pola mbg_lampiran).
-- * laporan_events.jenis + 'kpm'.
-- * navigation_menu       : grup menu "Program MBG" di Transaksi berisi Pengawasan Gizi MBG (URL tetap /pengawasan-gizi) +
--                           Keracunan Pangan MBG (/keracunan-mbg).
-- Tiga tabel + 1 update menu (ringan). Rollback: rollback/056_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS mbg_keracunan (
  id BIGSERIAL PRIMARY KEY,
  no_laporan TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dilaporkan', 'ditutup')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  tgl_kejadian TIMESTAMP,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  kecamatan_nama TEXT,
  desa TEXT,
  sekolah TEXT,
  nama_sppg TEXT,
  yayasan_sppg TEXT,
  jumlah_kasus INT,
  jumlah_meninggal INT,
  jumlah_terpapar INT,
  lab_status TEXT NOT NULL DEFAULT 'belum' CHECK (lab_status IN ('belum', 'dikirim', 'hasil')),
  pelapor_nama TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mbg_keracunan_list ON mbg_keracunan (tgl_kejadian DESC NULLS LAST, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbg_keracunan_wilayah ON mbg_keracunan (province_id, kabkota_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbg_keracunan_sppg ON mbg_keracunan (lower(nama_sppg)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbg_keracunan_user ON mbg_keracunan (created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS mbg_keracunan_update (
  id BIGSERIAL PRIMARY KEY,
  keracunan_id BIGINT NOT NULL REFERENCES mbg_keracunan(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  kasus INT NOT NULL CHECK (kasus >= 0),
  meninggal INT NOT NULL DEFAULT 0 CHECK (meninggal >= 0),
  rawat_inap INT CHECK (rawat_inap >= 0),
  rawat_jalan INT CHECK (rawat_jalan >= 0),
  sembuh INT CHECK (sembuh >= 0),
  catatan TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (keracunan_id, tanggal)
);

CREATE TABLE IF NOT EXISTS mbg_keracunan_lampiran (
  id BIGSERIAL PRIMARY KEY,
  keracunan_id BIGINT NOT NULL REFERENCES mbg_keracunan(id) ON DELETE CASCADE,
  kategori TEXT NOT NULL DEFAULT 'umum' CHECK (kategori IN ('umum', 'lab', 'gejala')),
  judul TEXT,
  nama_file TEXT NOT NULL,
  tipe TEXT NOT NULL,
  ukuran INT NOT NULL CHECK (ukuran > 0),
  isi BYTEA NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mbg_keracunan_lampiran ON mbg_keracunan_lampiran (keracunan_id, kategori);

ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs', 'individu', 'mbg', 'kpm'));

-- navigation_menu: item Pengawasan Gizi MBG (PR 033) diganti grup sub-menu "Program MBG" (idempoten; id lama tetap dipakai sub-item)
CREATE TABLE IF NOT EXISTS app_settings_bak_056 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', (
      SELECT COALESCE(jsonb_agg(i.it ORDER BY i.n), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(e.g->'items', '[]'::jsonb)) WITH ORDINALITY AS i(it, n)
      WHERE i.it->>'id' <> 'mod_pengawasan_gizi'
    ) || '[
      {"id": "mod_program_mbg", "label": "Program MBG", "href": "#", "icon": "Utensils", "description": "Program Makan Bergizi Gratis — pengawasan standar gizi SPPG dan laporan keracunan pangan", "order": 5, "enabled": true,
       "subItems": [
         {"id": "mod_pengawasan_gizi", "label": "Pengawasan Gizi MBG", "href": "/pengawasan-gizi", "icon": "ClipboardCheck", "description": "Kunjungan pengawasan standar gizi MBG ke SPPG — Formulir 1–13", "order": 1, "enabled": true},
         {"id": "mod_keracunan_mbg", "label": "Keracunan Pangan MBG", "href": "/keracunan-mbg", "icon": "AlertTriangle", "description": "Laporan cepat & penyelidikan kejadian keracunan pangan MBG — kasus harian, lingkungan, laboratorium", "order": 2, "enabled": true}
       ]}]'::jsonb)
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_transaksi"}]'::jsonb
  AND NOT (value::jsonb::text LIKE '%mod_keracunan_mbg%');
COMMIT;

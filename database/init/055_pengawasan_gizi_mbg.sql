-- PR 033: Pengawasan Gizi MBG (13 formulir pengawasan standar gizi Program Makan Bergizi Gratis, naskah dari tim dokter)
-- sebagai modul input di SKDR Indonesia, gaya wizard yang sama dengan Laporan EBS/IBS.
-- * mbg_kunjungan : satu kunjungan pengawasan TPG ke satu SPPG (identitas diisi sekali: TPG, Puskesmas, wilayah, SPPG,
--                   Pengawas Gizi, tanggal) — nomor MBG-YYYY-###### dari laporan_counters (jenis 'mbg').
-- * mbg_form      : isian Formulir 1–13 per kunjungan sebagai JSONB (`data`) + versi skema (`schema_version`) supaya
--                   daftar item bisa berubah tanpa migrasi kolom; skor & kesimpulan dihitung server (kolom ringkas).
-- * mbg_lampiran  : bukti dokumen/foto per formulir & item (bytea, maks. 5 MB per file — dibatasi backend, pola laporan_lampiran).
-- * laporan_events.jenis + 'mbg' (riwayat kunjungan & formulir).
-- * navigation_menu : item "Pengawasan Gizi MBG" (/pengawasan-gizi) di grup Transaksi.
-- Tiga tabel kecil + 1 update menu (ringan). Rollback: rollback/055_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS mbg_kunjungan (
  id BIGSERIAL PRIMARY KEY,
  no_kunjungan TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikirim')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  nama_tpg TEXT,
  puskesmas TEXT,
  province_id INT REFERENCES master_locations(id),
  kabkota_id INT REFERENCES master_kabkota(id),
  nama_sppg TEXT,
  nama_pengawas TEXT,
  tanggal DATE,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mbg_kunjungan_list ON mbg_kunjungan (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbg_kunjungan_sppg ON mbg_kunjungan (lower(nama_sppg), tanggal) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbg_kunjungan_user ON mbg_kunjungan (created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS mbg_form (
  id BIGSERIAL PRIMARY KEY,
  kunjungan_id BIGINT NOT NULL REFERENCES mbg_kunjungan(id) ON DELETE CASCADE,
  form_no SMALLINT NOT NULL CHECK (form_no BETWEEN 1 AND 13),
  schema_version SMALLINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf', 'dikirim')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  skor DOUBLE PRECISION,
  kesimpulan TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (kunjungan_id, form_no)
);
CREATE INDEX IF NOT EXISTS idx_mbg_form_kesimpulan ON mbg_form (form_no, kesimpulan) WHERE status = 'dikirim';

CREATE TABLE IF NOT EXISTS mbg_lampiran (
  id BIGSERIAL PRIMARY KEY,
  kunjungan_id BIGINT NOT NULL REFERENCES mbg_kunjungan(id) ON DELETE CASCADE,
  form_no SMALLINT NOT NULL CHECK (form_no BETWEEN 1 AND 13),
  item_key TEXT NOT NULL DEFAULT '',
  judul TEXT,
  nama_file TEXT NOT NULL,
  tipe TEXT NOT NULL,
  ukuran INT NOT NULL CHECK (ukuran > 0),
  isi BYTEA NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mbg_lampiran_form ON mbg_lampiran (kunjungan_id, form_no, item_key);

ALTER TABLE laporan_events DROP CONSTRAINT IF EXISTS laporan_events_jenis_check;
ALTER TABLE laporan_events ADD CONSTRAINT laporan_events_jenis_check CHECK (jenis IN ('ebs', 'ibs', 'individu', 'mbg'));

-- navigation_menu: item Pengawasan Gizi MBG di grup Transaksi (idempoten)
CREATE TABLE IF NOT EXISTS app_settings_bak_055 AS SELECT key, value FROM app_settings WHERE key = 'navigation_menu';
UPDATE app_settings SET value = (
  SELECT jsonb_agg(CASE WHEN e.g->>'id' = 'grp_transaksi' THEN jsonb_set(e.g, '{items}', COALESCE(e.g->'items', '[]'::jsonb) || '[
      {"id": "mod_pengawasan_gizi", "label": "Pengawasan Gizi MBG", "href": "/pengawasan-gizi", "icon": "ClipboardCheck", "description": "Kunjungan pengawasan standar gizi MBG ke SPPG — Formulir 1–13 (ketenagaan, SOP, penerapan SOP, daya terima, rekapitulasi)", "order": 5, "enabled": true}]'::jsonb)
    ELSE e.g END ORDER BY e.n)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS e(g, n)
)::text, updated_at = now()
WHERE key = 'navigation_menu' AND value::jsonb @> '[{"id": "grp_transaksi"}]'::jsonb
  AND NOT (value::jsonb::text LIKE '%mod_pengawasan_gizi%');
COMMIT;

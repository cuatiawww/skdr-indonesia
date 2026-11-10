-- PR 039: Dasbor Utama membaca matriks Laporan EBS & Laporan Agregat/Individu IBS di SKDR Indonesia (bukan lagi langsung
-- tabel sinkron API SKDR lama / Form PE). Matriks diisi (1) lewat form, dan (2) otomatis dari data sinkron API SKDR lama:
-- ebs_reports -> laporan_ebs, skdr_alerts/skdr_alert_fakta -> laporan_ibs (lihat bagian Impor di bawah).
-- * skdr_mmwr_week_start(tahun, minggu) : tanggal awal minggu epid (MMWR, Minggu) - sama dengan dashboard.rs.
-- * laporan_ebs.dsb_*   : kolom generated (ringkasan data form) untuk dasbor.
-- * dash_ebs_reports    : Laporan EBS terkirim dalam bentuk kolom ebs_reports; id_ebs = -id (negatif = Laporan EBS lokal).
-- * laporan_ibs_baris   : baris matriks Laporan Agregat IBS (laporan x penyakit), dijaga trigger dari laporan_ibs.data.
-- * dash_ibs_rows       : baris matriks IBS terkirim (kasus, kematian, lab + metadata alert untuk laporan hasil impor).
-- * dash_ibs_fakta      : bentuk kolom skdr_alert_fakta (seksi Alert, epi curve, lab, klaster).
-- * dash_ibs_cases      : bentuk kolom pe_cases tertimbang (kolom n) untuk KPI/tren/penyakit; dihitung skdr_nsum(n).
-- * dash_ibs_individu   : Laporan Individu IBS terkirim (satu pasien) dalam bentuk kolom pe_cases (id negatif).
-- * surveillance_reports: cabang 'ebs' -> dash_ebs_reports, cabang 'pe' (Form PE) diganti cabang 'ibs' (agregat IBS).
-- Data sinkron lama (ebs_reports, skdr_alerts) dan Form PE (pe_cases) tetap utuh.
-- Rollback: database/rollback/060_rollback.sql (hapus laporan hasil impor, view/tabel/fungsi baru; kembalikan surveillance_reports 035).
BEGIN;

CREATE OR REPLACE FUNCTION skdr_mmwr_week_start(y int, w int) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(y, 1, 4) - EXTRACT(DOW FROM make_date(y, 1, 4))::int + (GREATEST(w, 1) - 1) * 7
$$;

CREATE OR REPLACE FUNCTION skdr_jint(v text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN trim(COALESCE(v, '')) ~ '^[0-9]{1,9}$' THEN trim(v)::int ELSE 0 END
$$;

-- Jumlah tertimbang (kolom n) yang selalu mengembalikan 0, bukan NULL, bila tidak ada baris.
CREATE OR REPLACE AGGREGATE skdr_nsum(int) (SFUNC = int84pl, STYPE = int8, INITCOND = '0');

-- Kolom ringkas Laporan EBS untuk dasbor (generated, dihitung saat simpan) agar view tidak membongkar JSON per baris.
ALTER TABLE laporan_ebs
  ADD COLUMN IF NOT EXISTS dsb_jenis_unit text GENERATED ALWAYS AS (NULLIF(trim(data->>'jenis_unit'), '')) STORED,
  ADD COLUMN IF NOT EXISTS dsb_kecamatan text GENERATED ALWAYS AS (NULLIF(trim(data->>'kecamatan'), '')) STORED,
  ADD COLUMN IF NOT EXISTS dsb_kecamatan_nama text GENERATED ALWAYS AS (NULLIF(trim(data->>'kecamatan_nama'), '')) STORED,
  ADD COLUMN IF NOT EXISTS dsb_status text GENERATED ALWAYS AS (NULLIF(trim(data->>'status_kejadian'), '')) STORED,
  ADD COLUMN IF NOT EXISTS dsb_verifikasi text GENERATED ALWAYS AS (NULLIF(trim(data->>'penyakit_terverifikasi'), '')) STORED,
  ADD COLUMN IF NOT EXISTS dsb_klb text GENERATED ALWAYS AS (
      CASE lower(trim(COALESCE(data->>'klb', ''))) WHEN 'ya' THEN '1' WHEN 'tidak' THEN '0' ELSE '-1' END) STORED,
  ADD COLUMN IF NOT EXISTS dsb_impor_id text GENERATED ALWAYS AS (data #>> '{_impor,id_ebs}') STORED,
  ADD COLUMN IF NOT EXISTS dsb_impor_update text GENERATED ALWAYS AS (data #>> '{_impor,update_date}') STORED,
  ADD COLUMN IF NOT EXISTS dsb_impor_disease_id int GENERATED ALWAYS AS (
      CASE WHEN (data #>> '{_impor,disease_id}') ~ '^[0-9]{1,9}$' THEN (data #>> '{_impor,disease_id}')::int END) STORED;

CREATE OR REPLACE VIEW dash_ebs_reports AS
SELECT l.id, (-l.id)::bigint AS id_ebs, l.no_laporan AS no_ebs,
       p.name AS propinsi, k.name AS kota,
       l.dsb_kecamatan_nama AS distrik, l.dsb_jenis_unit AS kel_unit,
       NULLIF(trim(l.unit_nama), '') AS unit,
       p.code AS kode_depdagri_prop, k.kemendagri_code AS kode_depdagri_kota,
       l.dsb_kecamatan AS kode_depdagri_distrik, l.dsb_status AS sts_rumor,
       NULLIF(trim(l.penyakit_rumor), '') AS diagnosa, l.dsb_verifikasi AS verifikasi,
       GREATEST(COALESCE(l.jml_kasus, 0), 0) AS jml_kasus,
       LEAST(GREATEST(COALESCE(l.jml_kematian, 0), 0), GREATEST(COALESCE(l.jml_kasus, 0), 0)) AS jml_kematian,
       NULLIF(trim(l.data->>'kronologi'), '') AS kronologi,
       COALESCE(NULLIF(trim(l.data->>'pfr_uraian'), ''), NULLIF(trim(l.data #>> '{_impor,tindakan}'), '')) AS tindakan,
       NULLIF(trim(l.data #>> '{_impor,saran}'), '') AS saran,
       l.dsb_klb AS klb,
       COALESCE(k.latitude, p.latitude) AS latitude, COALESCE(k.longitude, p.longitude) AS longitude,
       COALESCE(l.tgl_laporan, (l.submitted_at AT TIME ZONE 'Asia/Jakarta')::date) AS tgl_laporan,
       (COALESCE(l.submitted_at, l.created_at) AT TIME ZONE 'Asia/Jakarta') AS create_date,
       -- update_date = pembaruan pertama setelah laporan masuk (respons 7-1-7): nilai asli API lama untuk laporan impor,
       -- updated_at untuk laporan form bila diubah setelah dikirim.
       CASE WHEN l.dsb_impor_id IS NOT NULL THEN NULLIF(l.dsb_impor_update, '')::timestamp
            WHEN l.updated_at > COALESCE(l.submitted_at, l.created_at) + interval '1 minute' THEN (l.updated_at AT TIME ZONE 'Asia/Jakarta') END AS update_date,
       l.province_id, l.kabkota_id,
       -- Laporan hasil impor memakai pemetaan penyakit sinkron lama (sama dengan dasbor sebelumnya).
       CASE WHEN l.dsb_impor_id IS NOT NULL THEN l.dsb_impor_disease_id
            ELSE COALESCE((SELECT a.disease_id FROM ebs_diagnosa_alias a WHERE a.diagnosa = lower(l.dsb_verifikasi)),
                          (SELECT a.disease_id FROM ebs_diagnosa_alias a WHERE a.diagnosa = lower(trim(l.penyakit_rumor)))) END AS disease_id,
       l.data AS raw, l.created_at AS first_synced_at, l.updated_at AS synced_at
FROM laporan_ebs l
LEFT JOIN master_locations p ON p.id = l.province_id
LEFT JOIN master_kabkota k ON k.id = l.kabkota_id
WHERE l.status = 'dikirim' AND l.deleted_at IS NULL;

-- Baris matriks Laporan Agregat IBS (satu baris per laporan x kode penyakit), dijaga trigger dari laporan_ibs
-- (kolom periode/wilayah/unit/status ikut disalin agar dasbor tidak perlu join ke laporan_ibs).
-- Kolom alert_id..klb_kode hanya terisi untuk laporan hasil impor Alert SKDR lama (data._impor.alert.<kode>).
CREATE TABLE IF NOT EXISTS laporan_ibs_baris (
  laporan_id     bigint NOT NULL REFERENCES laporan_ibs(id) ON DELETE CASCADE,
  kode           text   NOT NULL,
  aktif          boolean NOT NULL DEFAULT false,
  no_laporan     text,
  tahun          int,
  minggu         int,
  week_start     date,
  province_id    int,
  kabkota_id     int,
  unit_key       text,
  unit_nama      text,
  created_at     timestamptz,
  submitted_at   timestamptz,
  kasus          int    NOT NULL DEFAULT 0,
  kematian       int    NOT NULL DEFAULT 0,
  lab            int    NOT NULL DEFAULT 0,
  alert_id       bigint,
  sts_verif      boolean,
  tgl_verifikasi timestamp,
  is_klb         boolean,
  respon24_ok    boolean,
  ada_spesimen   boolean,
  spesimen       text,
  lab_kelas      text,
  klb_kode       text,
  PRIMARY KEY (laporan_id, kode)
);
CREATE INDEX IF NOT EXISTS idx_laporan_ibs_baris_minggu ON laporan_ibs_baris (week_start) WHERE aktif;

CREATE OR REPLACE FUNCTION laporan_ibs_baris_isi(p_id bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM laporan_ibs_baris WHERE laporan_id = p_id;
  INSERT INTO laporan_ibs_baris (laporan_id, kode, aktif, no_laporan, tahun, minggu, week_start, province_id, kabkota_id, unit_key,
                                 unit_nama, created_at, submitted_at, kasus, kematian, lab, alert_id, sts_verif, tgl_verifikasi,
                                 is_klb, respon24_ok, ada_spesimen, spesimen, lab_kelas, klb_kode)
  SELECT l.id, r.key,
         l.status = 'dikirim' AND l.deleted_at IS NULL AND l.tahun IS NOT NULL AND l.minggu IS NOT NULL,
         l.no_laporan, l.tahun, l.minggu, CASE WHEN l.tahun IS NOT NULL AND l.minggu IS NOT NULL THEN skdr_mmwr_week_start(l.tahun, l.minggu) END,
         l.province_id, l.kabkota_id, l.unit_key, NULLIF(trim(l.unit_nama), ''), l.created_at, COALESCE(l.submitted_at, l.updated_at),
         skdr_jint(r.value->>'kasus'), LEAST(skdr_jint(r.value->>'kematian'), skdr_jint(r.value->>'kasus')), skdr_jint(r.value->>'lab'),
         NULLIF(a->>'alert_id', '')::bigint, (a->>'sts_verif')::boolean, NULLIF(a->>'tgl_verifikasi', '')::timestamp,
         (a->>'is_klb')::boolean, (a->>'respon24_ok')::boolean, (a->>'ada_spesimen')::boolean, NULLIF(a->>'spesimen', ''),
         NULLIF(a->>'lab_kelas', ''), NULLIF(a->>'klb_kode', '')
  FROM laporan_ibs l
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(l.data->'rows') = 'object' THEN l.data->'rows' ELSE '{}'::jsonb END) r
  CROSS JOIN LATERAL (SELECT l.data #> ARRAY['_impor', 'alert', r.key] AS a) x
  WHERE l.id = p_id AND jsonb_typeof(r.value) = 'object'
    AND EXISTS (SELECT 1 FROM ibs_penyakit ip WHERE ip.kode = r.key AND NOT ip.is_total);
END $$;

CREATE OR REPLACE FUNCTION laporan_ibs_baris_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM laporan_ibs_baris_isi(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_laporan_ibs_baris ON laporan_ibs;
CREATE TRIGGER trg_laporan_ibs_baris AFTER INSERT OR UPDATE ON laporan_ibs
  FOR EACH ROW EXECUTE FUNCTION laporan_ibs_baris_trg();

SELECT laporan_ibs_baris_isi(l.id) FROM laporan_ibs l
WHERE NOT EXISTS (SELECT 1 FROM laporan_ibs_baris b WHERE b.laporan_id = l.id);

CREATE INDEX IF NOT EXISTS idx_laporan_ebs_dasbor ON laporan_ebs (tgl_laporan) WHERE status = 'dikirim' AND deleted_at IS NULL;

CREATE OR REPLACE VIEW dash_ibs_rows AS
SELECT b.laporan_id, b.no_laporan, b.tahun, b.minggu, b.week_start,
       b.province_id, b.kabkota_id, b.unit_key, b.unit_nama,
       ip.kode, ip.urutan, ip.nama, m.disease_id, COALESCE(m.is_case, true) AS is_case,
       b.kasus, b.kematian, b.lab,
       b.alert_id, b.sts_verif, b.tgl_verifikasi, b.is_klb, b.respon24_ok, b.ada_spesimen, b.spesimen, b.lab_kelas, b.klb_kode,
       b.created_at, b.submitted_at
FROM laporan_ibs_baris b
JOIN ibs_penyakit ip ON ip.kode = b.kode AND NOT ip.is_total AND ip.is_active
LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = ip.kode
WHERE b.aktif;
CREATE OR REPLACE VIEW dash_ibs_fakta AS
SELECT COALESCE(r.alert_id, -(r.laporan_id * 100 + r.urutan))::bigint AS alert_id, r.tahun, r.minggu, r.tahun * 100 + r.minggu AS yw,
       r.province_id, r.kabkota_id, r.disease_id, r.kode AS kode_penyakit, r.nama AS nama_penyakit,
       p.name AS provinsi, k.name AS kota, r.unit_nama AS unit, lower(trim(r.unit_nama)) AS unit_key, r.unit_key AS unit_id,
       r.kasus, r.kematian AS jml_kematian,
       COALESCE(k.latitude, p.latitude) AS latitude, COALESCE(k.longitude, p.longitude) AS longitude,
       COALESCE(r.ada_spesimen, r.lab > 0) AS ada_spesimen,
       COALESCE(r.spesimen, CASE WHEN r.lab > 0 THEN r.lab::text || ' kasus diperiksa lab' END) AS spesimen,
       COALESCE(r.lab_kelas, 'belum') AS lab_kelas, COALESCE(r.is_klb, false) AS is_klb, COALESCE(r.respon24_ok, false) AS respon24_ok,
       r.is_case, COALESCE(r.sts_verif, false) AS sts_verif, r.tgl_verifikasi, r.klb_kode
FROM dash_ibs_rows r
LEFT JOIN master_locations p ON p.id = r.province_id
LEFT JOIN master_kabkota k ON k.id = r.kabkota_id
WHERE r.kasus > 0;

-- Bentuk pe_cases tertimbang: per baris matriks paling banyak dua baris (Meninggal = kematian, Sembuh = sisa kasus);
-- kolom n = jumlah kasus yang diwakili. Kode Rust menghitung skdr_nsum(c.n), bukan COUNT(*).
CREATE OR REPLACE VIEW dash_ibs_cases AS
SELECT (r.laporan_id * 1000 + r.urutan * 10 + o.k)::bigint AS id,
       r.no_laporan || '/' || r.kode AS no_pe,
       COALESCE((SELECT d.form_key FROM pe_form_definitions d WHERE d.disease_id = r.disease_id AND d.is_active ORDER BY d.version DESC LIMIT 1), 'ibs') AS form_key,
       0 AS definition_id, 1 AS form_version, r.disease_id, 'dikirim'::text AS status,
       jsonb_build_object('unit_pelapor', r.unit_nama, 'sumber', 'laporan_ibs', 'ibs_kode', r.kode, 'laporan_id', r.laporan_id) AS data,
       '[]'::jsonb AS errors, '[]'::jsonb AS warnings,
       CASE WHEN r.kode = '08DBT' THEN 'ghpr' ELSE 'suspek' END AS classification,
       'Laporan Agregat IBS'::text AS classification_basis, NULL::text AS classification_override, NULL::text AS override_reason,
       NULL::int AS cluster_id, NULL::text AS ebs_link, r.province_id, r.kabkota_id, 'dikirim'::text AS status_laporan,
       r.week_start AS tgl_laporan, NULL::date AS tgl_pe, NULL::date AS tgl_rumor, NULL::date AS onset_date, NULL::date AS first_visit_date,
       NULL::date AS death_date, o.outcome, NULL::text AS sex, NULL::int AS age_years, NULL::text AS patient_name, NULL::text AS nik,
       r.created_at, r.submitted_at AS updated_at, r.submitted_at, NULL::timestamptz AS verified_at, NULL::timestamptz AS finalized_at,
       NULL::timestamptz AS deleted_at, NULL::text AS deleted_by, o.n
FROM dash_ibs_rows r
CROSS JOIN LATERAL (VALUES (1, 'Meninggal'::text, r.kematian), (2, 'Sembuh'::text, r.kasus - r.kematian)) AS o(k, outcome, n)
WHERE r.kasus > 0 AND o.n > 0;
CREATE OR REPLACE VIEW dash_ibs_individu AS
SELECT (-l.id)::bigint AS id, l.no_laporan AS no_pe,
       COALESCE((SELECT d.form_key FROM pe_form_definitions d WHERE d.disease_id = m.disease_id AND d.is_active ORDER BY d.version DESC LIMIT 1), 'ibs') AS form_key,
       0 AS definition_id, 1 AS form_version, m.disease_id, 'dikirim'::text AS status,
       l.data || jsonb_build_object('unit_pelapor', l.unit_nama, 'sumber', 'laporan_ibs_individu') AS data,
       '[]'::jsonb AS errors, '[]'::jsonb AS warnings,
       CASE WHEN l.penyakit = '08DBT' THEN 'ghpr' ELSE 'suspek' END AS classification,
       'Laporan Individu IBS'::text AS classification_basis, NULL::text AS classification_override, NULL::text AS override_reason,
       NULL::int AS cluster_id, NULL::text AS ebs_link, l.province_id, l.kabkota_id, 'dikirim'::text AS status_laporan,
       COALESCE(l.tgl_periksa, skdr_mmwr_week_start(l.tahun, l.minggu)) AS tgl_laporan, NULL::date AS tgl_pe, NULL::date AS tgl_rumor,
       NULL::date AS onset_date, l.tgl_periksa AS first_visit_date,
       CASE WHEN (l.data->>'tgl_meninggal') ~ '^\d{4}-\d{2}-\d{2}$' THEN (l.data->>'tgl_meninggal')::date END AS death_date,
       CASE l.status_akhir WHEN 'Sehat' THEN 'Sembuh' ELSE l.status_akhir END AS outcome,
       CASE l.kelamin WHEN 'Pria' THEN 'Laki-laki' WHEN 'Wanita' THEN 'Perempuan' ELSE l.kelamin END AS sex,
       NULLIF(skdr_jint(l.data->>'umur_tahun'), 0) AS age_years, l.nama_pasien AS patient_name, NULL::text AS nik,
       l.created_at, l.updated_at, l.submitted_at, NULL::timestamptz AS verified_at, NULL::timestamptz AS finalized_at,
       NULL::timestamptz AS deleted_at, NULL::text AS deleted_by
FROM laporan_ibs_individu l
LEFT JOIN skdr_penyakit_map m ON m.kode_penyakit = l.penyakit
WHERE l.status = 'dikirim' AND l.deleted_at IS NULL;

CREATE OR REPLACE VIEW surveillance_reports AS
SELECT 'form'::text AS source, r.id::text AS id, r.disease_id, NULL::text AS diagnosa, r.location_id, r.kabkota_id, r.location_name,
       r.latitude, r.longitude, r.report_date, r.cases, r.deaths, r.is_reviewed, r.created_at, r.notes, NULL::text AS unit_name
FROM case_reports r
UNION ALL
SELECT 'ebs'::text, 'ebs-' || e.id_ebs, e.disease_id, e.diagnosa, e.province_id, e.kabkota_id, NULL::text,
       e.latitude, e.longitude, e.tgl_laporan, e.jml_kasus, e.jml_kematian,
       COALESCE(e.sts_rumor ILIKE 'Terverifikasi%', false), (e.create_date AT TIME ZONE 'Asia/Jakarta'), NULL::text, e.unit
FROM dash_ebs_reports e
UNION ALL
SELECT 'ibs'::text, 'ibs-' || r.laporan_id || '-' || r.kode, r.disease_id, r.nama, r.province_id, r.kabkota_id, NULL::text,
       COALESCE(k.latitude, p.latitude), COALESCE(k.longitude, p.longitude), r.week_start, r.kasus, r.kematian,
       true, r.submitted_at, NULL::text, r.unit_nama
FROM dash_ibs_rows r
LEFT JOIN master_kabkota k ON k.id = r.kabkota_id
LEFT JOIN master_locations p ON p.id = r.province_id
WHERE r.kasus > 0;

-- Teks Ringkasan Eksekutif & label sumber mengikuti sumber baru (cadangan baris lama di app_settings_bak_060).
CREATE TABLE IF NOT EXISTS app_settings_bak_060 AS SELECT key, value FROM app_settings WHERE key IN ('dashboard_executive', 'dashboard_sources');
UPDATE app_settings SET value = jsonb_set(jsonb_set(value::jsonb,
    '{texts,individual_def}', '"Laporan individu = Laporan Individu IBS (satu pasien) berstatus Terkirim."'),
    '{texts,footnote}', '"* Satu Laporan EBS bisa berisi lebih dari satu kasus, jadi jumlah laporan EBS tidak sama dengan jumlah kasus. Angka IBS berasal dari Laporan Agregat IBS (rekap mingguan unit) dan dihitung terpisah dari EBS."')::text,
  updated_at = now()
WHERE key = 'dashboard_executive' AND value::jsonb ? 'texts';
UPDATE app_settings SET value = jsonb_set(value::jsonb, '{sources,pe}', (value::jsonb->'sources'->'pe') || '{"label": "IBS", "unit": "kasus"}'::jsonb)::text, updated_at = now()
WHERE key = 'dashboard_sources' AND value::jsonb ? 'sources';

-- ===================== Impor dari API SKDR lama (sinkron lokal) ke matriks Laporan EBS / Laporan Agregat IBS =====================
-- Sumber: ebs_reports (sinkron API EBS SKDR lama) -> laporan_ebs; skdr_alerts + skdr_alert_fakta (sinkron API Alert SKDR lama,
-- per unit x minggu x penyakit) -> laporan_ibs (satu laporan per unit x minggu, baris matriks = penyakit yang ada alert-nya).
-- Laporan hasil impor ditandai data._impor (asal, id lama, nilai asli yang tidak punya kolom di form). Laporan yang dibuat
-- lewat form untuk unit x minggu yang sama selalu menang (tidak ditimpa). Dijalankan backend (impor_lama.rs) per
-- app_settings.laporan_impor_lama.interval_menit; inkremental memakai synced_at sejak impor sukses terakhir.
INSERT INTO app_settings (key, value) VALUES ('laporan_impor_lama',
  '{"enabled": true, "interval_menit": 30, "ibs_tahun_mulai": 2026, "ebs_tanggal_mulai": "2024-01-01", "nama_pengimpor": "Impor API SKDR lama"}')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS laporan_impor_lama_log (
  id          bigserial PRIMARY KEY,
  jenis       text NOT NULL,
  sejak       timestamptz,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ditambah    int NOT NULL DEFAULT 0,
  diperbarui  int NOT NULL DEFAULT 0,
  error       text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_laporan_ebs_impor ON laporan_ebs (dsb_impor_id) WHERE dsb_impor_id IS NOT NULL;

-- Satu baris ebs_reports -> data form Laporan EBS (kunci sama dengan lib/laporan/ebs.ts).
CREATE OR REPLACE FUNCTION skdr_ebs_lama_data(e ebs_reports) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'jenis_unit', NULLIF(trim(e.kel_unit), ''),
    'provinsi_id', e.province_id, 'kabkota_id', e.kabkota_id,
    'kecamatan', NULLIF(trim(e.kode_depdagri_distrik), ''), 'kecamatan_nama', initcap(NULLIF(trim(e.distrik), '')),
    'unit_pelapor', NULLIF(trim(e.unit), ''),
    'tgl_laporan', e.tgl_laporan::text,
    'penyakit_rumor', lower(NULLIF(trim(e.diagnosa), '')),
    'tgl_rumor', COALESCE(e.tgl_laporan, e.create_date::date)::text,
    'status_kejadian', CASE
        WHEN st ILIKE 'Terverifikasi dan sudah%' THEN 'Terverifikasi dan sudah dilakukan koordinasi lintas sektor'
        WHEN st ILIKE 'Terverifikasi Penyakit Infeksi Emerging%' THEN 'Terverifikasi Penyakit Infeksi Emerging'
        WHEN st ILIKE 'Terverifikasi%' THEN 'Terverifikasi'
        WHEN st ILIKE 'Dalam investigasi%' THEN 'Dalam investigasi'
        WHEN st ILIKE 'Discarded%' THEN 'Discarded' END,
    'penyakit_terverifikasi', CASE WHEN st ILIKE 'Terverifikasi%' THEN lower(NULLIF(trim(e.verifikasi), '')) END,
    'jml_kasus', GREATEST(COALESCE(e.jml_kasus, 0), 0), 'jml_kematian', GREATEST(COALESCE(e.jml_kematian, 0), 0),
    'kronologi', NULLIF(trim(e.kronologi), ''),
    'klb', CASE trim(COALESCE(e.klb, '')) WHEN '1' THEN 'Ya' WHEN '0' THEN 'Tidak' END,
    '_impor', jsonb_build_object('sumber', 'API EBS SKDR lama (ebs_reports)', 'id_ebs', e.id_ebs::text, 'no_ebs', e.no_ebs,
        'sts_rumor', NULLIF(st, ''), 'diagnosa', e.diagnosa, 'verifikasi', e.verifikasi, 'klb', e.klb,
        'tindakan', NULLIF(trim(e.tindakan), ''), 'saran', NULLIF(trim(e.saran), ''), 'disease_id', e.disease_id,
        'create_date', e.create_date, 'update_date', e.update_date)))
  FROM (SELECT trim(COALESCE(e.sts_rumor, '')) AS st) s
$$;

CREATE OR REPLACE FUNCTION skdr_impor_ebs_lama(p_sejak timestamptz, p_mulai date, p_nama text) RETURNS int[]
LANGUAGE plpgsql SET client_min_messages = warning AS $$
DECLARE v_ins int := 0; v_upd int := 0;
BEGIN
  DROP TABLE IF EXISTS _impor_ebs;
  CREATE TEMP TABLE _impor_ebs AS
  SELECT e.id_ebs, skdr_ebs_lama_data(e) AS d, COALESCE(e.tgl_laporan, e.create_date::date) AS tgl,
         (e.create_date AT TIME ZONE 'Asia/Jakarta') AS dibuat, (COALESCE(e.update_date, e.create_date) AT TIME ZONE 'Asia/Jakarta') AS diubah,
         e.province_id, e.kabkota_id, NULLIF(trim(e.unit), '') AS unit, GREATEST(COALESCE(e.jml_kasus, 0), 0) AS kasus,
         GREATEST(COALESCE(e.jml_kematian, 0), 0) AS mati, lower(NULLIF(trim(e.diagnosa), '')) AS rumor
  FROM ebs_reports e
  WHERE e.id_ebs IS NOT NULL AND COALESCE(e.tgl_laporan, e.create_date::date) >= p_mulai
    AND (p_sejak IS NULL OR e.synced_at >= p_sejak);

  UPDATE laporan_ebs l SET data = s.d, tgl_laporan = s.tgl, tgl_rumor = s.tgl, penyakit_rumor = s.rumor, province_id = s.province_id,
         kabkota_id = s.kabkota_id, dom_kabkota_id = s.kabkota_id, unit_nama = s.unit, jml_kasus = s.kasus, jml_kematian = s.mati,
         updated_at = now()
  FROM _impor_ebs s
  WHERE l.dsb_impor_id = s.id_ebs::text AND l.created_by IS NULL AND l.data IS DISTINCT FROM s.d;
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  DELETE FROM _impor_ebs s WHERE EXISTS (SELECT 1 FROM laporan_ebs l WHERE l.dsb_impor_id = s.id_ebs::text);

  -- Nomor laporan EBS-<tahun>-NNNNNN dari laporan_counters (dipesan sekaligus per tahun).
  DROP TABLE IF EXISTS _impor_no;
  CREATE TEMP TABLE _impor_no AS
  WITH n AS (SELECT EXTRACT(YEAR FROM tgl)::int AS y, count(*)::int AS c FROM _impor_ebs GROUP BY 1),
  r AS (INSERT INTO laporan_counters (jenis, year, last_no) SELECT 'ebs', y, c FROM n
        ON CONFLICT (jenis, year) DO UPDATE SET last_no = laporan_counters.last_no + EXCLUDED.last_no
        RETURNING year, last_no)
  SELECT r.year AS y, r.last_no - n.c AS base FROM r JOIN n ON n.y = r.year;

  WITH ins AS (
    INSERT INTO laporan_ebs (no_laporan, status, data, tgl_laporan, tgl_rumor, penyakit_rumor, province_id, kabkota_id, dom_kabkota_id,
                             unit_nama, jml_kasus, jml_kematian, created_by_name, created_at, updated_at, submitted_at)
    SELECT 'EBS-' || q.y || '-' || lpad((b.base + q.rn)::text, 6, '0'), 'dikirim', q.d, q.tgl, q.tgl, q.rumor, q.province_id, q.kabkota_id,
           q.kabkota_id, q.unit, q.kasus, q.mati, p_nama, q.dibuat, q.diubah, q.dibuat
    FROM (SELECT s.*, EXTRACT(YEAR FROM s.tgl)::int AS y,
                 row_number() OVER (PARTITION BY EXTRACT(YEAR FROM s.tgl) ORDER BY s.dibuat, s.id_ebs) AS rn FROM _impor_ebs s) q
    JOIN _impor_no b ON b.y = q.y
    RETURNING id, dsb_impor_id AS id_ebs, submitted_at)
  INSERT INTO laporan_events (jenis, laporan_id, event, note, actor, created_at)
  SELECT 'ebs', id, 'dikirim', 'Diimpor dari API EBS SKDR lama (id_ebs ' || id_ebs || ')', p_nama, submitted_at FROM ins;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  DROP TABLE IF EXISTS _impor_ebs; DROP TABLE IF EXISTS _impor_no;
  RETURN ARRAY[v_ins, v_upd];
END $$;

CREATE OR REPLACE FUNCTION skdr_impor_ibs_lama(p_sejak timestamptz, p_tahun int, p_nama text) RETURNS int[]
LANGUAGE plpgsql SET client_min_messages = warning AS $$
DECLARE v_ins int := 0; v_upd int := 0;
BEGIN
  DROP TABLE IF EXISTS _impor_a;
  CREATE TEMP TABLE _impor_a AS
  SELECT f.alert_id, f.tahun, f.minggu, f.province_id, f.kabkota_id, f.kode_penyakit AS kode, f.unit, f.kasus, f.jml_kematian,
         f.ada_spesimen, f.spesimen, f.lab_kelas, f.is_klb, f.respon24_ok, f.sts_verif, f.tgl_verifikasi, f.klb_kode,
         s.kategori_unit, NULLIF(trim(s.kode_unit), '') AS kode_unit, s.unit_id, s.kecamatan, s.synced_at,
         COALESCE(NULLIF(trim(s.kode_unit), ''), lower(trim(f.unit)) || '|' || COALESCE(f.kabkota_id::text, '')) AS ukey
  FROM skdr_alert_fakta f JOIN skdr_alerts s ON s.id = f.alert_id
  JOIN ibs_penyakit ip ON ip.kode = f.kode_penyakit AND NOT ip.is_total
  WHERE f.tahun >= p_tahun AND f.minggu BETWEEN 1 AND 53 AND COALESCE(f.kasus, 0) > 0 AND NULLIF(trim(f.unit), '') IS NOT NULL;
  IF p_sejak IS NOT NULL THEN
    DELETE FROM _impor_a a WHERE NOT EXISTS (SELECT 1 FROM _impor_a b WHERE b.ukey = a.ukey AND b.tahun = a.tahun AND b.minggu = a.minggu AND b.synced_at >= p_sejak);
  END IF;

  DROP TABLE IF EXISTS _impor_ibs;
  CREATE TEMP TABLE _impor_ibs AS
  WITH k AS (
    SELECT ukey, tahun, minggu, kode, sum(kasus)::int AS kasus, LEAST(sum(COALESCE(jml_kematian, 0)), sum(kasus))::int AS mati,
           (array_agg(jsonb_strip_nulls(jsonb_build_object('alert_id', alert_id, 'sts_verif', sts_verif, 'tgl_verifikasi', tgl_verifikasi,
                'is_klb', is_klb, 'respon24_ok', respon24_ok, 'ada_spesimen', ada_spesimen, 'spesimen', NULLIF(trim(spesimen), ''),
                'lab_kelas', lab_kelas, 'klb_kode', klb_kode)) ORDER BY alert_id DESC))[1] AS meta,
           max(tgl_verifikasi) AS tv
    FROM _impor_a GROUP BY 1, 2, 3, 4),
  u AS (
    SELECT DISTINCT ON (ukey, tahun, minggu) ukey, tahun, minggu, province_id, kabkota_id, unit, kategori_unit, kode_unit, unit_id,
           initcap(NULLIF(regexp_replace(trim(COALESCE(kecamatan, '')), '^KEC\.?\s*', '', 'i'), '')) AS kec
    FROM _impor_a ORDER BY ukey, tahun, minggu, alert_id DESC)
  SELECT u.ukey, u.tahun, u.minggu, u.province_id, u.kabkota_id, u.unit, sum(k.kasus)::int AS kasus, sum(k.mati)::int AS mati,
         COALESCE(max(k.tv) AT TIME ZONE 'Asia/Jakarta', (skdr_mmwr_week_start(u.tahun, u.minggu) + 7)::timestamp AT TIME ZONE 'Asia/Jakarta') AS dikirim,
         jsonb_strip_nulls(jsonb_build_object(
           'jenis_unit', NULLIF(trim(u.kategori_unit), ''), 'provinsi_id', u.province_id, 'kabkota_id', u.kabkota_id,
           'kecamatan_nama', u.kec, 'unit_pelapor', trim(u.unit), 'unit_kode', u.kode_unit, 'tahun', u.tahun, 'minggu', u.minggu,
           'konfirmasi_nihil', false,
           'rows', jsonb_object_agg(k.kode, jsonb_build_object('kasus', k.kasus, 'kematian', k.mati)),
           '_impor', jsonb_build_object('sumber', 'API Alert SKDR lama (skdr_alerts)', 'unit_id', u.unit_id,
                                        'alert', jsonb_object_agg(k.kode, k.meta))))
         AS d
  FROM u JOIN k ON k.ukey = u.ukey AND k.tahun = u.tahun AND k.minggu = u.minggu
  GROUP BY u.ukey, u.tahun, u.minggu, u.province_id, u.kabkota_id, u.unit, u.kategori_unit, u.kode_unit, u.unit_id, u.kec;

  UPDATE laporan_ibs l SET data = s.d, unit_nama = trim(s.unit), province_id = s.province_id, kabkota_id = s.kabkota_id,
         total_kasus = s.kasus, total_kematian = s.mati, updated_at = now()
  FROM _impor_ibs s
  WHERE l.unit_key = s.ukey AND l.tahun = s.tahun AND l.minggu = s.minggu AND l.status = 'dikirim' AND l.deleted_at IS NULL
    AND l.created_by IS NULL AND l.data ? '_impor' AND l.data IS DISTINCT FROM s.d;
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  -- Laporan form (atau impor sebelumnya) untuk unit x minggu yang sama tidak ditimpa.
  DELETE FROM _impor_ibs s WHERE EXISTS (SELECT 1 FROM laporan_ibs l WHERE l.unit_key = s.ukey AND l.tahun = s.tahun AND l.minggu = s.minggu
                                          AND l.status = 'dikirim' AND l.deleted_at IS NULL);

  DROP TABLE IF EXISTS _impor_no;
  CREATE TEMP TABLE _impor_no AS
  WITH n AS (SELECT tahun AS y, count(*)::int AS c FROM _impor_ibs GROUP BY 1),
  r AS (INSERT INTO laporan_counters (jenis, year, last_no) SELECT 'ibs', y, c FROM n
        ON CONFLICT (jenis, year) DO UPDATE SET last_no = laporan_counters.last_no + EXCLUDED.last_no
        RETURNING year, last_no)
  SELECT r.year AS y, r.last_no - n.c AS base FROM r JOIN n ON n.y = r.year;

  WITH ins AS (
    INSERT INTO laporan_ibs (no_laporan, status, data, tahun, minggu, unit_key, unit_nama, province_id, kabkota_id, total_kasus,
                             total_kematian, total_kunjungan, created_by_name, created_at, updated_at, submitted_at)
    SELECT 'IBS-' || q.tahun || '-' || lpad((b.base + q.rn)::text, 6, '0'), 'dikirim', q.d, q.tahun, q.minggu, q.ukey, trim(q.unit),
           q.province_id, q.kabkota_id, q.kasus, q.mati, NULL, p_nama, q.dikirim, q.dikirim, q.dikirim
    FROM (SELECT s.*, row_number() OVER (PARTITION BY s.tahun ORDER BY s.minggu, s.ukey) AS rn FROM _impor_ibs s) q
    JOIN _impor_no b ON b.y = q.tahun
    RETURNING id, submitted_at)
  INSERT INTO laporan_events (jenis, laporan_id, event, note, actor, created_at)
  SELECT 'ibs', id, 'dikirim', 'Diimpor dari API Alert SKDR lama', p_nama, submitted_at FROM ins;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  DROP TABLE IF EXISTS _impor_a; DROP TABLE IF EXISTS _impor_ibs; DROP TABLE IF EXISTS _impor_no;
  RETURN ARRAY[v_ins, v_upd];
END $$;

-- Satu putaran impor (dipanggil backend). Advisory lock agar tidak berjalan ganda; watermark = mulai impor sukses terakhir - 2 jam.
CREATE OR REPLACE FUNCTION skdr_impor_lama_jalankan() RETURNS jsonb
LANGUAGE plpgsql SET client_min_messages = warning AS $$
DECLARE cfg jsonb; v_nama text; r int[]; v_sejak timestamptz; v_log bigint; hasil jsonb := '{}'::jsonb; j text;
BEGIN
  SELECT value::jsonb INTO cfg FROM app_settings WHERE key = 'laporan_impor_lama';
  IF cfg IS NULL OR NOT COALESCE((cfg->>'enabled')::boolean, false) THEN RETURN jsonb_build_object('skip', 'nonaktif'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('skdr_impor_lama')) THEN RETURN jsonb_build_object('skip', 'sedang berjalan'); END IF;
  v_nama := COALESCE(NULLIF(cfg->>'nama_pengimpor', ''), 'Impor API SKDR lama');
  FOREACH j IN ARRAY ARRAY['ebs', 'ibs'] LOOP
    SELECT max(started_at) - interval '2 hours' INTO v_sejak FROM laporan_impor_lama_log WHERE jenis = j AND error IS NULL AND finished_at IS NOT NULL;
    INSERT INTO laporan_impor_lama_log (jenis, sejak) VALUES (j, v_sejak) RETURNING id INTO v_log;
    IF j = 'ebs' THEN
      r := skdr_impor_ebs_lama(v_sejak, COALESCE(NULLIF(cfg->>'ebs_tanggal_mulai', '')::date, DATE '2024-01-01'), v_nama);
    ELSE
      r := skdr_impor_ibs_lama(v_sejak, COALESCE(NULLIF(cfg->>'ibs_tahun_mulai', '')::int, 2026), v_nama);
    END IF;
    UPDATE laporan_impor_lama_log SET finished_at = clock_timestamp(), ditambah = r[1], diperbarui = r[2] WHERE id = v_log;
    hasil := hasil || jsonb_build_object(j, jsonb_build_object('ditambah', r[1], 'diperbarui', r[2]));
  END LOOP;
  RETURN hasil;
END $$;
COMMIT;
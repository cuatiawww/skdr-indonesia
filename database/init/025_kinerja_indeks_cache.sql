-- PR 016 (bagian kinerja): indeks penutup (covering) untuk agregasi dasbor/analitik atas ebs_reports (~157 ribu baris, heap ~670 MB)
-- dan konfigurasi cache respons API singkat. Rollback: database/rollback/025_rollback.sql
-- Catatan produksi: migrasi berjalan dalam transaksi (db::run_migrations), sehingga CREATE INDEX mengunci tulis ebs_reports
-- selama pembuatan indeks (lokal ±2 detik). Untuk produksi, jalankan versi CONCURRENTLY secara manual sebelum deploy
-- (lihat docs/PR/016-...), lalu migrasi ini menjadi no-op karena IF NOT EXISTS.
BEGIN;

-- Satu indeks ramping (±20 MB) berisi semua kolom yang dibaca view surveillance_reports dan analytics.rs, sehingga
-- Postgres bisa memakai Index Only Scan alih-alih membaca seluruh heap. Kunci = ekspresi tanggal laporan yang sama
-- persis dengan view & EBS_DATE: COALESCE(tgl_laporan, create_date::date) (filter periode + ORDER BY tanggal DESC).
CREATE INDEX IF NOT EXISTS idx_ebs_reports_dash_cover
  ON ebs_reports ((COALESCE(tgl_laporan, create_date::date)) DESC)
  INCLUDE (tgl_laporan, create_date, synced_at, disease_id, diagnosa, verifikasi, province_id, kabkota_id,
           latitude, longitude, jml_kasus, jml_kematian, sts_rumor, id_ebs);

-- Kasus PE per penyakit (halaman /penyakit/[kode]); tabel kecil tetapi akan tumbuh.
CREATE INDEX IF NOT EXISTS idx_pe_cases_disease_active ON pe_cases (disease_id, tgl_laporan) WHERE deleted_at IS NULL;

ANALYZE ebs_reports;
ANALYZE pe_cases;

-- Cache respons GET dasbor/analitik (dibaca saat backend start; ubah nilai lalu restart backend). ttl_seconds = 0 mematikan cache.
CREATE TABLE IF NOT EXISTS app_settings_bak_025 AS SELECT * FROM app_settings WHERE key = 'api_cache';
INSERT INTO app_settings (key, value, updated_at) VALUES ('api_cache', '{
  "ttl_seconds": 30,
  "prefixes": ["/api/v1/public-dashboard", "/api/v1/kpi-snapshot", "/api/v1/dashboard/executive", "/api/v1/analytics/"]
}', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;

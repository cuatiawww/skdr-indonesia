-- PR 012: update indicator status in dashboard_executive.indicators (shown on /dokumentasi → Status Indikator)
-- after the trend/heatmap charts and Penyakit pages shipped. Backup in app_settings_bak_022.
CREATE TABLE IF NOT EXISTS app_settings_bak_022 AS SELECT key, value FROM app_settings WHERE key = 'dashboard_executive';
UPDATE app_settings SET value = jsonb_set(value::jsonb, '{indicators}', (
  SELECT jsonb_agg(CASE i->>'no'
    WHEN '19' THEN i || '{"status":"tersedia","note":"Card menautkan ke halaman Penyakit (/penyakit/[kode]) dan daftar Form PE."}'
    WHEN '50–58' THEN i || '{"status":"sebagian","note":"Choropleth per penyakit dengan drill-down provinsi → kab/kota di halaman Penyakit; kelas warna 5 tingkat (skala akar), belum kuartil. Peta utama dasbor tetap peta titik."}'
    WHEN '59–64' THEN i || '{"status":"tersedia","note":"Tren mingguan per penyakit (EBS dan Kasus PE terpisah) dan heatmap minggu epid × provinsi di dasbor; kurva epidemi di halaman Penyakit."}'
    WHEN '65–69, 72–75' THEN i || '{"status":"sebagian","note":"Kurva epidemi per penyakit tersedia (halaman Penyakit); tampilan klaster (pe_clusters) dan status aktif/selesai (No. 68) belum."}'
    ELSE i END ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb -> 'indicators') WITH ORDINALITY AS x(i, ord)))::text,
  updated_at = now()
WHERE key = 'dashboard_executive';

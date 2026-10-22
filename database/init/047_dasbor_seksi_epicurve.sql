-- PR 022: urutan & visibilitas seksi Dasbor Utama (heatmap disembunyikan, tidak dihapus) dan parameter epi curve / 7-1-7.
-- Rollback: rollback/047_rollback.sql
BEGIN;
INSERT INTO app_settings (key, value) VALUES ('dashboard_sections', '{
  "order": ["ringkasan","cfr","alert","t717","laboratorium","wilayah","tren","klaster","nar"],
  "labels": {"ringkasan":"Ringkasan","cfr":"CFR","alert":"Alert","t717":"7-1-7","laboratorium":"Laboratorium","wilayah":"Sebaran wilayah","tren":"Tren","klaster":"Klaster dan epi curve","nar":"NAR-SKDR"},
  "hidden": ["heatmap"]
}') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('epicurve_config', '{"ma_weeks":4,"baseline_weeks":8,"sd_k":2,"top_groups":8,"t717_notify_days":1}')
ON CONFLICT (key) DO NOTHING;
COMMIT;

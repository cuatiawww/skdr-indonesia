-- PR 022: batas kasus per alert yang dianggap wajar. Alert di atasnya (contoh 21.111.221 kasus ISPA satu unit satu minggu)
-- dikeluarkan dari jumlah di epi curve / Alert / CFR dan ditampilkan sebagai "perlu dicek". Data sumber tidak diubah.
-- Rollback: rollback/048_rollback.sql
UPDATE app_settings SET value = (value::jsonb || '{"max_kasus_per_alert": 50000}'::jsonb)::text WHERE key = 'epicurve_config';

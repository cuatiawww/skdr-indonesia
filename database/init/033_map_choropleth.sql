-- PR 018: kelas & warna choropleth Peta Sebaran (5 kelas: 0 / 1 / 2–3 / 4 / 5+), ramp teal berurutan.
-- Latar peta terang: kelas 0 paling redup (mendekati latar), 5+ teal paling pekat. Dibaca frontend via /api/v1/console/settings.
-- Idempoten. Rollback: rollback/033_rollback.sql
INSERT INTO app_settings (key, value) VALUES ('map_choropleth', '{"classes":[
 {"min":0,"max":0,"label":"0","color":"#E3ECEA"},
 {"min":1,"max":1,"label":"1","color":"#B9DDD6"},
 {"min":2,"max":3,"label":"2–3","color":"#7CC4B8"},
 {"min":4,"max":4,"label":"4","color":"#3A9E90"},
 {"min":5,"max":null,"label":"5+","color":"#0F6E64"}]}')
ON CONFLICT (key) DO NOTHING;
